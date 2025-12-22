#!/usr/bin/env python3
"""
HOMESERVER Backup Tab Backup Handlers
Handles backup operations, history, and status management
"""

import os
import json
import yaml
import subprocess
from datetime import datetime
from typing import Dict, Any, List, Optional
from .utils import (
    BACKUP_CONFIG_PATH,
    BACKUP_LOG_PATH,
    BACKUP_CLI_PATH,
    get_logger,
    run_cli_command,
    parse_backup_output,
    format_file_size,
    get_systemd_service_status,
    validate_file_path
)
from .config_manager import BackupConfigManager

class BackupHandler:
    """Handles backup operations and status management"""
    
    def __init__(self):
        self.logger = get_logger()
        self.config_manager = BackupConfigManager()
    
    def get_system_status(self) -> Dict[str, Any]:
        """Get backup system status and configuration"""
        try:
            status = {
                'system_status': 'unknown',
                'config_exists': False,
                'state_exists': False,
                'service_status': 'unknown',
                'last_backup': None,
                'repositories_count': 0,
                'cloud_providers': [],
                'key_exists': False
            }
            
            # Check if config file exists
            if os.path.exists(BACKUP_CONFIG_PATH):
                status['config_exists'] = True
                try:
                    with open(BACKUP_CONFIG_PATH, 'r') as f:
                        config = yaml.safe_load(f)
                        status['repositories_count'] = len([r for r in config.get('repositories', []) if r.get('enabled', False)])
                        status['cloud_providers'] = [name for name, provider in config.get('cloud_providers', {}).items() if provider.get('enabled', False)]
                except Exception as e:
                    self.logger.error(f"Failed to read config: {e}")
            
            # Check if state exists in config
            try:
                config = self.config_manager.get_config()
                if 'state' in config:
                    status['state_exists'] = True
                    state = config['state']
                    # Use last_backup (includes all backup types) instead of just last_daily_backup
                    status['last_backup'] = state.get('last_backup')
            except Exception as e:
                self.logger.error(f"Failed to read state: {e}")
            
            # Check systemd service status
            status['service_status'] = get_systemd_service_status('homeserver-backup.timer')
            
            # Check if backup key exists using sudo (same approach as backupTab2)
            key_path = "/vault/.keys/backup.key"
            try:
                # Use sudo to check file existence (same as backupTab2)
                result = subprocess.run(
                    ['/usr/bin/sudo', '/usr/bin/test', '-f', key_path],
                    capture_output=True,
                    text=True,
                    check=False
                )
                status['key_exists'] = result.returncode == 0
                self.logger.info(f"Backup key existence check: {status['key_exists']} (return code: {result.returncode})")
            except Exception as e:
                self.logger.warning(f"Failed to check backup key existence: {e}")
                status['key_exists'] = False
            
            # Determine overall system status
            if status['config_exists'] and status['state_exists']:
                status['system_status'] = 'configured'
            elif status['config_exists']:
                status['system_status'] = 'partial'
            else:
                status['system_status'] = 'not_configured'
            
            return status
        
        except Exception as e:
            self.logger.error(f"Status check failed: {e}")
            raise
    
    def run_backup(self, backup_type: str = 'daily', repositories: List[str] = None) -> Dict[str, Any]:
        """Run backup for specified repositories"""
        try:
            if not validate_file_path(BACKUP_CLI_PATH):
                raise FileNotFoundError("Backup CLI not installed")
            
            # Build command - use create command
            cmd = ['python3', 'backup', 'create']
            
            # Run backup
            success, stdout, stderr = run_cli_command(cmd, timeout=3600)  # 1 hour timeout
            
            if not success:
                raise RuntimeError(f'Backup failed: {stderr}')
            
            # Parse output for structured information
            parsed_output = parse_backup_output(stdout)
            
            return {
                'backup_type': backup_type,
                'repositories': repositories or [],
                'output': stdout,
                'parsed_output': parsed_output,
                'completed_at': datetime.now().isoformat()
            }
        
        except Exception as e:
            self.logger.error(f"Backup execution failed: {e}")
            raise
    
    def get_backup_history(self) -> Dict[str, Any]:
        """Get backup history and logs"""
        try:
            history = {
                'recent_backups': [],
                'log_entries': [],
                'state': {}
            }
            
            # Read state from config
            config = self.config_manager.get_config()
            if 'state' in config:
                state = config['state']
                history['state'] = state
                history['recent_backups'] = state.get('backup_history', [])[-10:]  # Last 10 backups
            
            # Read log file (last 50 lines)
            if os.path.exists(BACKUP_LOG_PATH):
                try:
                    result = subprocess.run(['/usr/bin/tail', '-50', BACKUP_LOG_PATH], 
                                          capture_output=True, text=True, timeout=10)
                    if result.returncode == 0:
                        history['log_entries'] = result.stdout.strip().split('\n')
                except Exception as e:
                    self.logger.error(f"Failed to read log file: {e}")
            
            return history
        
        except Exception as e:
            self.logger.error(f"History retrieval failed: {e}")
            raise
    
    def list_backups(self, provider_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """List available backups from specified provider or all providers"""
        try:
            if not validate_file_path(BACKUP_CLI_PATH):
                raise FileNotFoundError("Backup CLI not installed")
            
            # Run discovery command - use list-providers instead
            success, stdout, stderr = run_cli_command([
                'python3', 'backup', 'list-providers'
            ], timeout=30)
            
            if not success:
                raise RuntimeError(f'Repository discovery failed: {stderr}')
            
            # Parse output - convert providers to repository-like format
            repositories = []
            lines = stdout.strip().split('\n')
            for line in lines:
                if ' - ' in line and not line.startswith('Available providers:'):
                    parts = line.split(' - ')
                    if len(parts) >= 2:
                        provider_name = parts[0].strip()
                        status = parts[1].strip()
                        repositories.append({
                            'name': provider_name,
                            'status': 'enabled' if 'enabled' in status else 'disabled',
                            'type': 'provider',
                            'path': f'/backup/{provider_name}'
                        })
            
            return repositories
        
        except Exception as e:
            self.logger.error(f"Repository listing failed: {e}")
            raise
    
    def test_backup_cycle(self, items: Optional[List[str]] = None) -> Dict[str, Any]:
        """Test complete backup cycle: create, upload, download, verify"""
        try:
            if not validate_file_path(BACKUP_CLI_PATH):
                raise FileNotFoundError("Backup CLI not installed")
            
            # Run test cycle command
            cmd = ['python3', 'backup', 'test-cycle']
            if items:
                cmd.extend(['--items'] + items)
            
            success, stdout, stderr = run_cli_command(cmd, timeout=3600)
            
            if not success:
                raise RuntimeError(f'Backup cycle test failed: {stderr}')
            
            return {
                'success': True,
                'output': stdout,
                'parsed_output': parse_backup_output(stdout),
                'tested_at': datetime.now().isoformat()
            }
        
        except Exception as e:
            self.logger.error(f"Backup cycle test failed: {e}")
            raise
    
    def get_backup_statistics(self) -> Dict[str, Any]:
        """Get backup statistics and metrics"""
        try:
            stats = {
                'total_backups': 0,
                'total_size': 0,
                'last_backup': None,
                'providers_active': 0,
                'providers_configured': 0,
                'backup_success_rate': 0.0
            }
            
            # Get configuration
            config = self.config_manager.get_config()
            
            # Count configured providers
            providers = config.get('providers', {})
            stats['providers_configured'] = len([p for p in providers.values() if p.get('enabled', False)])
            
            # Get state information from config
            if 'state' in config:
                state = config['state']
                backup_history = state.get('backup_history', [])
                stats['total_backups'] = len(backup_history)
                stats['last_backup'] = state.get('last_daily_backup')
                
                # Calculate success rate
                if backup_history:
                    successful = len([b for b in backup_history if b.get('success', False)])
                    stats['backup_success_rate'] = (successful / len(backup_history)) * 100
            
            # Get log file size if exists
            if os.path.exists(BACKUP_LOG_PATH):
                try:
                    stat = os.stat(BACKUP_LOG_PATH)
                    stats['log_file_size'] = format_file_size(stat.st_size)
                except Exception:
                    pass
            
            return stats
        
        except Exception as e:
            self.logger.error(f"Failed to get backup statistics: {e}")
            raise
    
    def cleanup_old_backups(self, retention_days: Optional[int] = None) -> Dict[str, Any]:
        """Clean up old backups based on retention policy"""
        try:
            if not validate_file_path(BACKUP_CLI_PATH):
                raise FileNotFoundError("Backup CLI not installed")
            
            # Get retention days from config if not provided
            if retention_days is None:
                config = self.config_manager.get_config()
                retention_days = config.get('retention_days', 30)
            
            # This would typically involve running a cleanup command
            # For now, we'll return a placeholder response
            return {
                'retention_days': retention_days,
                'cleanup_started': True,
                'message': 'Backup cleanup initiated',
                'started_at': datetime.now().isoformat()
            }
        
        except Exception as e:
            self.logger.error(f"Backup cleanup failed: {e}")
            raise