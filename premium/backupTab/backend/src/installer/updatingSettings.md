# HOMESERVER Backup Tab - Self-Contained Update System

## Overview

This document details the comprehensive update system implemented for the HOMESERVER Backup Tab, making it a truly self-contained, updateable component that preserves user configurations while seamlessly integrating new features.

## Problem Statement

The original backup tab had a critical limitation: when the tab was updated with new features or configuration options, it would overwrite the user's existing configuration, potentially losing their custom settings, credentials, and preferences. This made updates risky and user-unfriendly.

## Solution Architecture

### Two-Tier Configuration System

We implemented a sophisticated two-tier configuration approach:

1. **Template Configuration** (`src/config/settings.json`)
   - Contains the latest default settings with all available fields
   - Serves as the "source of truth" for new features
   - Updated when new providers or settings are added

2. **System Configuration** (`/etc/backupTab/settings.json`)
   - Contains the user's actual configuration with their customizations
   - Preserved during updates
   - Used by all backup system components

### Intelligent Configuration Merging

The core innovation is the `updateSettings.py` script that performs intelligent JSON field merging:

- **Additive Updates**: Only adds new fields, never overwrites existing ones
- **Provider-Specific Handling**: Preserves user credentials while adding new provider options
- **Nested Object Merging**: Recursively merges complex configuration structures
- **Validation**: Ensures merged configuration maintains data integrity

## Implementation Details

### 1. Configuration Management (`ConfigManager`)

**File**: `src/utils/config_manager.py`

```python
def __init__(self, config_file: str = None):
    # Use system config by default, fallback to template
    if config_file is None:
        system_config = Path("/etc/backupTab/settings.json")
        template_config = Path("src/config/settings.json")
        self.config_file = system_config if system_config.exists() else template_config
```

**Key Features**:
- Automatic fallback from system config to template
- Graceful handling of missing configuration files
- Default configuration generation when needed

### 2. Intelligent Settings Updater (`updateSettings.py`)

**File**: `src/installer/updateSettings.py`

**Core Functionality**:
- **Field Detection**: Identifies new fields in template vs system config
- **Safe Merging**: Adds new fields without modifying existing ones
- **Provider Handling**: Special logic for cloud provider configurations
- **Backup Creation**: Automatic timestamped backups before changes
- **Validation**: Ensures merged configuration is valid

**Key Methods**:
```python
def merge_configurations(self, template: Dict[str, Any], system: Dict[str, Any]) -> Dict[str, Any]:
    """Intelligently merge template into system configuration."""
    
def _merge_provider_configs(self, template: Dict[str, Any], merged: Dict[str, Any]) -> None:
    """Handle special merging logic for provider configurations."""
    
def validate_configuration(self, config: Dict[str, Any]) -> bool:
    """Validate merged configuration structure."""
```

### 3. Automatic Update Integration (`routes.py`)

**File**: `routes.py`

**New Functionality**:
```python
def check_and_update_config():
    """Check if configuration needs updating and run update script if needed."""
```

**Integration Points**:
- `GET /config` - Automatically checks for updates before serving configuration
- `POST /config` - Ensures configuration is up-to-date before processing updates
- Dry-run detection - Only runs updates when new fields are detected

### 4. System-Wide Integration (`setupEnvironment.py`)

**File**: `src/installer/setupEnvironment.py`

**New Features**:
- Creates `/etc/backupTab/` directory during installation
- Copies template to system location (only if it doesn't exist)
- Sets proper permissions and ownership
- Creates system-wide symlinks for easy access

**System Commands Created**:
- `homeserver-backup` - Main backup CLI
- `homeserver-backup-update-settings` - Configuration updater

## Update Workflow

### 1. Initial Installation
```
Template Config → /etc/backupTab/settings.json
User can customize → /etc/backupTab/settings.json (preserved)
```

### 2. Tab Update Process
```
1. New template with additional fields
2. User accesses backup tab
3. System detects new fields via dry-run
4. Automatic merge preserves user settings
5. New features available immediately
```

### 3. Manual Update Process
```bash
# Check what would be updated
homeserver-backup-update-settings --dry-run

# Apply updates
homeserver-backup-update-settings
```

## Safety Features

### 1. Backup System
- **Automatic Backups**: Timestamped backups before any changes
- **Rollback Capability**: Easy restoration from backup files
- **Non-Destructive**: Never overwrites user data

### 2. Validation
- **Structure Validation**: Ensures merged config maintains required fields
- **Type Checking**: Validates data types and formats
- **Provider Validation**: Ensures provider configurations are complete

### 3. Error Handling
- **Graceful Degradation**: Continues with existing config if update fails
- **Timeout Protection**: Prevents hanging on long operations
- **Detailed Logging**: Comprehensive error reporting

## Example Update Scenario

### Before Update (User's Config)
```json
{
  "providers": {
    "aws_s3": {
      "enabled": true,
      "bucket": "my-custom-bucket",
      "access_key": "AKIA...",
      "secret_key": "wJalr..."
    }
  },
  "retention_days": 60
}
```

### Template Update (New Version)
```json
{
  "providers": {
    "aws_s3": {
      "enabled": false,
      "bucket": "homeserver-backups",
      "new_field": "default_value"
    },
    "azure_blob": {
      "enabled": false,
      "container": "homeserver-backups"
    }
  },
  "compression": {
    "enabled": true,
    "level": 6
  }
}
```

### After Automatic Update
```json
{
  "providers": {
    "aws_s3": {
      "enabled": true,           // PRESERVED
      "bucket": "my-custom-bucket", // PRESERVED
      "access_key": "AKIA...",   // PRESERVED
      "secret_key": "wJalr...",  // PRESERVED
      "new_field": "default_value" // ADDED
    },
    "azure_blob": {              // ADDED
      "enabled": false,
      "container": "homeserver-backups"
    }
  },
  "retention_days": 60,          // PRESERVED
  "compression": {               // ADDED
    "enabled": true,
    "level": 6
  }
}
```


## File Structure

```
/etc/backupTab/
├── settings.json                    # User's configuration
├── settings.json.backup.*          # Automatic backups
└── ...

/var/www/homeserver/premium/backupTab/backend/
├── src/
│   ├── config/
│   │   └── settings.json           # Template configuration
│   ├── installer/
│   │   ├── setupEnvironment.py     # Installation system
│   │   └── updateSettings.py       # Update system
│   └── utils/
│       └── config_manager.py       # Configuration management
├── routes.py                       # API with auto-update
└── backup                          # CLI with system config
```

## Usage Examples

### For Users
```bash
# Check configuration status
homeserver-backup list-providers

# View current settings
homeserver-backup-update-settings --dry-run

# Manual configuration update
homeserver-backup-update-settings
```

### For Developers
```python
# Adding new provider to template
"new_provider": {
    "enabled": false,
    "new_field": "default_value"
}

# System automatically merges on next access
```
