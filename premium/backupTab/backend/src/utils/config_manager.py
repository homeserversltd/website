#!/usr/bin/env python3
"""
HOMESERVER Backup Config Manager Utility
Copyright (C) 2024 HOMESERVER LLC

Utility for managing backup configuration.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional
from .logger import get_logger

# Centralized configuration paths
BACKUP_BASE_DIR = "/var/www/homeserver/premium/backupTab/backend"
BACKUP_SCRIPT_PATH = f"{BACKUP_BASE_DIR}/backup"
BACKUP_CONFIG_PATH = "/var/www/homeserver/premium/backup/settings.json"
BACKUP_LOG_PATH = "/var/log/homeserver/backup.log"


class ConfigManager:
    """Manages backup configuration operations."""
    
    def __init__(self, config_file: str = None):
        # Use installed config by default, fallback to template
        if config_file is None:
            installed_config = Path("/var/www/homeserver/premium/backup/settings.json")
            template_config = Path("src/config/settings.json")
            self.config_file = installed_config if installed_config.exists() else template_config
        else:
            self.config_file = Path(config_file)
        self.logger = get_logger()
        self._default_config = self._get_default_config()
    
    def _get_default_config(self) -> Dict[str, Any]:
        """Get default backup configuration."""
        return {
            "backup_items": [
                "/var/www/homeserver/src",
                "/var/lib/gogs",
                "/etc/homeserver"
            ],
            "providers": {
                "local": {
                    "enabled": True,
                    "path": BACKUP_BASE_DIR
                },
                "aws_s3": {
                    "enabled": False,
                    "bucket": "homeserver-backups",
                    "region": "us-east-1",
                    "access_key": "",
                    "secret_key": ""
                },
                "google_cloud_storage": {
                    "enabled": False,
                    "credentials_file": "",
                    "project_id": "",
                    "bucket_name": "homeserver-backups"
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
            },
            "retention": {
                "days": 30,
                "max_backups": 10
            },
            "logging": {
                "enabled": True,
                "log_file": "/var/log/homeserver/backup.log",
                "log_level": "INFO",
                "max_file_size_mb": 10,
                "backup_count": 5,
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            }
        }
    
    def load_config(self) -> Dict[str, Any]:
        """Load backup configuration with defaults."""
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                # Merge with defaults
                for key, value in self._default_config.items():
                    if key not in config:
                        config[key] = value
                return config
            except Exception as e:
                self.logger.warning(f"Failed to load config, using defaults: {e}")
        
        # Create default config file
        self.save_config(self._default_config)
        return self._default_config.copy()
    
    def save_config(self, config: Dict[str, Any]) -> bool:
        """Save configuration to file."""
        try:
            # Ensure directory exists
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.config_file, 'w') as f:
                json.dump(config, f, indent=2)
            
            self.logger.info(f"Configuration saved to: {self.config_file}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to save config: {e}")
            return False
    
    def update_provider_config(self, provider_name: str, updates: Dict[str, Any]) -> bool:
        """Update configuration for a specific provider."""
        config = self.load_config()
        
        if provider_name not in config["providers"]:
            self.logger.error(f"Provider '{provider_name}' not found in config")
            return False
        
        config["providers"][provider_name].update(updates)
        return self.save_config(config)
    
    def enable_provider(self, provider_name: str) -> bool:
        """Enable a specific provider."""
        return self.update_provider_config(provider_name, {"enabled": True})
    
    def disable_provider(self, provider_name: str) -> bool:
        """Disable a specific provider."""
        return self.update_provider_config(provider_name, {"enabled": False})
    
    def get_provider_config(self, provider_name: str) -> Optional[Dict[str, Any]]:
        """Get configuration for a specific provider."""
        config = self.load_config()
        return config["providers"].get(provider_name)
    
    def is_provider_enabled(self, provider_name: str) -> bool:
        """Check if a provider is enabled."""
        provider_config = self.get_provider_config(provider_name)
        return provider_config.get("enabled", False) if provider_config else False
    
    def increment_backup_count(self) -> bool:
        """Increment the backup count in the configuration file."""
        try:
            # Load current config
            config = self.load_config()
            
            # Increment backup count
            current_count = config.get('backup_count', 0)
            config['backup_count'] = current_count + 1
            
            # Save updated config
            success = self.save_config(config)
            
            if success:
                self.logger.info(f"Backup count incremented to {config['backup_count']}")
            else:
                self.logger.error("Failed to save config after incrementing backup count")
            
            return success
        
        except Exception as e:
            self.logger.error(f"Failed to increment backup count: {e}")
            return False