#!/usr/bin/env python3
"""
HOMESERVER Backup Tab Configuration Manager
Handles all configuration operations for the backup system
"""

import os
import json
import yaml
from datetime import datetime
from typing import Dict, Any, Optional
from .utils import (
    BACKUP_CONFIG_PATH, 
    get_logger, 
    check_and_update_config, 
    redact_sensitive_fields,
    validate_config_schema
)

class BackupConfigManager:
    """Manages backup system configuration operations"""
    
    def __init__(self):
        self.logger = get_logger()
    
    def get_config(self) -> Dict[str, Any]:
        """Get the complete backup configuration"""
        try:
            # Check and update configuration if needed
            if not check_and_update_config():
                self.logger.warning("Configuration update check failed, continuing with existing config")
            
            if not os.path.exists(BACKUP_CONFIG_PATH):
                return {}
            
            with open(BACKUP_CONFIG_PATH, 'r') as f:
                return json.load(f)
        
        except Exception as e:
            self.logger.error(f"Failed to load configuration: {e}")
            return {}
    
    def get_safe_config(self) -> Dict[str, Any]:
        """Get configuration with sensitive fields redacted"""
        config = self.get_config()
        return redact_sensitive_fields(config)
    
    def update_config(self, new_config: Dict[str, Any]) -> bool:
        """Update the complete backup configuration"""
        try:
            # Check and update configuration if needed before processing
            if not check_and_update_config():
                self.logger.warning("Configuration update check failed, continuing with existing config")
            
            if not os.path.exists(BACKUP_CONFIG_PATH):
                return False
            
            # Load current config to compare changes
            current_config = self.get_config()
            
            # No need to create backups of the configuration file
            
            # Write new config directly (www-data has write permissions)
            with open(BACKUP_CONFIG_PATH, 'w') as f:
                json.dump(new_config, f, indent=2)
            
            self.logger.info("Configuration updated successfully")
            return True
        
        except Exception as e:
            self.logger.error(f"Failed to update configuration: {e}")
            return False
    
    
    def get_provider_config(self, provider_name: str) -> Optional[Dict[str, Any]]:
        """Get configuration for a specific provider"""
        try:
            config = self.get_config()
            providers = config.get('providers', {})
            
            if provider_name not in providers:
                return None
            
            return providers[provider_name].copy()
        
        except Exception as e:
            self.logger.error(f"Failed to get provider config for {provider_name}: {e}")
            return None
    
    def get_safe_provider_config(self, provider_name: str) -> Optional[Dict[str, Any]]:
        """Get provider configuration with sensitive fields redacted"""
        config = self.get_provider_config(provider_name)
        if config:
            return redact_sensitive_fields(config)
        return None
    
    def update_provider_config(self, provider_name: str, updates: Dict[str, Any]) -> bool:
        """Update configuration for a specific provider"""
        try:
            # Check and update configuration if needed before processing
            if not check_and_update_config():
                self.logger.warning("Configuration update check failed, continuing with existing config")
            
            if not os.path.exists(BACKUP_CONFIG_PATH):
                return False
            
            # Load current config
            config = self.get_config()
            
            # Validate provider exists
            if 'providers' not in config:
                config['providers'] = {}
            
            if provider_name not in config['providers']:
                return False
            
            # No need to create backups of the configuration file
            
            # Update provider config
            config['providers'][provider_name].update(updates)
            
            # Write updated config directly (www-data has write permissions)
            with open(BACKUP_CONFIG_PATH, 'w') as f:
                json.dump(config, f, indent=2)
            
            self.logger.info(f"Provider configuration updated for {provider_name}")
            return True
        
        except Exception as e:
            self.logger.error(f"Failed to update provider config for {provider_name}: {e}")
            return False
    
    def get_provider_schema(self) -> Dict[str, Any]:
        """Get comprehensive provider configuration schema"""
        return {
            'local': {
                'name': 'Local File System',
                'description': 'Store backups on the local file system',
                'status': 'available',
                'config_fields': {
                    'enabled': {
                        'type': 'boolean',
                        'description': 'Enable or disable the local provider',
                        'default': False,
                        'required': False
                    },
                    'path': {
                        'type': 'string',
                        'description': 'Local directory path for storing backups',
                        'default': '/var/backups/homeserver',
                        'required': True,
                        'validation': {
                            'pattern': '^/[a-zA-Z0-9_/.-]+$',
                            'message': 'Must be a valid absolute path'
                        }
                    }
                }
            },
            'backblaze': {
                'name': 'Backblaze B2',
                'description': 'Store backups on Backblaze B2 cloud storage',
                'status': 'available',
                'config_fields': {
                    'enabled': {
                        'type': 'boolean',
                        'description': 'Enable or disable the Backblaze provider',
                        'default': False,
                        'required': False
                    },
                    'application_key_id': {
                        'type': 'string',
                        'description': 'Backblaze B2 Application Key ID',
                        'default': '',
                        'required': True,
                        'validation': {
                            'pattern': '^K[0-9a-zA-Z]{19}$',
                            'message': 'Must be a valid Backblaze B2 Application Key ID (starts with K, 20 characters)'
                        }
                    },
                    'application_key': {
                        'type': 'string',
                        'description': 'Backblaze B2 Application Key',
                        'default': '',
                        'required': True,
                        'validation': {
                            'pattern': '^K[0-9a-zA-Z]{31}$',
                            'message': 'Must be a valid Backblaze B2 Application Key (starts with K, 32 characters)'
                        }
                    },
                    'container': {
                        'type': 'string',
                        'description': 'B2 bucket name for storing backups',
                        'default': 'homeserver-backups',
                        'required': True,
                        'validation': {
                            'pattern': '^[a-zA-Z0-9-]{3,63}$',
                            'message': 'Must be a valid B2 bucket name (3-63 characters, alphanumeric and hyphens)'
                        }
                    },
                    'container_type': {
                        'type': 'string',
                        'description': 'Container type (always bucket for B2)',
                        'default': 'bucket',
                        'required': False,
                        'readonly': True
                    },
                    'region': {
                        'type': 'string',
                        'description': 'B2 region identifier',
                        'default': 'us-west-000',
                        'required': False,
                        'options': ['us-west-000', 'us-west-001', 'us-west-002', 'us-east-000', 'us-east-001', 'eu-central-000']
                    },
                    'max_retries': {
                        'type': 'integer',
                        'description': 'Maximum number of retry attempts for failed operations',
                        'default': 3,
                        'required': False,
                        'validation': {
                            'min': 1,
                            'max': 10,
                            'message': 'Must be between 1 and 10'
                        }
                    },
                    'retry_delay': {
                        'type': 'number',
                        'description': 'Initial delay between retry attempts in seconds',
                        'default': 1.0,
                        'required': False,
                        'validation': {
                            'min': 0.1,
                            'max': 60.0,
                            'message': 'Must be between 0.1 and 60.0 seconds'
                        }
                    },
                    'timeout': {
                        'type': 'integer',
                        'description': 'Request timeout in seconds',
                        'default': 300,
                        'required': False,
                        'validation': {
                            'min': 30,
                            'max': 3600,
                            'message': 'Must be between 30 and 3600 seconds'
                        }
                    },
                    'max_bandwidth': {
                        'type': 'integer',
                        'description': 'Maximum bandwidth in bytes per second (null for unlimited)',
                        'default': None,
                        'required': False,
                        'validation': {
                            'min': 1024,
                            'message': 'Must be at least 1024 bytes per second'
                        }
                    },
                    'upload_chunk_size': {
                        'type': 'integer',
                        'description': 'Upload chunk size in bytes for large files',
                        'default': 104857600,
                        'required': False,
                        'validation': {
                            'min': 1048576,
                            'max': 1073741824,
                            'message': 'Must be between 1MB and 1GB'
                        }
                    },
                    'encryption_enabled': {
                        'type': 'boolean',
                        'description': 'Enable client-side encryption',
                        'default': False,
                        'required': False
                    },
                    'encryption_key': {
                        'type': 'string',
                        'description': 'Encryption key (auto-generated if not provided)',
                        'default': None,
                        'required': False
                    },
                    'encryption_salt': {
                        'type': 'string',
                        'description': 'Encryption salt (auto-generated if not provided)',
                        'default': None,
                        'required': False
                    },
                    'connection_pool_size': {
                        'type': 'integer',
                        'description': 'Maximum number of concurrent connections',
                        'default': 5,
                        'required': False,
                        'validation': {
                            'min': 1,
                            'max': 20,
                            'message': 'Must be between 1 and 20'
                        }
                    },
                    'username': {
                        'type': 'string',
                        'description': 'Legacy field for compatibility (not used for B2)',
                        'default': '',
                        'required': False,
                        'deprecated': True
                    },
                    'password': {
                        'type': 'string',
                        'description': 'Legacy field for compatibility (not used for B2)',
                        'default': '',
                        'required': False,
                        'deprecated': True
                    }
                }
            },
            'google_cloud_storage': {
                'name': 'Google Cloud Storage',
                'description': 'Store backups on Google Cloud Storage',
                'status': 'future_development',
                'config_fields': {
                    'enabled': {
                        'type': 'boolean',
                        'description': 'Enable or disable the Google Cloud Storage provider',
                        'default': False,
                        'required': False
                    },
                    'credentials_file': {
                        'type': 'string',
                        'description': 'Path to Google Cloud service account key JSON file',
                        'default': 'gcs_credentials.json',
                        'required': True,
                        'validation': {
                            'pattern': '^[a-zA-Z0-9_/.-]+\\.json$',
                            'message': 'Must be a valid JSON file path'
                        }
                    },
                    'container': {
                        'type': 'string',
                        'description': 'GCS bucket name for storing backups',
                        'default': 'homeserver-backups',
                        'required': True,
                        'validation': {
                            'pattern': '^[a-zA-Z0-9][a-zA-Z0-9-]{2,61}[a-zA-Z0-9]$',
                            'message': 'Must be a valid GCS bucket name'
                        }
                    },
                    'container_type': {
                        'type': 'string',
                        'description': 'Container type (always bucket for GCS)',
                        'default': 'bucket',
                        'required': False,
                        'readonly': True
                    },
                    'bucket_name': {
                        'type': 'string',
                        'description': 'GCS bucket name (alias for container)',
                        'default': 'homeserver-backups',
                        'required': True
                    },
                    'project_id': {
                        'type': 'string',
                        'description': 'Google Cloud project ID',
                        'default': '',
                        'required': True,
                        'validation': {
                            'pattern': '^[a-z][a-z0-9-]{4,28}[a-z0-9]$',
                            'message': 'Must be a valid Google Cloud project ID'
                        }
                    },
                    'max_retries': {
                        'type': 'integer',
                        'description': 'Maximum number of retry attempts',
                        'default': 3,
                        'required': False,
                        'validation': {
                            'min': 1,
                            'max': 10,
                            'message': 'Must be between 1 and 10'
                        }
                    },
                    'retry_delay': {
                        'type': 'number',
                        'description': 'Initial delay between retry attempts in seconds',
                        'default': 1.0,
                        'required': False,
                        'validation': {
                            'min': 0.1,
                            'max': 60.0,
                            'message': 'Must be between 0.1 and 60.0 seconds'
                        }
                    },
                    'timeout': {
                        'type': 'integer',
                        'description': 'Request timeout in seconds',
                        'default': 300,
                        'required': False,
                        'validation': {
                            'min': 30,
                            'max': 3600,
                            'message': 'Must be between 30 and 3600 seconds'
                        }
                    },
                    'username': {
                        'type': 'string',
                        'description': 'Legacy field for compatibility (not used for GCS)',
                        'default': '',
                        'required': False,
                        'deprecated': True
                    },
                    'password': {
                        'type': 'string',
                        'description': 'Legacy field for compatibility (not used for GCS)',
                        'default': '',
                        'required': False,
                        'deprecated': True
                    }
                }
            }
        }
    
    def increment_backup_count(self) -> bool:
        """Increment the backup count in the configuration file."""
        try:
            # Check and update configuration if needed before processing
            if not check_and_update_config():
                self.logger.warning("Configuration update check failed, continuing with existing config")
            
            if not os.path.exists(BACKUP_CONFIG_PATH):
                self.logger.error("Configuration file not found")
                return False
            
            # Load current config
            config = self.get_config()
            
            # Initialize state section if it doesn't exist
            if 'state' not in config:
                config['state'] = {}
            
            # Increment backup count in state section
            current_count = config['state'].get('backup_count', 0)
            config['state']['backup_count'] = current_count + 1
            
            # Write updated config directly (www-data has write permissions)
            with open(BACKUP_CONFIG_PATH, 'w') as f:
                json.dump(config, f, indent=2)
            
            self.logger.info(f"Backup count incremented to {config['state']['backup_count']}")
            return True
        
        except Exception as e:
            self.logger.error(f"Failed to increment backup count: {e}")
            return False
    
    def get_global_schema(self) -> Dict[str, Any]:
        """Get global configuration schema"""
        return {
            'backup_items': {
                'type': 'array',
                'description': 'List of files and directories to backup',
                'default': ['/tmp/test.txt'],
                'required': True,
                'validation': {
                    'min_items': 1,
                    'message': 'At least one backup item must be specified'
                }
            },
            'retention_days': {
                'type': 'integer',
                'description': 'Number of days to retain backups',
                'default': 30,
                'required': False,
                'validation': {
                    'min': 1,
                    'max': 3650,
                    'message': 'Must be between 1 and 3650 days'
                }
            },
            'state': {
                'type': 'object',
                'description': 'Backup system state and tracking data',
                'required': False,
                'properties': {
                    'encryption_enabled': {
                        'type': 'boolean',
                        'description': 'Enable global encryption for backup packages',
                        'default': True
                    },
                    'backup_count': {
                        'type': 'integer',
                        'description': 'Total number of backups performed',
                        'default': 0
                    }
                }
            },
            'logging': {
                'type': 'object',
                'description': 'Logging configuration',
                'required': False,
                'properties': {
                    'enabled': {
                        'type': 'boolean',
                        'description': 'Enable logging',
                        'default': True
                    },
                    'log_file': {
                        'type': 'string',
                        'description': 'Path to log file',
                        'default': '/var/log/homeserver/backup.log'
                    },
                    'log_level': {
                        'type': 'string',
                        'description': 'Logging level',
                        'default': 'INFO',
                        'options': ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
                    },
                    'max_file_size_mb': {
                        'type': 'integer',
                        'description': 'Maximum log file size in MB',
                        'default': 10,
                        'validation': {
                            'min': 1,
                            'max': 1000,
                            'message': 'Must be between 1 and 1000 MB'
                        }
                    },
                    'backup_count': {
                        'type': 'integer',
                        'description': 'Number of backup log files to keep',
                        'default': 5,
                        'validation': {
                            'min': 1,
                            'max': 50,
                            'message': 'Must be between 1 and 50'
                        }
                    },
                    'format': {
                        'type': 'string',
                        'description': 'Log message format',
                        'default': '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
                    }
                }
            }
        }