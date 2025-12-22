#!/usr/bin/env python3
"""
HOMESERVER Backup Tab Provider Handlers
Handles provider-specific operations and management
"""

import os
from typing import Dict, Any, Optional
from .utils import (
    BACKUP_CLI_PATH,
    get_logger,
    run_cli_command,
    get_provider_status_from_output,
    validate_file_path,
    validate_config_schema
)
from .config_manager import BackupConfigManager

class ProviderHandler:
    """Handles provider-specific operations"""
    
    def __init__(self):
        self.logger = get_logger()
        self.config_manager = BackupConfigManager()
    
    def get_provider_schema(self) -> Dict[str, Any]:
        """Get comprehensive provider configuration schema for all available providers"""
        try:
            provider_schema = self.config_manager.get_provider_schema()
            global_schema = self.config_manager.get_global_schema()
            
            return {
                'providers': provider_schema,
                'global_config': global_schema,
                'provider_status_legend': {
                    'available': 'Fully functional and ready to use',
                    'future_development': 'Planned for future releases, currently disabled'
                },
                'field_types': {
                    'boolean': 'True/false value',
                    'string': 'Text value',
                    'integer': 'Whole number',
                    'number': 'Decimal number',
                    'array': 'List of values',
                    'object': 'Nested configuration object'
                },
                'validation_types': {
                    'pattern': 'Regular expression validation',
                    'min': 'Minimum value',
                    'max': 'Maximum value',
                    'min_items': 'Minimum number of items in array',
                    'options': 'List of allowed values'
                }
            }
        
        except Exception as e:
            self.logger.error(f"Provider schema retrieval failed: {e}")
            raise
    
    def get_provider_config(self, provider_name: str) -> Dict[str, Any]:
        """Get current configuration for a specific provider"""
        try:
            if not validate_file_path(BACKUP_CLI_PATH):
                raise FileNotFoundError("Backup CLI not installed")
            
            provider_config = self.config_manager.get_safe_provider_config(provider_name)
            if provider_config is None:
                raise ValueError(f"Provider {provider_name} not found")
            
            return {
                'provider_name': provider_name,
                'config': provider_config,
                'is_configured': bool(provider_config.get('enabled', False))
            }
        
        except Exception as e:
            self.logger.error(f"Provider config retrieval failed for {provider_name}: {e}")
            raise
    
    def update_provider_config(self, provider_name: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update configuration for a specific provider"""
        try:
            if not validate_file_path(BACKUP_CLI_PATH):
                raise FileNotFoundError("Backup CLI not installed")
            
            success = self.config_manager.update_provider_config(provider_name, updates)
            if not success:
                raise ValueError(f"Failed to update configuration for provider {provider_name}")
            
            return {
                'message': f'Configuration updated for provider {provider_name}',
                'provider_name': provider_name,
                'updated_fields': list(updates.keys())
            }
        
        except Exception as e:
            self.logger.error(f"Provider config update failed for {provider_name}: {e}")
            raise
    
    def test_provider_connection(self, provider_name: str) -> Dict[str, Any]:
        """Test connection to a specific provider"""
        try:
            if not validate_file_path(BACKUP_CLI_PATH):
                raise FileNotFoundError("Backup CLI not installed")
            
            # Run provider-specific connection test
            success, stdout, stderr = run_cli_command([
                'python3', 'backup', 'test-providers'
            ], timeout=60)
            
            # Parse results to find specific provider
            provider_result = get_provider_status_from_output(stdout, provider_name)
            
            return {
                'provider_name': provider_name,
                'connection_successful': provider_result,
                'output': stdout,
                'errors': stderr if not success else None
            }
        
        except Exception as e:
            self.logger.error(f"Provider connection test failed for {provider_name}: {e}")
            raise
    
    def list_providers(self) -> list:
        """List available providers with their status"""
        try:
            if not validate_file_path(BACKUP_CLI_PATH):
                raise FileNotFoundError("Backup CLI not installed")
            
            # Run discovery command - use list-providers instead
            success, stdout, stderr = run_cli_command([
                'python3', 'backup', 'list-providers'
            ], timeout=30)
            
            if not success:
                raise RuntimeError(f'Provider discovery failed: {stderr}')
            
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
            self.logger.error(f"Provider listing failed: {e}")
            raise
    
    def test_all_providers(self) -> Dict[str, bool]:
        """Test all enabled providers"""
        try:
            if not validate_file_path(BACKUP_CLI_PATH):
                raise FileNotFoundError("Backup CLI not installed")
            
            # Run connection test
            success, stdout, stderr = run_cli_command([
                'python3', 'backup', 'test-providers'
            ], timeout=60)
            
            if not success:
                raise RuntimeError(f'Provider test failed: {stderr}')
            
            # Parse results (simplified)
            connections = {}
            lines = stdout.strip().split('\n')
            for line in lines:
                if '✓' in line or '✗' in line:
                    if '✓' in line:
                        provider = line.split('✓')[1].strip()
                        connections[provider] = True
                    elif '✗' in line:
                        provider = line.split('✗')[1].strip()
                        connections[provider] = False
            
            return connections
        
        except Exception as e:
            self.logger.error(f"Cloud connection test failed: {e}")
            raise
    
    def get_provider_info(self, provider_name: str) -> Dict[str, Any]:
        """Get detailed information about a provider"""
        try:
            schema = self.config_manager.get_provider_schema()
            config = self.config_manager.get_safe_provider_config(provider_name)
            
            if provider_name not in schema:
                raise ValueError(f"Provider {provider_name} not found in schema")
            
            provider_schema = schema[provider_name]
            
            return {
                'name': provider_schema['name'],
                'description': provider_schema['description'],
                'status': provider_schema['status'],
                'config': config or {},
                'schema': provider_schema['config_fields'],
                'is_configured': bool(config.get('enabled', False)) if config else False
            }
        
        except Exception as e:
            self.logger.error(f"Failed to get provider info for {provider_name}: {e}")
            raise
    
    def validate_provider_config(self, provider_name: str, config: Dict[str, Any]) -> tuple[bool, list]:
        """Validate provider configuration against schema"""
        try:
            schema = self.config_manager.get_provider_schema()
            
            if provider_name not in schema:
                return False, [f"Provider {provider_name} not found"]
            
            provider_schema = schema[provider_name]['config_fields']
            return validate_config_schema(config, provider_schema)
        
        except Exception as e:
            self.logger.error(f"Failed to validate provider config for {provider_name}: {e}")
            return False, [str(e)]