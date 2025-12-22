# HOMESERVER Backup Configuration Management

This document explains the intelligent configuration management system for the HOMESERVER Backup Tab.

## Overview

The backup system uses a two-tier configuration approach:

1. **Template Configuration** (`src/config/settings.json`) - Contains the latest default settings with all available fields
2. **System Configuration** (`/etc/backupTab/settings.json`) - Contains the user's actual configuration with their customizations

## How It Works

### Initial Installation

When the backup tab is installed via `setupEnvironment.py`:

1. Creates `/etc/backupTab/` directory
2. Copies `src/config/settings.json` to `/etc/backupTab/settings.json` (if it doesn't exist)
3. Sets proper permissions (www-data:www-data, 644)
4. All backup components read from the system configuration

### Configuration Updates

When the backup tab is updated with new features:

1. The template `src/config/settings.json` gets new fields
2. Run `homeserver-backup-update-settings` to intelligently merge changes
3. User's existing configuration is preserved
4. Only new fields are added from the template

## Usage

### Viewing Configuration Differences

```bash
# Show what would be updated (dry run)
homeserver-backup-update-settings --dry-run

# Show differences with custom paths
homeserver-backup-update-settings --template /path/to/template.json --system /path/to/system.json --dry-run
```

### Updating Configuration

```bash
# Update system configuration with new fields
homeserver-backup-update-settings

# Update with custom paths
homeserver-backup-update-settings --template /path/to/template.json --system /path/to/system.json
```

### Manual Configuration

Users can directly edit `/etc/backupTab/settings.json` to customize their backup settings. The system will preserve these customizations during updates.

## Intelligent Merging Features

### Field-Level Merging

- **New Fields**: Added from template to system config
- **Existing Fields**: Preserved from system config (user's values)
- **Nested Objects**: Recursively merged (e.g., provider configurations)

### Provider-Specific Handling

- **New Providers**: Completely added from template
- **Existing Providers**: New fields added, existing fields preserved
- **User Credentials**: Always preserved (passwords, keys, etc.)

### Example Update Scenario

**Template (new version):**
```json
{
  "providers": {
    "aws_s3": {
      "enabled": false,
      "bucket": "homeserver-backups",
      "region": "us-east-1",
      "new_field": "default_value"  // NEW FIELD
    },
    "azure_blob": {  // NEW PROVIDER
      "enabled": false,
      "container": "homeserver-backups"
    }
  },
  "compression": {  // NEW SECTION
    "enabled": true,
    "level": 6
  }
}
```

**System (user's config):**
```json
{
  "providers": {
    "aws_s3": {
      "enabled": true,  // User enabled this
      "bucket": "my-custom-bucket",  // User customized this
      "region": "us-west-2",  // User customized this
      "access_key": "AKIA...",  // User's credentials
      "secret_key": "wJalr..."  // User's credentials
    }
  },
  "retention_days": 60  // User customized this
}
```

**After Update:**
```json
{
  "providers": {
    "aws_s3": {
      "enabled": true,  // PRESERVED
      "bucket": "my-custom-bucket",  // PRESERVED
      "region": "us-west-2",  // PRESERVED
      "access_key": "AKIA...",  // PRESERVED
      "secret_key": "wJalr...",  // PRESERVED
      "new_field": "default_value"  // ADDED
    },
    "azure_blob": {  // ADDED
      "enabled": false,
      "container": "homeserver-backups"
    }
  },
  "retention_days": 60,  // PRESERVED
  "compression": {  // ADDED
    "enabled": true,
    "level": 6
  }
}
```

## Safety Features

### Backup Creation

Before any update, the system creates a timestamped backup:
- `/etc/backupTab/settings.json.backup.20241201_143022`

### Validation

The merged configuration is validated to ensure:
- Required fields are present
- Provider structures are valid
- Data types are correct

### Error Handling

- Invalid JSON files are handled gracefully
- Missing files are created from templates
- Failed updates don't corrupt existing configuration

## File Locations

- **Template**: `src/config/settings.json`
- **System Config**: `/etc/backupTab/settings.json`
- **Backups**: `/etc/backupTab/settings.json.backup.*`
- **Updater Script**: `src/installer/updateSettings.py`
- **System Command**: `/usr/local/bin/homeserver-backup-update-settings`

## Integration Points

### Backup CLI
- Reads from `/etc/backupTab/settings.json` by default
- Falls back to template if system config doesn't exist

### Web Interface
- API endpoints read/write to `/etc/backupTab/settings.json`
- Sensitive fields are redacted in responses

### Service Scripts
- All backup operations use the system configuration
- Cron jobs and automated tasks use system config

## Testing

Run the test script to verify the configuration management:

```bash
cd /var/www/homeserver/premium/backup
python3 test_config_system.py
```

This will demonstrate:
- Template vs system configuration differences
- Intelligent merging of new fields
- Preservation of user customizations
- Addition of new providers and settings

## Best Practices

1. **Always test updates** with `--dry-run` first
2. **Backup before updates** (automatic, but good to verify)
3. **Review changes** after updates to ensure expected behavior
4. **Document customizations** for easier troubleshooting
5. **Use version control** for major configuration changes

## Troubleshooting

### Configuration Not Updating
- Check file permissions on `/etc/backupTab/settings.json`
- Verify template file exists and is valid JSON
- Run with `--verbose` flag for detailed output

### Lost User Settings
- Check backup files in `/etc/backupTab/`
- Restore from most recent backup if needed
- Re-run update with `--dry-run` to see what would change

### Invalid Configuration
- Validate JSON syntax manually
- Check for missing required fields
- Restore from backup and re-run update

## Future Enhancements

- Configuration validation rules
- Migration scripts for major version changes
- Configuration templates for different use cases
- Web-based configuration diff viewer
- Automated configuration health checks