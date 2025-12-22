#!/usr/bin/env python3
"""
HOMESERVER Restore Service
Copyright (C) 2024 HOMESERVER LLC

Professional restore system for HOMESERVER infrastructure.
Handles selective restoration from encrypted backup packages.
"""

import os
import sys
import json
import subprocess
import tempfile
import shutil
import tarfile
from pathlib import Path
from datetime import datetime
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

# Configuration
BACKUP_DIR = Path("/var/www/homeserver/backup")
TEMP_DIR = Path("/tmp/homeserver-restore")
LOG_FILE = Path("/var/log/homeserver/restore.log")
FAK_PATH = Path("/root/key/skeleton.key")
KEYMAN_DIR = Path("/vault/keyman")

# Ensure directories exist
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

def log(message):
    """Log message with timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_entry = f"[{timestamp}] {message}\n"
    print(log_entry.strip())
    with open(LOG_FILE, "a") as f:
        f.write(log_entry)

def get_fak_key():
    """Get Factory Access Key from skeleton.key."""
    try:
        with open(FAK_PATH, "r") as f:
            fak_text = f.read().strip()
        
        # Convert FAK to encryption key using PBKDF2
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'homeserver_backup_salt',
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(fak_text.encode()))
        return key
    except Exception as e:
        log(f"ERROR: Failed to get FAK key: {e}")
        return None

def get_credentials(service_name):
    """Get credentials using keyman suite."""
    try:
        # Use exportkey.sh to get decrypted credentials
        result = subprocess.run([
            str(KEYMAN_DIR / "exportkey.sh"),
            service_name
        ], capture_output=True, text=True, check=True)
        
        # Read credentials from ramdisk
        cred_file = Path("/mnt/keyexchange") / service_name
        if cred_file.exists():
            with open(cred_file, "r") as f:
                content = f.read()
                # Parse shell format: username="user" password="pass"
                username = None
                password = None
                for line in content.split('\n'):
                    if line.startswith('username='):
                        username = line.split('"')[1]
                    elif line.startswith('password='):
                        password = line.split('"')[1]
                return username, password
        return None, None
    except Exception as e:
        log(f"ERROR: Failed to get credentials for {service_name}: {e}")
        return None, None

def download_from_provider(backup_name, provider, credentials):
    """Download backup from cloud provider using rclone."""
    try:
        # Configure rclone for this provider
        config_file = TEMP_DIR / f"rclone_{provider}.conf"
        
        # This would need to be expanded based on provider type
        # For now, placeholder for rclone configuration
        log(f"Downloading {backup_name} from {provider}...")
        
        # Example rclone command (would need actual config)
        cmd = [
            "rclone", "copy",
            f"{provider}:homeserver-backups/{backup_name}",
            str(TEMP_DIR),
            "--config", str(config_file)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            log(f"Successfully downloaded {backup_name} from {provider}")
            return TEMP_DIR / backup_name
        else:
            log(f"ERROR: Download from {provider} failed: {result.stderr}")
            return None
            
    except Exception as e:
        log(f"ERROR: Download from {provider} failed: {e}")
        return None

def decrypt_backup(encrypted_file):
    """Decrypt backup package using FAK."""
    try:
        fak_key = get_fak_key()
        if not fak_key:
            log("ERROR: Failed to get FAK key, cannot decrypt backup")
            return None
        
        fernet = Fernet(fak_key)
        
        # Read and decrypt the package
        with open(encrypted_file, "rb") as f:
            decrypted_data = fernet.decrypt(f.read())
        
        # Write decrypted package
        decrypted_file = encrypted_file.with_suffix('.tar.gz')
        with open(decrypted_file, "wb") as f:
            f.write(decrypted_data)
        
        log(f"Decrypted backup package: {decrypted_file}")
        return decrypted_file
        
    except Exception as e:
        log(f"ERROR: Failed to decrypt backup: {e}")
        return None

def extract_backup(backup_file, extract_to):
    """Extract backup package to specified directory."""
    try:
        extract_to.mkdir(parents=True, exist_ok=True)
        
        with tarfile.open(backup_file, "r:gz") as tar:
            tar.extractall(extract_to)
        
        log(f"Extracted backup to: {extract_to}")
        return True
        
    except Exception as e:
        log(f"ERROR: Failed to extract backup: {e}")
        return False

def restore_items(extract_dir, restore_config):
    """Restore specific items based on configuration."""
    try:
        restored_items = []
        failed_items = []
        
        for item_config in restore_config.get("items", []):
            source_name = item_config.get("source_name")
            target_path = Path(item_config.get("target_path"))
            restore_type = item_config.get("type", "file")  # file, directory, or symlink
            
            source_path = extract_dir / source_name
            
            if not source_path.exists():
                log(f"WARNING: Source item not found in backup: {source_name}")
                failed_items.append(source_name)
                continue
            
            # Create target directory if needed
            if restore_type == "directory":
                target_path.mkdir(parents=True, exist_ok=True)
            else:
                target_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Backup existing item if it exists
            if target_path.exists():
                backup_path = target_path.with_suffix(f".backup.{int(datetime.now().timestamp())}")
                shutil.move(str(target_path), str(backup_path))
                log(f"Backed up existing item to: {backup_path}")
            
            # Restore the item
            if restore_type == "directory":
                if target_path.exists():
                    shutil.rmtree(target_path)
                shutil.copytree(source_path, target_path)
            else:
                shutil.copy2(source_path, target_path)
            
            # Set proper permissions
            if item_config.get("owner"):
                owner = item_config["owner"]
                if ":" in owner:
                    user, group = owner.split(":", 1)
                    shutil.chown(target_path, user=user, group=group)
                else:
                    shutil.chown(target_path, user=owner)
            
            if item_config.get("permissions"):
                mode = int(item_config["permissions"], 8)
                target_path.chmod(mode)
            
            restored_items.append(str(target_path))
            log(f"Restored: {source_name} -> {target_path}")
        
        return {
            "success": True,
            "restored_items": restored_items,
            "failed_items": failed_items
        }
        
    except Exception as e:
        log(f"ERROR: Failed to restore items: {e}")
        return {
            "success": False,
            "error": str(e),
            "restored_items": [],
            "failed_items": []
        }

def list_backup_contents(backup_file):
    """List contents of backup package without extracting."""
    try:
        with tarfile.open(backup_file, "r:gz") as tar:
            members = tar.getmembers()
            contents = []
            
            for member in members:
                contents.append({
                    "name": member.name,
                    "size": member.size,
                    "type": "directory" if member.isdir() else "file",
                    "mtime": datetime.fromtimestamp(member.mtime).isoformat(),
                    "permissions": oct(member.mode)[-3:]
                })
            
            return contents
            
    except Exception as e:
        log(f"ERROR: Failed to list backup contents: {e}")
        return []

def main():
    """Main restore service entry point."""
    if len(sys.argv) < 2:
        print("Usage: restore_service.py <restore_config.json>")
        print("       restore_service.py --list <backup_file>")
        sys.exit(1)
    
    if sys.argv[1] == "--list":
        # List backup contents
        if len(sys.argv) < 3:
            print("Usage: restore_service.py --list <backup_file>")
            sys.exit(1)
        
        backup_file = Path(sys.argv[2])
        if not backup_file.exists():
            print(f"ERROR: Backup file not found: {backup_file}")
            sys.exit(1)
        
        contents = list_backup_contents(backup_file)
        print(json.dumps(contents, indent=2))
        return
    
    # Load restore configuration
    config_file = Path(sys.argv[1])
    if not config_file.exists():
        log(f"ERROR: Restore configuration file not found: {config_file}")
        sys.exit(1)
    
    try:
        with open(config_file, "r") as f:
            restore_config = json.load(f)
    except Exception as e:
        log(f"ERROR: Failed to load restore configuration: {e}")
        sys.exit(1)
    
    log("Starting HOMESERVER restore service...")
    
    # Download backup if needed
    backup_name = restore_config.get("backup_name")
    provider = restore_config.get("provider")
    
    if provider and backup_name:
        username, password = get_credentials(provider)
        if not username or not password:
            log(f"ERROR: No credentials found for provider: {provider}")
            sys.exit(1)
        
        backup_file = download_from_provider(backup_name, provider, (username, password))
        if not backup_file:
            log("ERROR: Failed to download backup")
            sys.exit(1)
    else:
        # Local backup file
        backup_file = Path(restore_config.get("backup_file"))
        if not backup_file.exists():
            log(f"ERROR: Backup file not found: {backup_file}")
            sys.exit(1)
    
    # Decrypt backup if it's encrypted
    if backup_file.suffix == '.encrypted':
        decrypted_file = decrypt_backup(backup_file)
        if not decrypted_file:
            log("ERROR: Failed to decrypt backup")
            sys.exit(1)
        backup_file = decrypted_file
    
    # Extract backup
    extract_dir = TEMP_DIR / "extracted"
    if not extract_backup(backup_file, extract_dir):
        log("ERROR: Failed to extract backup")
        sys.exit(1)
    
    # Restore items
    result = restore_items(extract_dir, restore_config)
    
    if result["success"]:
        log(f"Restore completed successfully. Restored {len(result['restored_items'])} items.")
        if result["failed_items"]:
            log(f"Failed to restore {len(result['failed_items'])} items: {result['failed_items']}")
    else:
        log(f"Restore failed: {result.get('error', 'Unknown error')}")
        sys.exit(1)
    
    # Clean up
    try:
        shutil.rmtree(extract_dir)
        if backup_file.suffix == '.tar.gz' and backup_file.parent == TEMP_DIR:
            backup_file.unlink()
        log("Cleaned up temporary files")
    except Exception as e:
        log(f"WARNING: Failed to clean up: {e}")

if __name__ == "__main__":
    main()
