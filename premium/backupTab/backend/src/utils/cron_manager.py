#!/usr/bin/env python3
"""
HOMESERVER Backup Cron Manager Utility
Copyright (C) 2024 HOMESERVER LLC

Utility for managing backup cron schedules.
"""

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional
from datetime import datetime
from .logger import get_logger
from .config_manager import BACKUP_SCRIPT_PATH, BACKUP_LOG_PATH


class CronManager:
    """Manages backup cron schedule operations."""
    
    def __init__(self, cron_file: str = "/etc/cron.d/homeserver-backup"):
        self.cron_file = Path(cron_file)
        self.template_file = Path(__file__).parent.parent / "service" / "homeserver-backup.cron"
        self.logger = get_logger()
    
    def set_schedule(self, schedule: str) -> bool:
        """Set the backup cron schedule using template."""
        try:
            # Validate cron format (basic validation)
            parts = schedule.split()
            if len(parts) != 5:
                self.logger.error("Invalid cron format. Use: minute hour day month weekday")
                self.logger.error("Example: '0 2 * * *' for daily at 2 AM")
                return False
            
            # Load template and replace placeholders
            if not self.template_file.exists():
                self.logger.error(f"Template file not found: {self.template_file}")
                return False
            
            with open(self.template_file, 'r') as f:
                template_content = f.read()
            
            # Replace placeholders
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cron_content = template_content.format(
                SCHEDULE=schedule,
                TIMESTAMP=timestamp,
                BACKUP_SCRIPT_PATH=BACKUP_SCRIPT_PATH,
                BACKUP_LOG_PATH=BACKUP_LOG_PATH
            )
            
            # Write to temporary file first
            with tempfile.NamedTemporaryFile(mode='w', suffix='.cron', delete=False) as tmp_file:
                tmp_file.write(cron_content)
                tmp_file_path = tmp_file.name
            
            try:
                # Copy to cron directory using /usr/bin/sudo
                result = subprocess.run([
                    '/usr/bin/sudo', '/bin/cp', tmp_file_path, str(self.cron_file)
                ], capture_output=True, text=True, check=True)
                
                self.logger.info(f"Backup schedule set to: {schedule}")
                self.logger.info(f"Cron job deployed to: {self.cron_file}")
                return True
                
            finally:
                # Clean up temporary file
                os.unlink(tmp_file_path)
            
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Failed to deploy cron schedule: {e}")
            self.logger.error(f"stdout: {e.stdout}")
            self.logger.error(f"stderr: {e.stderr}")
            return False
        except Exception as e:
            self.logger.error(f"Failed to set backup schedule: {e}")
            return False
    
    def get_schedule(self) -> Optional[str]:
        """Get the current backup cron schedule."""
        try:
            # Check if cron file exists using /usr/bin/sudo
            result = subprocess.run([
                '/usr/bin/sudo', '/bin/cat', str(self.cron_file)
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                self.logger.info("No backup schedule found")
                return None
            
            lines = result.stdout.splitlines()
            
            # Find the cron line (skip comments)
            for line in lines:
                line = line.strip()
                if line and not line.startswith('#'):
                    parts = line.split()
                    if len(parts) >= 6:  # cron + command
                        schedule = ' '.join(parts[:5])
                        self.logger.info(f"Current backup schedule: {schedule}")
                        return schedule
            
            self.logger.info("No valid cron schedule found")
            return None
            
        except Exception as e:
            self.logger.error(f"Failed to get backup schedule: {e}")
            return None
    
    def disable_schedule(self) -> bool:
        """Disable the backup cron schedule."""
        try:
            # Check if cron file exists and remove it using /usr/bin/sudo
            result = subprocess.run([
                '/usr/bin/sudo', '/bin/rm', str(self.cron_file)
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                self.logger.info("Backup schedule disabled")
                return True
            else:
                # File might not exist, which is also success
                self.logger.info("No backup schedule found to disable")
                return True
                
        except Exception as e:
            self.logger.error(f"Failed to disable backup schedule: {e}")
            return False
    
    def enable_schedule(self, schedule: str = "0 2 * * *") -> bool:
        """Enable the backup cron schedule with default daily at 2 AM."""
        return self.set_schedule(schedule)
    
    def is_schedule_enabled(self) -> bool:
        """Check if backup schedule is currently enabled."""
        try:
            # Check if cron file exists using /usr/bin/sudo
            result = subprocess.run([
                '/usr/bin/sudo', '/bin/cat', str(self.cron_file)
            ], capture_output=True, text=True)
            
            if result.returncode != 0:
                return False
            
            # Also check if there's a valid schedule
            return self.get_schedule() is not None
            
        except Exception:
            return False
    
    def deploy_cron_job(self, schedule: str) -> bool:
        """Deploy cron job with the specified schedule."""
        return self.set_schedule(schedule)
    
    def remove_cron_job(self) -> bool:
        """Remove the cron job completely."""
        return self.disable_schedule()
    
    def get_cron_status(self) -> dict:
        """Get comprehensive cron job status."""
        # Check if cron file exists using /usr/bin/sudo
        cron_exists = False
        try:
            result = subprocess.run([
                '/usr/bin/sudo', '/bin/cat', str(self.cron_file)
            ], capture_output=True, text=True)
            cron_exists = result.returncode == 0
        except Exception:
            cron_exists = False
        
        return {
            "enabled": self.is_schedule_enabled(),
            "schedule": self.get_schedule(),
            "cron_file": str(self.cron_file),
            "exists": cron_exists,
            "template_file": str(self.template_file),
            "template_exists": self.template_file.exists()
        }
    
    def validate_schedule(self, schedule: str) -> bool:
        """Validate cron schedule format."""
        try:
            parts = schedule.split()
            if len(parts) != 5:
                return False
            
            # Basic validation - each part should be valid cron syntax
            for part in parts:
                if not self._is_valid_cron_part(part):
                    return False
            
            return True
            
        except Exception:
            return False
    
    def _is_valid_cron_part(self, part: str) -> bool:
        """Validate a single cron part."""
        if part == '*':
            return True
        
        # Check for ranges (e.g., 1-5)
        if '-' in part:
            try:
                start, end = part.split('-', 1)
                int(start)
                int(end)
                return True
            except ValueError:
                return False
        
        # Check for lists (e.g., 1,3,5)
        if ',' in part:
            try:
                for item in part.split(','):
                    int(item)
                return True
            except ValueError:
                return False
        
        # Check for step values (e.g., */5)
        if '/' in part:
            try:
                base, step = part.split('/', 1)
                if base == '*':
                    int(step)
                    return True
                else:
                    int(base)
                    int(step)
                    return True
            except ValueError:
                return False
        
        # Check for simple numbers
        try:
            int(part)
            return True
        except ValueError:
            return False