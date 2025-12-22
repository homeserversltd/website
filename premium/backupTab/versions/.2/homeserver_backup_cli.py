#!/usr/bin/env python3
"""
HOMESERVER Backup CLI Utility
Copyright (C) 2024 HOMESERVER LLC

Self-contained backup utility for rigorous testing and development.
Focuses on core backup/encryption functionality with modular provider system.
"""

import os
import sys
import json
import argparse
import tempfile
import shutil
import tarfile
import gzip
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

class BackupCLI:
    """Self-contained backup CLI utility."""
    
    def __init__(self, config_file: Optional[str] = None):
        self.config_file = config_file or "backup_config.json"
        self.fak_path = Path("/root/key/skeleton.key")
        self.temp_dir = Path("/tmp/homeserver-backup-cli")
        self.backup_dir = Path("/var/www/homeserver/backup")
        
        # Ensure directories exist
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Load configuration
        self.config = self._load_config()
        
    def _load_config(self) -> Dict[str, Any]:
        """Load backup configuration."""
        default_config = {
            "backup_items": [
                "/var/www/homeserver/src",
                "/var/lib/gogs",
                "/etc/homeserver"
            ],
            "providers": {
                "local": {
                    "enabled": True,
                    "path": "/var/www/homeserver/backup"
                }
            },
            "encryption": {
                "enabled": True,
                "fak_path": "/root/key/skeleton.key"
            },
            "compression": {
                "enabled": True,
                "level": 6
            }
        }
        
        if Path(self.config_file).exists():
            try:
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                # Merge with defaults
                for key, value in default_config.items():
                    if key not in config:
                        config[key] = value
                return config
            except Exception as e:
                print(f"WARNING: Failed to load config, using defaults: {e}")
        
        # Create default config file
        with open(self.config_file, 'w') as f:
            json.dump(default_config, f, indent=2)
        
        return default_config
    
    def _get_fak_key(self) -> Optional[bytes]:
        """Get Factory Access Key from skeleton.key."""
        try:
            with open(self.fak_path, "r") as f:
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
    
    def _create_backup_metadata(self, backup_items: List[str], timestamp: str) -> Dict[str, Any]:
        """Create metadata for backup package."""
        metadata = {
            "timestamp": timestamp,
            "backup_name": f"homeserver_backup_{timestamp}",
            "items": [],
            "created_at": datetime.now().isoformat(),
            "homeserver_version": "1.0.0",
            "cli_version": "1.0.0"
        }
        
        for item in backup_items:
            item_path = Path(item)
            if item_path.exists():
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
                metadata["items"].append(item_info)
        
        return metadata
    
    def _create_backup_package(self, backup_items: List[str], timestamp: str) -> Optional[Path]:
        """Create backup package with metadata."""
        package_name = f"homeserver_backup_{timestamp}"
        package_path = self.temp_dir / f"{package_name}.tar.gz"
        
        print(f"Creating backup package: {package_name}")
        
        # Create metadata
        metadata = self._create_backup_metadata(backup_items, timestamp)
        
        # Create tar.gz archive
        with tarfile.open(package_path, "w:gz", compresslevel=self.config["compression"]["level"]) as tar:
            for item in backup_items:
                item_path = Path(item)
                if item_path.exists():
                    tar.add(item, arcname=item_path.name)
                    print(f"  Added: {item}")
                else:
                    print(f"  WARNING: Item not found: {item}")
            
            # Add metadata file to archive
            metadata_file = self.temp_dir / "backup_metadata.json"
            with open(metadata_file, "w") as f:
                json.dump(metadata, f, indent=2)
            tar.add(metadata_file, arcname="backup_metadata.json")
            metadata_file.unlink()
        
        print(f"Created backup package: {package_path}")
        return package_path
    
    def _encrypt_backup(self, package_path: Path) -> Optional[Path]:
        """Encrypt backup package with FAK."""
        if not self.config["encryption"]["enabled"]:
            return package_path
        
        print("Encrypting backup package...")
        
        fak_key = self._get_fak_key()
        if not fak_key:
            print("ERROR: Failed to get FAK key, cannot encrypt backup")
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
        
        print(f"Encrypted backup package: {encrypted_path}")
        return encrypted_path
    
    def _decrypt_backup(self, encrypted_path: Path) -> Optional[Path]:
        """Decrypt backup package."""
        print("Decrypting backup package...")
        
        fak_key = self._get_fak_key()
        if not fak_key:
            print("ERROR: Failed to get FAK key, cannot decrypt backup")
            return None
        
        fernet = Fernet(fak_key)
        
        # Read and decrypt the package
        with open(encrypted_path, "rb") as f:
            decrypted_data = fernet.decrypt(f.read())
        
        # Write decrypted package
        decrypted_path = encrypted_path.with_suffix('.tar.gz')
        with open(decrypted_path, "wb") as f:
            f.write(decrypted_data)
        
        print(f"Decrypted backup package: {decrypted_path}")
        return decrypted_path
    
    def _extract_backup(self, package_path: Path, extract_to: Path) -> bool:
        """Extract backup package."""
        try:
            extract_to.mkdir(parents=True, exist_ok=True)
            
            with tarfile.open(package_path, "r:gz") as tar:
                tar.extractall(extract_to)
            
            print(f"Extracted backup to: {extract_to}")
            return True
            
        except Exception as e:
            print(f"ERROR: Failed to extract backup: {e}")
            return False
    
    def _list_backup_contents(self, package_path: Path) -> List[Dict[str, Any]]:
        """List contents of backup package."""
        try:
            with tarfile.open(package_path, "r:gz") as tar:
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
            print(f"ERROR: Failed to list backup contents: {e}")
            return []
    
    def create_backup(self, items: Optional[List[str]] = None) -> Optional[Path]:
        """Create a new backup."""
        backup_items = items or self.config["backup_items"]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        print(f"Creating backup with timestamp: {timestamp}")
        print(f"Backup items: {backup_items}")
        
        # Create backup package
        package_path = self._create_backup_package(backup_items, timestamp)
        if not package_path:
            return None
        
        # Encrypt if enabled
        if self.config["encryption"]["enabled"]:
            encrypted_path = self._encrypt_backup(package_path)
            if not encrypted_path:
                return None
            package_path = encrypted_path
        
        # Move to backup directory
        final_path = self.backup_dir / package_path.name
        shutil.move(str(package_path), str(final_path))
        
        print(f"Backup created: {final_path}")
        return final_path
    
    def list_backups(self) -> List[Dict[str, Any]]:
        """List available backups."""
        backups = []
        
        for backup_file in self.backup_dir.glob("*.encrypted"):
            stat = backup_file.stat()
            backups.append({
                "name": backup_file.name,
                "size": stat.st_size,
                "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "path": str(backup_file)
            })
        
        return sorted(backups, key=lambda x: x["mtime"], reverse=True)
    
    def show_backup_contents(self, backup_name: str) -> List[Dict[str, Any]]:
        """Show contents of a specific backup."""
        backup_path = self.backup_dir / backup_name
        
        if not backup_path.exists():
            print(f"ERROR: Backup not found: {backup_name}")
            return []
        
        # Decrypt if needed
        if backup_path.suffix == '.encrypted':
            decrypted_path = self._decrypt_backup(backup_path)
            if not decrypted_path:
                return []
            package_path = decrypted_path
        else:
            package_path = backup_path
        
        # List contents
        contents = self._list_backup_contents(package_path)
        
        # Clean up decrypted file if we created it
        if backup_path.suffix == '.encrypted' and decrypted_path:
            decrypted_path.unlink()
        
        return contents
    
    def extract_backup(self, backup_name: str, extract_to: str) -> bool:
        """Extract backup to specified directory."""
        backup_path = self.backup_dir / backup_name
        
        if not backup_path.exists():
            print(f"ERROR: Backup not found: {backup_name}")
            return False
        
        # Decrypt if needed
        if backup_path.suffix == '.encrypted':
            decrypted_path = self._decrypt_backup(backup_path)
            if not decrypted_path:
                return False
            package_path = decrypted_path
        else:
            package_path = backup_path
        
        # Extract
        extract_dir = Path(extract_to)
        success = self._extract_backup(package_path, extract_dir)
        
        # Clean up decrypted file if we created it
        if backup_path.suffix == '.encrypted' and decrypted_path:
            decrypted_path.unlink()
        
        return success
    
    def test_backup(self, items: Optional[List[str]] = None) -> bool:
        """Test backup creation and extraction."""
        print("Testing backup creation and extraction...")
        
        # Create backup
        backup_path = self.create_backup(items)
        if not backup_path:
            print("ERROR: Failed to create backup")
            return False
        
        # Test extraction
        test_dir = self.temp_dir / "test_extract"
        if not self.extract_backup(backup_path.name, str(test_dir)):
            print("ERROR: Failed to extract backup")
            return False
        
        # List contents
        contents = self.show_backup_contents(backup_path.name)
        print(f"Backup contains {len(contents)} items:")
        for item in contents:
            print(f"  {item['name']} ({item['type']}) - {item['size']} bytes")
        
        # Clean up
        shutil.rmtree(test_dir, ignore_errors=True)
        
        print("Backup test completed successfully")
        return True

def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(description="HOMESERVER Backup CLI Utility")
    parser.add_argument("--config", "-c", help="Configuration file path")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Create backup command
    create_parser = subparsers.add_parser("create", help="Create a new backup")
    create_parser.add_argument("--items", "-i", nargs="+", help="Items to backup")
    
    # List backups command
    subparsers.add_parser("list", help="List available backups")
    
    # Show contents command
    contents_parser = subparsers.add_parser("contents", help="Show backup contents")
    contents_parser.add_argument("backup_name", help="Name of backup to inspect")
    
    # Extract backup command
    extract_parser = subparsers.add_parser("extract", help="Extract backup")
    extract_parser.add_argument("backup_name", help="Name of backup to extract")
    extract_parser.add_argument("--to", "-t", required=True, help="Directory to extract to")
    
    # Test backup command
    test_parser = subparsers.add_parser("test", help="Test backup creation and extraction")
    test_parser.add_argument("--items", "-i", nargs="+", help="Items to backup")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    # Initialize CLI
    cli = BackupCLI(args.config)
    
    try:
        if args.command == "create":
            cli.create_backup(args.items)
        elif args.command == "list":
            backups = cli.list_backups()
            if backups:
                print("Available backups:")
                for backup in backups:
                    print(f"  {backup['name']} - {backup['size']} bytes - {backup['mtime']}")
            else:
                print("No backups found")
        elif args.command == "contents":
            contents = cli.show_backup_contents(args.backup_name)
            if contents:
                print(f"Contents of {args.backup_name}:")
                for item in contents:
                    print(f"  {item['name']} ({item['type']}) - {item['size']} bytes")
            else:
                print("No contents found or backup not found")
        elif args.command == "extract":
            success = cli.extract_backup(args.backup_name, args.to)
            if success:
                print(f"Backup extracted to: {args.to}")
            else:
                print("Failed to extract backup")
        elif args.command == "test":
            success = cli.test_backup(args.items)
            if not success:
                sys.exit(1)
    
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()