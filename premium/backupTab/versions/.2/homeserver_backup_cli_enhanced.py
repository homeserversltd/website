#!/usr/bin/env python3
"""
HOMESERVER Enhanced Backup CLI Utility
Copyright (C) 2024 HOMESERVER LLC

Enhanced backup utility with modular provider system for rigorous testing.
"""

import os
import sys
import json
import argparse
import tempfile
import shutil
import tarfile
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

# Add providers to path
sys.path.append(str(Path(__file__).parent / "providers"))

from providers import get_provider, PROVIDERS

class EnhancedBackupCLI:
    """Enhanced backup CLI with modular provider system."""
    
    def __init__(self, config_file: Optional[str] = None):
        self.config_file = config_file or "backup_config_enhanced.json"
        self.fak_path = Path("/root/key/skeleton.key")
        self.temp_dir = Path("/tmp/homeserver-backup-cli-enhanced")
        self.backup_dir = Path("/var/www/homeserver/backup")
        
        # Ensure directories exist
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Load configuration
        self.config = self._load_config()
        
        # Initialize providers
        self.providers = {}
        self._initialize_providers()
    
    def _load_config(self) -> Dict[str, Any]:
        """Load enhanced backup configuration."""
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
                },
                "aws_s3": {
                    "enabled": False,
                    "bucket": "homeserver-backups",
                    "region": "us-east-1",
                    "access_key": "",
                    "secret_key": ""
                },
                "google_drive": {
                    "enabled": False,
                    "credentials_file": "",
                    "token_file": "token.json",
                    "folder_id": ""
                },
                "dropbox": {
                    "enabled": False,
                    "access_token": "",
                    "folder_path": "/HOMESERVER Backups"
                },
                "backblaze": {
                    "enabled": False,
                    "application_key_id": "",
                    "application_key": "",
                    "bucket": "homeserver-backups"
                }
            },
            "encryption": {
                "enabled": True,
                "fak_path": "/root/key/skeleton.key"
            },
            "compression": {
                "enabled": True,
                "level": 6
            },
            "timestamp_chains": {
                "enabled": True,
                "format": "%Y%m%d_%H%M%S"
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
    
    def _initialize_providers(self):
        """Initialize enabled providers."""
        for provider_name, provider_config in self.config["providers"].items():
            if provider_config.get("enabled", False):
                try:
                    provider = get_provider(provider_name, provider_config)
                    self.providers[provider_name] = provider
                    print(f"Initialized provider: {provider_name}")
                except Exception as e:
                    print(f"WARNING: Failed to initialize provider {provider_name}: {e}")
    
    def _get_fak_key(self) -> Optional[bytes]:
        """Get Factory Access Key from skeleton.key."""
        try:
            with open(self.fak_path, "r") as f:
                fak_text = f.read().strip()
            
            from cryptography.fernet import Fernet
            from cryptography.hazmat.primitives import hashes
            from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
            import base64
            
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
            "cli_version": "1.0.0-enhanced",
            "providers": list(self.providers.keys())
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
        
        from cryptography.fernet import Fernet
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
    
    def create_backup(self, items: Optional[List[str]] = None) -> Optional[Path]:
        """Create a new backup and upload to all enabled providers."""
        backup_items = items or self.config["backup_items"]
        timestamp = datetime.now().strftime(self.config["timestamp_chains"]["format"])
        
        print(f"Creating backup with timestamp: {timestamp}")
        print(f"Backup items: {backup_items}")
        print(f"Enabled providers: {list(self.providers.keys())}")
        
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
        
        # Upload to all enabled providers
        upload_results = {}
        for provider_name, provider in self.providers.items():
            print(f"Uploading to {provider_name}...")
            success = provider.upload(package_path, package_path.name)
            upload_results[provider_name] = success
            if success:
                print(f"  ✓ Uploaded to {provider_name}")
            else:
                print(f"  ✗ Failed to upload to {provider_name}")
        
        # Move to local backup directory
        local_path = self.backup_dir / package_path.name
        shutil.move(str(package_path), str(local_path))
        
        print(f"Backup created: {local_path}")
        print(f"Upload results: {upload_results}")
        return local_path
    
    def list_backups(self, provider_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """List available backups from specified provider or all providers."""
        all_backups = []
        
        if provider_name:
            if provider_name in self.providers:
                provider = self.providers[provider_name]
                backups = provider.list_files()
                for backup in backups:
                    backup['provider'] = provider_name
                all_backups.extend(backups)
            else:
                print(f"ERROR: Provider {provider_name} not available")
        else:
            # List from all providers
            for prov_name, provider in self.providers.items():
                backups = provider.list_files()
                for backup in backups:
                    backup['provider'] = prov_name
                all_backups.extend(backups)
        
        return sorted(all_backups, key=lambda x: x.get('mtime', 0), reverse=True)
    
    def test_providers(self) -> Dict[str, bool]:
        """Test all enabled providers."""
        results = {}
        
        for provider_name, provider in self.providers.items():
            print(f"Testing {provider_name}...")
            success = provider.test_connection()
            results[provider_name] = success
            if success:
                print(f"  ✓ {provider_name} connection successful")
            else:
                print(f"  ✗ {provider_name} connection failed")
        
        return results
    
    def download_backup(self, backup_name: str, provider_name: str, local_path: Optional[str] = None) -> bool:
        """Download backup from specified provider."""
        if provider_name not in self.providers:
            print(f"ERROR: Provider {provider_name} not available")
            return False
        
        if not local_path:
            local_path = self.temp_dir / backup_name
        
        provider = self.providers[provider_name]
        success = provider.download(backup_name, Path(local_path))
        
        if success:
            print(f"Downloaded {backup_name} from {provider_name} to {local_path}")
        else:
            print(f"Failed to download {backup_name} from {provider_name}")
        
        return success
    
    def test_backup_cycle(self, items: Optional[List[str]] = None) -> bool:
        """Test complete backup cycle: create, upload, download, verify."""
        print("Testing complete backup cycle...")
        
        # Create backup
        backup_path = self.create_backup(items)
        if not backup_path:
            print("ERROR: Failed to create backup")
            return False
        
        backup_name = backup_path.name
        
        # Test download from each provider
        for provider_name, provider in self.providers.items():
            print(f"Testing download from {provider_name}...")
            test_path = self.temp_dir / f"test_{provider_name}_{backup_name}"
            
            if provider.download(backup_name, test_path):
                print(f"  ✓ Download from {provider_name} successful")
                # Verify file exists and has content
                if test_path.exists() and test_path.stat().st_size > 0:
                    print(f"  ✓ File verification successful")
                else:
                    print(f"  ✗ File verification failed")
                test_path.unlink()  # Clean up
            else:
                print(f"  ✗ Download from {provider_name} failed")
        
        print("Backup cycle test completed")
        return True

def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(description="HOMESERVER Enhanced Backup CLI Utility")
    parser.add_argument("--config", "-c", help="Configuration file path")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Create backup command
    create_parser = subparsers.add_parser("create", help="Create a new backup")
    create_parser.add_argument("--items", "-i", nargs="+", help="Items to backup")
    
    # List backups command
    list_parser = subparsers.add_parser("list", help="List available backups")
    list_parser.add_argument("--provider", "-p", help="Specific provider to list from")
    
    # Test providers command
    subparsers.add_parser("test-providers", help="Test all enabled providers")
    
    # Download backup command
    download_parser = subparsers.add_parser("download", help="Download backup from provider")
    download_parser.add_argument("backup_name", help="Name of backup to download")
    download_parser.add_argument("--provider", "-p", required=True, help="Provider to download from")
    download_parser.add_argument("--to", "-t", help="Local path to save to")
    
    # Test backup cycle command
    test_parser = subparsers.add_parser("test-cycle", help="Test complete backup cycle")
    test_parser.add_argument("--items", "-i", nargs="+", help="Items to backup")
    
    # List available providers
    subparsers.add_parser("list-providers", help="List available providers")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    # Initialize CLI
    cli = EnhancedBackupCLI(args.config)
    
    try:
        if args.command == "create":
            cli.create_backup(args.items)
        elif args.command == "list":
            backups = cli.list_backups(args.provider)
            if backups:
                print("Available backups:")
                for backup in backups:
                    provider = backup.get('provider', 'unknown')
                    mtime = backup.get('mtime', 0)
                    if isinstance(mtime, (int, float)):
                        mtime = datetime.fromtimestamp(mtime).isoformat()
                    print(f"  {backup['name']} - {backup.get('size', 0)} bytes - {mtime} ({provider})")
            else:
                print("No backups found")
        elif args.command == "test-providers":
            results = cli.test_providers()
            print(f"Provider test results: {results}")
        elif args.command == "download":
            success = cli.download_backup(args.backup_name, args.provider, args.to)
            if not success:
                sys.exit(1)
        elif args.command == "test-cycle":
            success = cli.test_backup_cycle(args.items)
            if not success:
                sys.exit(1)
        elif args.command == "list-providers":
            print("Available providers:")
            for provider_name in PROVIDERS.keys():
                status = "enabled" if provider_name in cli.providers else "disabled"
                print(f"  {provider_name} ({status})")
    
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()