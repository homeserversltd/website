#!/usr/bin/env python3
"""
HOMESERVER Backup Tab Schedule Handlers
Handles backup schedule management and cron job operations
"""

import os
import subprocess
import yaml
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import croniter
from .utils import (
    BACKUP_CONFIG_PATH,
    get_logger,
    run_cli_command,
    validate_file_path
)
from .config_manager import BackupConfigManager
from .src.service.backup_service import BackupService
from .src.utils.config_manager import BACKUP_SCRIPT_PATH

class ScheduleHandler:
    """Handles backup schedule management using cron jobs"""
    
    def __init__(self):
        self.logger = get_logger()
        self.config_manager = BackupConfigManager()
        self.backup_service = BackupService()
    
    def _calculate_next_run(self, cron_schedule: str) -> Optional[str]:
        """Calculate the next run time for a cron schedule."""
        try:
            if not cron_schedule:
                return None
            
            # Create cron iterator
            cron = croniter.croniter(cron_schedule, datetime.now())
            next_run = cron.get_next(datetime)
            
            # Format as ISO string
            return next_run.isoformat()
            
        except Exception as e:
            self.logger.warning(f"Failed to calculate next run time for schedule '{cron_schedule}': {e}")
            return None
    
    def get_schedule_status(self) -> Dict[str, Any]:
        """Get backup schedule configuration and status using cron"""
        try:
            # Get cron status from backup service
            result = self.backup_service.get_cron_status()
            
            # Get stored schedule configuration from config file
            config = self.config_manager.get_config()
            stored_schedule_config = config.get('schedule', {})
            
            if result["success"]:
                status = result["status"]
                
                # Calculate next run time if schedule is enabled
                next_run = None
                if status['enabled'] and status['schedule']:
                    next_run = self._calculate_next_run(status['schedule'])
                
                # Merge cron status with stored schedule configuration
                schedule_config = {
                    'enabled': status['enabled'],
                    'schedule': status['schedule'],
                    'type': 'cron',
                    # Include stored configuration fields
                    'frequency': stored_schedule_config.get('frequency'),
                    'hour': stored_schedule_config.get('hour'),
                    'minute': stored_schedule_config.get('minute'),
                    'dayOfWeek': stored_schedule_config.get('dayOfWeek'),
                    'dayOfMonth': stored_schedule_config.get('dayOfMonth'),
                    'activeBackupType': stored_schedule_config.get('activeBackupType'),
                    'backupType': stored_schedule_config.get('backupType'),
                    'time': stored_schedule_config.get('time')
                }
                
                schedule = {
                    'timer_status': 'active' if status['enabled'] else 'inactive',
                    'cron_status': 'enabled' if status['enabled'] else 'disabled',
                    'schedule': status['schedule'],
                    'cron_file': status['cron_file'],
                    'file_exists': status['exists'],
                    'backup_script': status['backup_script'],
                    'script_executable': status['script_executable'],
                    'template_file': status['template_file'],
                    'template_exists': status['template_exists'],
                    'next_run': next_run or 'Not scheduled',
                    'last_run': 'Check backup logs for last run',
                    'schedule_config': schedule_config
                }
            else:
                schedule = {
                    'timer_status': 'failed',
                    'cron_status': 'error',
                    'error': result['error'],
                    'schedule': None,
                    'cron_file': '/etc/cron.d/homeserver-backup',
                    'file_exists': False,
                    'backup_script': BACKUP_SCRIPT_PATH,
                    'script_executable': False,
                    'next_run': None,
                    'last_run': None,
                    'schedule_config': {
                        'enabled': False,
                        'schedule': None,
                        'type': 'cron',
                        # Include stored configuration fields even on error
                        'frequency': stored_schedule_config.get('frequency'),
                        'hour': stored_schedule_config.get('hour'),
                        'minute': stored_schedule_config.get('minute'),
                        'dayOfWeek': stored_schedule_config.get('dayOfWeek'),
                        'dayOfMonth': stored_schedule_config.get('dayOfMonth'),
                        'activeBackupType': stored_schedule_config.get('activeBackupType'),
                        'backupType': stored_schedule_config.get('backupType'),
                        'time': stored_schedule_config.get('time')
                    }
                }
            
            return schedule
        
        except Exception as e:
            self.logger.error(f"Schedule status retrieval failed: {e}")
            raise
    
    def update_schedule(self, action: str, schedule: str = None) -> Dict[str, Any]:
        """Update backup schedule using cron"""
        try:
            valid_actions = ['enable', 'disable', 'deploy', 'remove']
            if action not in valid_actions:
                raise ValueError(f'Unknown action: {action}. Valid actions: {valid_actions}')
            
            if action == 'enable' or action == 'deploy':
                if not schedule:
                    # Use default schedule if none provided
                    schedule = "0 2 * * *"  # Daily at 2 AM
                
                # Deploy cron schedule
                result = self.backup_service.deploy_cron_schedule(schedule)
                
                if result["success"]:
                    return {
                        'message': f'Cron schedule {action} successful',
                        'action': action,
                        'schedule': schedule,
                        'cron_status': 'enabled',
                        'cron_file': result.get('cron_file', '/etc/cron.d/homeserver-backup')
                    }
                else:
                    raise RuntimeError(f'Cron schedule {action} failed: {result["error"]}')
            
            elif action == 'disable' or action == 'remove':
                # Remove cron schedule
                result = self.backup_service.remove_cron_schedule()
                
                if result["success"]:
                    return {
                        'message': f'Cron schedule {action} successful',
                        'action': action,
                        'schedule': None,
                        'cron_status': 'disabled',
                        'previous_schedule': result.get('previous_schedule')
                    }
                else:
                    raise RuntimeError(f'Cron schedule {action} failed: {result["error"]}')
        
        except Exception as e:
            self.logger.error(f"Schedule update failed: {e}")
            raise
    
    def set_schedule_config(self, schedule_config: Dict[str, Any]) -> Dict[str, Any]:
        """Set backup schedule configuration using cron"""
        try:
            # Validate schedule configuration
            if not self._validate_schedule_config(schedule_config):
                raise ValueError("Invalid schedule configuration")
            
            # Convert frontend schedule config to cron expression
            cron_expression = self._convert_to_cron_expression(schedule_config)
            schedule_config['schedule'] = cron_expression
            
            # Update configuration file
            config = self.config_manager.get_config()
            config['schedule'] = schedule_config
            
            success = self.config_manager.update_config(config)
            if not success:
                raise RuntimeError("Failed to update schedule configuration")
            
            # Deploy cron schedule if enabled
            if schedule_config.get('enabled', False) and cron_expression:
                cron_result = self.backup_service.deploy_cron_schedule(cron_expression)
                if not cron_result["success"]:
                    self.logger.warning(f"Failed to deploy cron schedule: {cron_result['error']}")
            elif not schedule_config.get('enabled', False):
                # Remove cron schedule if disabled
                cron_result = self.backup_service.remove_cron_schedule()
                if not cron_result["success"]:
                    self.logger.warning(f"Failed to remove cron schedule: {cron_result['error']}")
            
            return {
                'message': 'Schedule configuration updated successfully',
                'schedule_config': schedule_config,
                'cron_deployed': schedule_config.get('enabled', False),
                'updated_at': datetime.now().isoformat()
            }
        
        except Exception as e:
            self.logger.error(f"Schedule configuration update failed: {e}")
            raise
    
    def get_schedule_history(self) -> Dict[str, Any]:
        """Get schedule execution history"""
        try:
            history = {
                'recent_executions': [],
                'failed_executions': [],
                'success_rate': 0.0
            }
            
            # Get journalctl output for the timer
            try:
                result = subprocess.run([
                    'journalctl', 
                    '-u', self.timer_name,
                    '--since', '30 days ago',
                    '--no-pager',
                    '-o', 'json'
                ], capture_output=True, text=True, timeout=30)
                
                if result.returncode == 0:
                    lines = result.stdout.strip().split('\n')
                    executions = []
                    
                    for line in lines:
                        try:
                            entry = eval(line)  # JSON-like output from journalctl
                            if 'MESSAGE' in entry:
                                executions.append({
                                    'timestamp': entry.get('__REALTIME_TIMESTAMP', ''),
                                    'message': entry.get('MESSAGE', ''),
                                    'priority': entry.get('PRIORITY', 0)
                                })
                        except Exception:
                            continue
                    
                    history['recent_executions'] = executions[-20:]  # Last 20 executions
                    
                    # Calculate success rate
                    total_executions = len(executions)
                    successful_executions = len([e for e in executions if 'successfully' in e.get('message', '').lower()])
                    
                    if total_executions > 0:
                        history['success_rate'] = (successful_executions / total_executions) * 100
            
            except Exception as e:
                self.logger.warning(f"Failed to get schedule history: {e}")
            
            return history
        
        except Exception as e:
            self.logger.error(f"Schedule history retrieval failed: {e}")
            raise
    
    def test_schedule(self) -> Dict[str, Any]:
        """Test the backup schedule by running it manually"""
        try:
            # Test cron deployment without actually deploying
            test_result = self.backup_service.test_cron_deployment()
            
            if test_result["success"]:
                return {
                    'message': 'Cron schedule test successful',
                    'status': 'success',
                    'tested_at': datetime.now().isoformat(),
                    'schedule': test_result.get('schedule'),
                    'backup_script': test_result.get('backup_script'),
                    'template_processed': True
                }
            else:
                return {
                    'message': f'Cron schedule test failed: {test_result["error"]}',
                    'status': 'error',
                    'tested_at': datetime.now().isoformat()
                }
        
        except Exception as e:
            self.logger.error(f"Schedule test failed: {e}")
            raise
    
    def _validate_schedule_config(self, schedule_config: Dict[str, Any]) -> bool:
        """Validate schedule configuration"""
        try:
            # Basic validation
            required_fields = ['frequency', 'time']
            for field in required_fields:
                if field not in schedule_config:
                    return False
            
            # Validate frequency
            valid_frequencies = ['daily', 'weekly', 'monthly', 'custom']
            if schedule_config['frequency'] not in valid_frequencies:
                return False
            
            # Validate time format (HH:MM)
            time_str = schedule_config['time']
            try:
                hour, minute = map(int, time_str.split(':'))
                if not (0 <= hour <= 23 and 0 <= minute <= 59):
                    return False
            except ValueError:
                return False
            
            # Validate custom cron expression if frequency is custom
            if schedule_config['frequency'] == 'custom':
                if 'cron_expression' not in schedule_config:
                    return False
                # Basic cron validation (5 fields)
                cron_parts = schedule_config['cron_expression'].split()
                if len(cron_parts) != 5:
                    return False
            
            return True
        
        except Exception:
            return False
    
    def _convert_to_cron_expression(self, schedule_config: Dict[str, Any]) -> str:
        """Convert frontend schedule configuration to cron expression"""
        try:
            frequency = schedule_config.get('frequency', 'daily')
            time_str = schedule_config.get('time', '02:00')
            
            # Parse time
            hour, minute = map(int, time_str.split(':'))
            
            if frequency == 'daily':
                # Daily: minute hour * * *
                return f"{minute} {hour} * * *"
            
            elif frequency == 'weekly':
                # Weekly: minute hour * * dayOfWeek (0=Sunday, 1=Monday, etc.)
                day_of_week = schedule_config.get('dayOfWeek', 0)
                return f"{minute} {hour} * * {day_of_week}"
            
            elif frequency == 'monthly':
                # Monthly: minute hour dayOfMonth * *
                day_of_month = schedule_config.get('dayOfMonth', 1)
                return f"{minute} {hour} {day_of_month} * *"
            
            elif frequency == 'custom':
                # Custom cron expression provided directly
                return schedule_config.get('cron_expression', '0 2 * * *')
            
            else:
                # Default to daily at 2 AM
                return '0 2 * * *'
                
        except Exception as e:
            self.logger.error(f"Failed to convert schedule to cron: {e}")
            # Return default daily schedule
            return '0 2 * * *'
    
    def get_available_schedules(self) -> Dict[str, Any]:
        """Get available schedule templates and options"""
        try:
            return {
                'frequencies': [
                    {'value': 'daily', 'label': 'Daily', 'description': 'Run backup every day'},
                    {'value': 'weekly', 'label': 'Weekly', 'description': 'Run backup once per week'},
                    {'value': 'monthly', 'label': 'Monthly', 'description': 'Run backup once per month'},
                    {'value': 'custom', 'label': 'Custom Cron', 'description': 'Use custom cron expression'}
                ],
                'time_slots': [
                    {'value': '00:00', 'label': 'Midnight'},
                    {'value': '01:00', 'label': '1:00 AM'},
                    {'value': '02:00', 'label': '2:00 AM'},
                    {'value': '03:00', 'label': '3:00 AM'},
                    {'value': '04:00', 'label': '4:00 AM'},
                    {'value': '05:00', 'label': '5:00 AM'},
                    {'value': '06:00', 'label': '6:00 AM'}
                ],
                'weekdays': [
                    {'value': '0', 'label': 'Sunday'},
                    {'value': '1', 'label': 'Monday'},
                    {'value': '2', 'label': 'Tuesday'},
                    {'value': '3', 'label': 'Wednesday'},
                    {'value': '4', 'label': 'Thursday'},
                    {'value': '5', 'label': 'Friday'},
                    {'value': '6', 'label': 'Saturday'}
                ],
                'cron_examples': {
                    'daily_at_2am': '0 2 * * *',
                    'weekly_monday_3am': '0 3 * * 1',
                    'monthly_first_4am': '0 4 1 * *',
                    'every_6_hours': '0 */6 * * *'
                }
            }
        
        except Exception as e:
            self.logger.error(f"Failed to get available schedules: {e}")
            raise