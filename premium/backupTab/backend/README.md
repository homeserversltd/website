# HOMESERVER Backup System

Professional-grade backup system with modular provider support for HOMESERVER installations.

## Structure

```
backend/
├── backup                    # Main CLI interface
└── src/                      # Source code modules
    ├── providers/            # Storage provider implementations
    │   ├── __init__.py
    │   ├── base.py          # Abstract base provider
    │   ├── local.py         # Local filesystem provider
    │   ├── aws_s3.py        # AWS S3 provider
    │   ├── google_cloud_storage.py  # Google Cloud Storage provider
    │   └── backblaze.py     # Backblaze B2 provider
    ├── service/              # Service layer
    │   ├── __init__.py
    │   └── backup_service.py # Main service implementation
    ├── installer/            # Installation utilities
    │   ├── __init__.py
    │   └── install_backup_service.py # Installation logic
    ├── config/               # Configuration files
    │   ├── __init__.py
    │   └── homeserver-backup.service # Systemd service file
    └── settings.json         # Default configuration
```

## Features

- **Modular Provider System**: Support for multiple storage backends
- **Encryption**: FAK-based encryption for secure backups
- **Compression**: Configurable compression levels
- **Retention Policies**: Automatic cleanup of old backups
- **Service Integration**: Systemd service and cron job support
- **CLI Interface**: Comprehensive command-line interface

## Installation

### Quick Install
```bash
# Install the backup system
python3 src/installer/install_backup_service.py

# Uninstall the backup system
python3 src/installer/install_backup_service.py --uninstall
```

### Manual Installation
```bash
# Copy files to system
sudo cp -r src/ /var/www/homeserver/backup/
sudo cp backup /var/www/homeserver/backup/
sudo chmod +x /var/www/homeserver/backup/backup

# Install systemd service
sudo cp src/config/homeserver-backup.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable homeserver-backup.service
```

## Usage

### CLI Interface
```bash
# Create a backup
./backup create

# List available backups
./backup list

# Test provider connections
./backup test-providers

# Download a backup
./backup download backup_name --provider local

# Test complete backup cycle
./backup test-cycle
```

### Service Interface
```bash
# Run service directly
python3 src/service/backup_service.py --backup

# Test connections
python3 src/service/backup_service.py --test

# List backups
python3 src/service/backup_service.py --list

# Clean up old backups
python3 src/service/backup_service.py --cleanup
```

## Configuration

The system uses JSON configuration files. Default configuration is created automatically:

```json
{
  "backup_items": [
    "/var/www/homeserver/src",
    "/var/lib/gogs",
    "/etc/homeserver"
  ],
  "providers": {
    "local": {
      "enabled": true,
      "path": "/var/www/homeserver/backup"
    },
    "aws_s3": {
      "enabled": false,
      "bucket": "homeserver-backups",
      "region": "us-east-1",
      "access_key": "",
      "secret_key": ""
    }
  },
  "encryption": {
    "enabled": true,
    "fak_path": "/root/key/skeleton.key"
  },
  "compression": {
    "enabled": true,
    "level": 6
  },
  "retention": {
    "days": 30,
    "max_backups": 10
  }
}
```

## Providers

### Local Provider
Stores backups on the local filesystem.

```json
{
  "local": {
    "enabled": true,
    "path": "/var/www/homeserver/backup"
  }
}
```

### AWS S3 Provider
Stores backups in Amazon S3.

```json
{
  "aws_s3": {
    "enabled": true,
    "bucket": "homeserver-backups",
    "region": "us-east-1",
    "access_key": "your_access_key",
    "secret_key": "your_secret_key"
  }
}
```

### Google Cloud Storage Provider
Stores backups in Google Cloud Storage.

```json
{
  "google_cloud_storage": {
    "enabled": true,
    "credentials_file": "/path/to/service-account-key.json",
    "project_id": "your-project-id",
    "bucket_name": "homeserver-backups"
  }
}
```

### Backblaze B2 Provider
Stores backups in Backblaze B2.

```json
{
  "backblaze": {
    "enabled": true,
    "application_key_id": "your_key_id",
    "application_key": "your_key",
    "bucket": "homeserver-backups"
  }
}
```

## Security

- **Encryption**: All backups are encrypted using the Factory Access Key (FAK)
- **Permissions**: Service runs as www-data user with minimal privileges
- **Isolation**: Systemd security settings prevent privilege escalation
- **Logging**: All operations are logged for audit purposes

## Monitoring

- **Logs**: Check `/var/log/homeserver/backup.log`
- **Service Status**: `systemctl status homeserver-backup.service`
- **Cron Logs**: Check system cron logs for scheduled backups

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure all dependencies are installed
2. **Permission Errors**: Check file permissions and ownership
3. **Provider Errors**: Verify provider configuration and credentials
4. **Service Errors**: Check systemd logs and service status

### Debug Mode

Run with verbose output:
```bash
./backup create --verbose
```

### Test Mode

Test provider connections:
```bash
./backup test-providers
```

## Development

### Adding New Providers

1. Create a new provider class in `src/providers/`
2. Inherit from `BaseProvider`
3. Implement all abstract methods
4. Add to `PROVIDERS` registry in `src/providers/__init__.py`

### Testing

Run the test suite:
```bash
python3 test_backup.py
```

## License

Copyright (C) 2024 HOMESERVER LLC. All rights reserved.