# HOMESERVER Backup Tab

## Overview

The HOMESERVER Backup Tab provides a professional 3-2-1 backup solution for your HOMESERVER infrastructure. This system ensures your critical data is protected with multiple copies across different storage media and locations.

## Features

- **3-2-1 Backup Strategy**: 3 copies, 2 different media types, 1 offsite
- **Automated Daily Backups**: Runs daily at 2 AM with randomization
- **Cloud Integration**: Support for 4 major cloud storage providers
- **FAK Encryption**: All backups encrypted with your Factory Access Key
- **Keyman Integration**: Secure credential management
- **Self-Contained**: Cronjob-based scheduling, no complex systemd dependencies

## Installation

1. Run the installation script as root:
   ```bash
   sudo ./system/install-backup-service.sh
   ```

2. Configure your backup settings in `/var/www/homeserver/backup/backup_config.json`

3. Set up cloud provider credentials using the keyman suite:
   ```bash
   /vault/keyman/newkey.sh aws_s3 <username> <password>
   /vault/keyman/newkey.sh google_cloud_storage <username> <password>
   /vault/keyman/newkey.sh backblaze <username> <password>
   ```

4. Enable providers in the configuration file and test:
   ```bash
   sudo -u www-data python3 /var/www/homeserver/backup/backup_service.py
   ```

## Configuration

### Backup Items

Configure what gets backed up by editing the `backup_items` list in `backup_config.json`:

```json
{
  "backup_items": [
    "/var/www/homeserver/src",
    "/var/lib/gogs",
    "/etc/homeserver",
    "/var/log/homeserver"
  ]
}
```

### Cloud Providers

Supported providers:
- **AWS S3**: `aws_s3` credentials key
- **Google Cloud Storage**: `google_cloud_storage` credentials key  
- **Backblaze B2**: `backblaze` credentials key

Enable providers in `backup_config.json`:
```json
{
  "providers": {
    "aws_s3": {
      "enabled": true,
      "credentials_key": "aws_s3",
      "bucket": "homeserver-backups"
    }
  }
}
```

### Scheduling

The system uses a simple cronjob for daily backups:
- **Daily**: 2:00 AM with 0-59 minute randomization
- **Cronjob**: Self-contained file that can be easily managed
- **Manual**: Run anytime with the Python script

## Security

- **FAK Encryption**: All backups encrypted using `/root/key/skeleton.key`
- **Keyman Integration**: Credentials managed through existing keyman suite
- **Secure Processing**: Temporary files cleaned up after processing
- **No Plaintext**: No sensitive data stored in plaintext

## Monitoring

Check backup status:
```bash
# View cronjob
cat /etc/cron.d/homeserver-backup

# View recent logs
tail -f /var/log/homeserver/backup.log

# Check backup directory
ls -la /var/www/homeserver/backup/

# Manual backup test
sudo -u www-data python3 /var/www/homeserver/backup/backup_service.py
```

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Ensure www-data owns backup directory
   - Check FAK file permissions at `/root/key/skeleton.key`

2. **Upload Failures**
   - Verify cloud provider credentials in keyman
   - Check provider configuration in backup_config.json
   - Review logs for specific error messages

3. **Encryption Errors**
   - Verify FAK file exists and is readable
   - Check Python cryptography library installation

### Manual Operations

```bash
# Run manual backup
sudo -u www-data python3 /var/www/homeserver/backup/backup_service.py

# Remove cronjob
sudo rm /etc/cron.d/homeserver-backup

# Reinstall cronjob
sudo cp system/homeserver-backup.cron /etc/cron.d/homeserver-backup
```

## File Structure

```
/var/www/homeserver/backup/
├── backup_service.py          # Main backup script
├── backup_config.json         # Configuration file
└── logs/                      # Backup logs

/tmp/homeserver-backups/       # Temporary backup processing
/var/log/homeserver/backup.log # Main log file
/etc/cron.d/homeserver-backup  # Cronjob file
```

## Integration Points

### Keyman Suite
- Uses `exportkey.sh` to get decrypted credentials
- Credentials stored in `/mnt/keyexchange/` (ramdisk)
- Automatic cleanup after 15 seconds of inactivity

### Adblock Module Pattern
- Follows same structure as adblock module
- Self-contained Python scripts
- JSON configuration files
- Cronjob-based scheduling

### FAK Encryption
- Uses `/root/key/skeleton.key` as encryption key
- PBKDF2 key derivation for security
- Fernet encryption for backup packages

## Advanced Configuration

### Custom Backup Items
Add any file or directory to the `backup_items` list in `backup_config.json`.

### Provider Configuration
Each provider can have custom settings like bucket names, folder paths, etc.

### Retention Policies
Configure retention in `backup_config.json`:
```json
{
  "retention_days": 30,
  "compression_level": 6
}
```

## Support

This is a professional-grade backup system designed for HOMESERVER infrastructure. The system integrates seamlessly with existing HOMESERVER components and follows established patterns for maintainability and security.