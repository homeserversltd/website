#!/usr/bin/env python3
"""
HOMESERVER Backup Service
Copyright (C) 2024 HOMESERVER LLC

Professional 3-2-1 backup system for HOMESERVER infrastructure.
Integrates with keyman suite for credential management and FAK encryption.
"""

import os
import sys
import json
import subprocess
import tempfile
import shutil
import gzip
import tarfile
from pathlib import Path
from datetime import datetime
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

# Configuration
BACKUP_DIR = Path("/var/www/homeserver/backup")
TEMP_DIR = Path("/tmp/homeserver-backups")
LOG_FILE = Path("/var/log/homeserver/backup.log")
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

def create_backup_package(backup_items):
    """Create encrypted backup package with metadata."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    package_name = f"homeserver_backup_{timestamp}"
    package_path = TEMP_DIR / f"{package_name}.tar.gz"
    
    log(f"Creating backup package: {package_name}")
    
    # Create metadata about backup items
    backup_metadata = {
        "timestamp": timestamp,
        "backup_name": package_name,
        "items": [],
        "created_at": datetime.now().isoformat(),
        "homeserver_version": "1.0.0"  # Could be read from actual version
    }
    
    # Create tar.gz archive
    with tarfile.open(package_path, "w:gz") as tar:
        for item in backup_items:
            item_path = Path(item)
            if item_path.exists():
                # Get file info for metadata
                stat = item_path.stat()
                item_info = {
                    "source_path": str(item_path),
                    "backup_name": item_path.name,
                    "type": "directory" if item_path.is_dir() else "file",
                    "size": stat.st_size,
                    "permissions": oct(stat.st_mode)[-3:],
                    "owner": f"{stat.st_uid}:{stat.st_gid}",
                    "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat()
                }
                backup_metadata["items"].append(item_info)
                
                tar.add(item, arcname=item_path.name)
                log(f"Added to backup: {item}")
            else:
                log(f"WARNING: Backup item not found: {item}")
        
        # Add metadata file to archive
        metadata_file = TEMP_DIR / "backup_metadata.json"
        with open(metadata_file, "w") as f:
            json.dump(backup_metadata, f, indent=2)
        tar.add(metadata_file, arcname="backup_metadata.json")
        metadata_file.unlink()
    
    # Encrypt with FAK
    fak_key = get_fak_key()
    if not fak_key:
        log("ERROR: Failed to get FAK key, cannot encrypt backup")
        return None
    
    fernet = Fernet(fak_key)
    
    # Read and encrypt the package
    with open(package_path, "rb") as f:
        encrypted_data = fernet.encrypt(f.read())
    
    # Write encrypted package
    encrypted_path = package_path.with_suffix('.encrypted')
    with open(encrypted_path, "wb") as f:
        f.write(encrypted_data)
    
    # Clean up unencrypted package
    package_path.unlink()
    
    log(f"Created encrypted backup package: {encrypted_path}")
    return encrypted_path

def upload_to_provider(encrypted_package, provider, credentials):
    """Upload backup to cloud provider using rclone."""
    try:
        # Configure rclone for this provider
        config_file = TEMP_DIR / f"rclone_{provider}.conf"
        
        # This would need to be expanded based on provider type
        # For now, placeholder for rclone configuration
        log(f"Uploading to {provider}...")
        
        # Example rclone command (would need actual config)
        cmd = [
            "rclone", "copy",
            str(encrypted_package),
            f"{provider}:homeserver-backups/",
            "--config", str(config_file)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            log(f"Successfully uploaded to {provider}")
            return True
        else:
            log(f"ERROR: Upload to {provider} failed: {result.stderr}")
            return False
            
    except Exception as e:
        log(f"ERROR: Upload to {provider} failed: {e}")
        return False

def load_backup_config():
    """Load backup configuration."""
    config_file = BACKUP_DIR / "backup_config.json"
    
    # Default configuration
    default_config = {
        "backup_items": [
            "/var/www/homeserver/src",
            "/var/lib/gogs",
            "/etc/homeserver",
            "/var/log/homeserver"
        ],
        "providers": {
            "aws_s3": {
                "enabled": False,
                "credentials_key": "aws_s3"
            },
            "google_drive": {
                "enabled": False,
                "credentials_key": "google_drive"
            },
            "dropbox": {
                "enabled": False,
                "credentials_key": "dropbox"
            },
            "backblaze": {
                "enabled": False,
                "credentials_key": "backblaze"
            }
        },
        "retention_days": 30
    }
    
    if config_file.exists():
        try:
            with open(config_file, "r") as f:
                config = json.load(f)
            # Merge with defaults
            for key, value in default_config.items():
                if key not in config:
                    config[key] = value
            return config
        except Exception as e:
            log(f"ERROR: Failed to load config, using defaults: {e}")
    
    # Create default config file
    with open(config_file, "w") as f:
        json.dump(default_config, f, indent=2)
    
    return default_config

def main():
    """Main backup service entry point."""
    log("Starting HOMESERVER backup service...")
    
    # Load configuration
    config = load_backup_config()
    
    # Create backup package
    encrypted_package = create_backup_package(config["backup_items"])
    if not encrypted_package:
        log("ERROR: Failed to create backup package")
        sys.exit(1)
    
    # Upload to enabled providers
    upload_success = False
    for provider, provider_config in config["providers"].items():
        if provider_config.get("enabled", False):
            username, password = get_credentials(provider_config["credentials_key"])
            if username and password:
                if upload_to_provider(encrypted_package, provider, (username, password)):
                    upload_success = True
            else:
                log(f"WARNING: No credentials found for {provider}")
    
    if not upload_success:
        log("WARNING: No successful uploads to any provider")
    
    # Clean up
    try:
        encrypted_package.unlink()
        log("Cleaned up temporary files")
    except Exception as e:
        log(f"WARNING: Failed to clean up: {e}")
    
    log("Backup service completed")

if __name__ == "__main__":
    main()