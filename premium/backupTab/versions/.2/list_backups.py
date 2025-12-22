#!/usr/bin/env python3
"""
HOMESERVER Backup Listing Service
Copyright (C) 2024 HOMESERVER LLC

Lists available backups and their contents for restore operations.
"""

import os
import sys
import json
import subprocess
import tempfile
import tarfile
from pathlib import Path
from datetime import datetime
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

# Configuration
BACKUP_DIR = Path("/var/www/homeserver/backup")
TEMP_DIR = Path("/tmp/homeserver-backup-list")
FAK_PATH = Path("/root/key/skeleton.key")
KEYMAN_DIR = Path("/vault/keyman")

# Ensure directories exist
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

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
        print(f"ERROR: Failed to get FAK key: {e}")
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
        print(f"ERROR: Failed to get credentials for {service_name}: {e}")
        return None, None

def list_provider_backups(provider, credentials):
    """List backups available from a cloud provider."""
    try:
        # Configure rclone for this provider
        config_file = TEMP_DIR / f"rclone_{provider}.conf"
        
        # This would need to be expanded based on provider type
        # For now, placeholder for rclone configuration
        cmd = [
            "rclone", "ls",
            f"{provider}:homeserver-backups/",
            "--config", str(config_file)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            backups = []
            for line in result.stdout.strip().split('\n'):
                if line and '.encrypted' in line:
                    parts = line.split()
                    if len(parts) >= 2:
                        size = int(parts[0])
                        name = parts[1]
                        backups.append({
                            "name": name,
                            "size": size,
                            "provider": provider
                        })
            return backups
        else:
            print(f"ERROR: Failed to list backups from {provider}: {result.stderr}")
            return []
            
    except Exception as e:
        print(f"ERROR: Failed to list backups from {provider}: {e}")
        return []

def decrypt_backup_metadata(encrypted_file):
    """Decrypt backup package and extract metadata."""
    try:
        fak_key = get_fak_key()
        if not fak_key:
            print("ERROR: Failed to get FAK key, cannot decrypt backup")
            return None
        
        fernet = Fernet(fak_key)
        
        # Read and decrypt the package
        with open(encrypted_file, "rb") as f:
            decrypted_data = fernet.decrypt(f.read())
        
        # Write decrypted package temporarily
        decrypted_file = TEMP_DIR / "temp_backup.tar.gz"
        with open(decrypted_file, "wb") as f:
            f.write(decrypted_data)
        
        # Extract metadata
        with tarfile.open(decrypted_file, "r:gz") as tar:
            try:
                metadata_member = tar.getmember("backup_metadata.json")
                metadata_file = tar.extractfile(metadata_member)
                if metadata_file:
                    metadata = json.load(metadata_file)
                    return metadata
            except KeyError:
                print("WARNING: No metadata found in backup")
                return None
            finally:
                # Clean up
                decrypted_file.unlink()
        
    except Exception as e:
        print(f"ERROR: Failed to decrypt backup metadata: {e}")
        return None

def list_local_backups():
    """List local backup files."""
    backups = []
    for backup_file in BACKUP_DIR.glob("*.encrypted"):
        stat = backup_file.stat()
        backups.append({
            "name": backup_file.name,
            "size": stat.st_size,
            "provider": "local",
            "path": str(backup_file),
            "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat()
        })
    return backups

def main():
    """Main backup listing entry point."""
    if len(sys.argv) < 2:
        print("Usage: list_backups.py <provider> [--metadata <backup_name>]")
        print("       list_backups.py local")
        print("       list_backups.py all")
        sys.exit(1)
    
    provider = sys.argv[1]
    
    if provider == "local":
        # List local backups
        backups = list_local_backups()
        print(json.dumps(backups, indent=2))
        
    elif provider == "all":
        # List from all configured providers
        all_backups = []
        
        # Add local backups
        all_backups.extend(list_local_backups())
        
        # Add cloud provider backups
        config_file = BACKUP_DIR / "backup_config.json"
        if config_file.exists():
            with open(config_file, "r") as f:
                config = json.load(f)
            
            for provider_name, provider_config in config.get("providers", {}).items():
                if provider_config.get("enabled", False):
                    username, password = get_credentials(provider_config["credentials_key"])
                    if username and password:
                        provider_backups = list_provider_backups(provider_name, (username, password))
                        all_backups.extend(provider_backups)
        
        print(json.dumps(all_backups, indent=2))
        
    elif len(sys.argv) > 2 and sys.argv[2] == "--metadata":
        # Get metadata for specific backup
        if len(sys.argv) < 4:
            print("Usage: list_backups.py <provider> --metadata <backup_name>")
            sys.exit(1)
        
        backup_name = sys.argv[3]
        
        if provider == "local":
            backup_file = BACKUP_DIR / backup_name
            if not backup_file.exists():
                print(f"ERROR: Backup file not found: {backup_file}")
                sys.exit(1)
        else:
            # Download from provider first
            config_file = BACKUP_DIR / "backup_config.json"
            if not config_file.exists():
                print("ERROR: No backup configuration found")
                sys.exit(1)
            
            with open(config_file, "r") as f:
                config = json.load(f)
            
            provider_config = config.get("providers", {}).get(provider)
            if not provider_config or not provider_config.get("enabled"):
                print(f"ERROR: Provider {provider} not configured or enabled")
                sys.exit(1)
            
            username, password = get_credentials(provider_config["credentials_key"])
            if not username or not password:
                print(f"ERROR: No credentials found for provider: {provider}")
                sys.exit(1)
            
            # Download backup
            backup_file = download_backup_from_provider(backup_name, provider, (username, password))
            if not backup_file:
                print("ERROR: Failed to download backup")
                sys.exit(1)
        
        # Get metadata
        metadata = decrypt_backup_metadata(backup_file)
        if metadata:
            print(json.dumps(metadata, indent=2))
        else:
            print("ERROR: Failed to get backup metadata")
            sys.exit(1)
        
    else:
        # List from specific provider
        config_file = BACKUP_DIR / "backup_config.json"
        if not config_file.exists():
            print("ERROR: No backup configuration found")
            sys.exit(1)
        
        with open(config_file, "r") as f:
            config = json.load(f)
        
        provider_config = config.get("providers", {}).get(provider)
        if not provider_config or not provider_config.get("enabled"):
            print(f"ERROR: Provider {provider} not configured or enabled")
            sys.exit(1)
        
        username, password = get_credentials(provider_config["credentials_key"])
        if not username or not password:
            print(f"ERROR: No credentials found for provider: {provider}")
            sys.exit(1)
        
        backups = list_provider_backups(provider, (username, password))
        print(json.dumps(backups, indent=2))

def download_backup_from_provider(backup_name, provider, credentials):
    """Download backup from cloud provider using rclone."""
    try:
        # Configure rclone for this provider
        config_file = TEMP_DIR / f"rclone_{provider}.conf"
        
        # This would need to be expanded based on provider type
        # For now, placeholder for rclone configuration
        cmd = [
            "rclone", "copy",
            f"{provider}:homeserver-backups/{backup_name}",
            str(TEMP_DIR),
            "--config", str(config_file)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return TEMP_DIR / backup_name
        else:
            print(f"ERROR: Download from {provider} failed: {result.stderr}")
            return None
            
    except Exception as e:
        print(f"ERROR: Download from {provider} failed: {e}")
        return None

if __name__ == "__main__":
    main()
