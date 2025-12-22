#!/usr/bin/env python3
"""
HOMESERVER Backup Service Deployer
Copyright (C) 2024 HOMESERVER LLC

Deploys and configures the backup service with cron jobs and system integration.
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def deploy_backup_service():
    """Deploy the backup service."""
    print("Deploying HOMESERVER Backup Service...")
    
    # Define paths
    source_dir = Path(__file__).parent.parent.parent  # Go up to backend directory
    install_dir = Path("/var/www/homeserver/premium/backup")
    cron_file = Path("/etc/cron.d/homeserver-backup")
    
    try:
        # Create backup directory
        install_dir.mkdir(parents=True, exist_ok=True)
        print(f"Created backup directory: {install_dir}")
        
        # Copy backup files
        files_to_copy = [
            "backup",
            "src"
        ]
        
        for item in files_to_copy:
            source_path = source_dir / item
            dest_path = install_dir / item
            
            if source_path.is_dir():
                if dest_path.exists():
                    shutil.rmtree(dest_path)
                shutil.copytree(source_path, dest_path)
            else:
                shutil.copy2(source_path, dest_path)
            
            print(f"Copied {item} to {dest_path}")
        
        # Set permissions
        os.chmod(install_dir / "backup", 0o755)
        os.chmod(install_dir / "src" / "service" / "backup_service.py", 0o755)
        
        # Install cron job
        with open(cron_file, 'w') as f:
            f.write("# HOMESERVER Backup Cron Job\n")
            f.write("# Daily backup at 2 AM with random delay (0-59 minutes)\n")
            f.write(f"0 2 * * * www-data sleep $((RANDOM % 3600)) && {install_dir}/backup-venv create >> /var/log/homeserver/backup.log 2>&1\n")
        print(f"Installed cron job: {cron_file}")
        
        # Create log directory
        log_dir = Path("/var/log/homeserver")
        log_dir.mkdir(parents=True, exist_ok=True)
        os.chown(log_dir, 33, 33)  # www-data user/group
        print(f"Created log directory: {log_dir}")
        
        # Test backup system
        print("Testing backup system...")
        result = subprocess.run([
            str(install_dir / "backup-venv"), 
            "list-providers"
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✓ Backup service test successful")
        else:
            print(f"✗ Backup service test failed: {result.stderr}")
        
        print("Backup service installation completed successfully!")
        return True
        
    except Exception as e:
        print(f"ERROR: Installation failed: {e}")
        return False

def undeploy_backup_service():
    """Undeploy the backup service."""
    print("Undeploying HOMESERVER Backup Service...")
    
    try:
        # Remove cron job
        cron_file = Path("/etc/cron.d/homeserver-backup")
        if cron_file.exists():
            cron_file.unlink()
            print("Removed cron job")
        
        print("Backup service uninstalled successfully!")
        return True
        
    except Exception as e:
        print(f"ERROR: Uninstallation failed: {e}")
        return False

def main():
    """Main deployer entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="HOMESERVER Backup Service Deployer")
    parser.add_argument("--uninstall", action="store_true", help="Undeploy the service")
    
    args = parser.parse_args()
    
    if args.uninstall:
        success = undeploy_backup_service()
    else:
        success = deploy_backup_service()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()