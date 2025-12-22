#!/usr/bin/env python3
"""
HOMESERVER Backup Service Middleman
Copyright (C) 2024 HOMESERVER LLC

Service that acts as a middleman between cron_manager.py and homeserver-backup.cron template.
Handles cron job deployment, template processing, and system integration.
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List

# Add src to path for imports
current_dir = Path(__file__).parent
src_dir = current_dir.parent
sys.path.insert(0, str(src_dir))

from ..utils.cron_manager import CronManager
from ..utils.logger import get_logger
from ..utils.config_manager import BACKUP_SCRIPT_PATH

class BackupService:
    """Backup service middleman for cron job management."""
    
    def __init__(self, config_file: Optional[str] = None):
        self.config_file = config_file or "/etc/backupTab/settings.json"
        self.logger = get_logger()
        self.cron_manager = CronManager()
        self.template_file = current_dir / "homeserver-backup.cron"
        self.backup_script = BACKUP_SCRIPT_PATH
        
        # Ensure backup script exists and is executable
        self._ensure_backup_script()
    
    def _ensure_backup_script(self) -> bool:
        """Ensure the backup script exists and is executable."""
        backup_path = Path(self.backup_script)
        if not backup_path.exists():
            self.logger.error(f"Backup script not found: {self.backup_script}")
            return False
        
        # Make executable if not already
        if not os.access(backup_path, os.X_OK):
            try:
                os.chmod(backup_path, 0o755)
                self.logger.info(f"Made backup script executable: {self.backup_script}")
            except Exception as e:
                self.logger.error(f"Failed to make backup script executable: {e}")
                return False
        
        return True
    
    def deploy_cron_schedule(self, schedule: str) -> Dict[str, Any]:
        """Deploy cron schedule using the cron manager."""
        try:
            self.logger.info(f"Deploying cron schedule: {schedule}")
            
            # Validate schedule format
            if not self._validate_cron_schedule(schedule):
                return {
                    "success": False,
                    "error": "Invalid cron schedule format",
                    "schedule": schedule
                }
            
            # Deploy using cron manager
            success = self.cron_manager.deploy_cron_job(schedule)
            
            if success:
                # Verify deployment
                status = self.cron_manager.get_cron_status()
                self.logger.info(f"Cron schedule deployed successfully: {schedule}")
                
                return {
                    "success": True,
                    "message": f"Cron schedule deployed: {schedule}",
                    "schedule": schedule,
                    "cron_file": status["cron_file"],
                    "enabled": status["enabled"]
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to deploy cron schedule",
                    "schedule": schedule
                }
                
        except Exception as e:
            self.logger.error(f"Cron deployment failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "schedule": schedule
            }
    
    def remove_cron_schedule(self) -> Dict[str, Any]:
        """Remove cron schedule using the cron manager."""
        try:
            self.logger.info("Removing cron schedule...")
            
            # Get current status before removal
            status = self.cron_manager.get_cron_status()
            current_schedule = status.get("schedule")
            
            # Remove using cron manager
            success = self.cron_manager.remove_cron_job()
            
            if success:
                self.logger.info("Cron schedule removed successfully")
                return {
                    "success": True,
                    "message": "Cron schedule removed successfully",
                    "previous_schedule": current_schedule,
                    "enabled": False
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to remove cron schedule"
                }
                
        except Exception as e:
            self.logger.error(f"Cron removal failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_cron_status(self) -> Dict[str, Any]:
        """Get comprehensive cron status."""
        try:
            status = self.cron_manager.get_cron_status()
            
            # Add additional system information
            status.update({
                "backup_script": self.backup_script,
                "script_exists": Path(self.backup_script).exists(),
                "script_executable": os.access(self.backup_script, os.X_OK) if Path(self.backup_script).exists() else False,
                "template_file": str(self.template_file),
                "template_exists": self.template_file.exists(),
                "timestamp": datetime.now().isoformat()
            })
            
            return {
                "success": True,
                "status": status
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get cron status: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def test_cron_deployment(self, schedule: str = "0 2 * * *") -> Dict[str, Any]:
        """Test cron deployment without actually deploying."""
        try:
            self.logger.info(f"Testing cron deployment with schedule: {schedule}")
            
            # Validate schedule
            if not self._validate_cron_schedule(schedule):
                return {
                    "success": False,
                    "error": "Invalid cron schedule format",
                    "schedule": schedule
                }
            
            # Check if template exists
            if not self.template_file.exists():
                return {
                    "success": False,
                    "error": f"Template file not found: {self.template_file}",
                    "schedule": schedule
                }
            
            # Test template processing
            try:
                with open(self.template_file, 'r') as f:
                    template_content = f.read()
                
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                processed_content = template_content.format(
                    SCHEDULE=schedule,
                    TIMESTAMP=timestamp
                )
                
                return {
                    "success": True,
                    "message": "Cron deployment test successful",
                    "schedule": schedule,
                    "processed_template": processed_content,
                    "template_file": str(self.template_file),
                    "backup_script": self.backup_script
                }
                
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Template processing failed: {e}",
                    "schedule": schedule
                }
                
        except Exception as e:
            self.logger.error(f"Cron deployment test failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "schedule": schedule
            }
    
    def _validate_cron_schedule(self, schedule: str) -> bool:
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
    
    def get_available_schedules(self) -> Dict[str, Any]:
        """Get commonly used cron schedules."""
        schedules = {
            "daily_2am": "0 2 * * *",
            "daily_3am": "0 3 * * *",
            "daily_4am": "0 4 * * *",
            "weekly_sunday_2am": "0 2 * * 0",
            "weekly_monday_2am": "0 2 * * 1",
            "monthly_1st_2am": "0 2 1 * *",
            "every_6_hours": "0 */6 * * *",
            "every_12_hours": "0 */12 * * *",
            "custom": "custom"
        }
        
        return {
            "success": True,
            "schedules": schedules,
            "description": {
                "daily_2am": "Daily at 2:00 AM",
                "daily_3am": "Daily at 3:00 AM", 
                "daily_4am": "Daily at 4:00 AM",
                "weekly_sunday_2am": "Weekly on Sunday at 2:00 AM",
                "weekly_monday_2am": "Weekly on Monday at 2:00 AM",
                "monthly_1st_2am": "Monthly on the 1st at 2:00 AM",
                "every_6_hours": "Every 6 hours",
                "every_12_hours": "Every 12 hours",
                "custom": "Custom schedule (user-defined)"
            }
        }

def main():
    """Main service entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="HOMESERVER Backup Service Middleman")
    parser.add_argument("--config", "-c", help="Configuration file path")
    parser.add_argument("--deploy-cron", help="Deploy cron schedule (e.g., '0 2 * * *')")
    parser.add_argument("--remove-cron", action="store_true", help="Remove cron schedule")
    parser.add_argument("--cron-status", action="store_true", help="Get cron status")
    parser.add_argument("--test-deploy", help="Test cron deployment without deploying")
    parser.add_argument("--available-schedules", action="store_true", help="Get available schedules")
    
    args = parser.parse_args()
    
    # Initialize service
    service = BackupService(args.config)
    
    try:
        if args.deploy_cron:
            result = service.deploy_cron_schedule(args.deploy_cron)
            print(json.dumps(result, indent=2))
            sys.exit(0 if result["success"] else 1)
        elif args.remove_cron:
            result = service.remove_cron_schedule()
            print(json.dumps(result, indent=2))
            sys.exit(0 if result["success"] else 1)
        elif args.cron_status:
            result = service.get_cron_status()
            print(json.dumps(result, indent=2))
            sys.exit(0 if result["success"] else 1)
        elif args.test_deploy:
            result = service.test_cron_deployment(args.test_deploy)
            print(json.dumps(result, indent=2))
            sys.exit(0 if result["success"] else 1)
        elif args.available_schedules:
            result = service.get_available_schedules()
            print(json.dumps(result, indent=2))
            sys.exit(0)
        else:
            parser.print_help()
            sys.exit(1)
    
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()