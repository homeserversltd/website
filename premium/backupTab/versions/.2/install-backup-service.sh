#!/bin/bash
# HOMESERVER Backup Service Installation Script
# Installs cronjob and Python backup scripts

echo "=========================================="
echo "HOMESERVER Backup Service Installation"
echo "=========================================="
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root for system installation."
   echo "Please run: sudo $0"
   exit 1
fi

# Create backup directory structure
BACKUP_DIR="/var/www/homeserver/backup"
echo "Creating backup directory structure..."
mkdir -p "$BACKUP_DIR"
mkdir -p "/tmp/homeserver-backups"
mkdir -p "/var/log/homeserver"

# Set ownership to www-data
chown -R www-data:www-data "$BACKUP_DIR"
chown -R www-data:www-data "/tmp/homeserver-backups"
chown -R www-data:www-data "/var/log/homeserver"

echo "✓ Directory structure created"

# Copy Python scripts
echo "Installing backup scripts..."
cp backup_service.py "$BACKUP_DIR/"
cp restore_service.py "$BACKUP_DIR/"
cp list_backups.py "$BACKUP_DIR/"
cp backup_config.json "$BACKUP_DIR/"
cp restore_config_template.json "$BACKUP_DIR/"

# Make scripts executable
chmod +x "$BACKUP_DIR/backup_service.py"
chmod +x "$BACKUP_DIR/restore_service.py"
chmod +x "$BACKUP_DIR/list_backups.py"

echo "✓ Backup scripts installed"

# Install cronjob
echo "Installing cronjob..."
if [ -f "homeserver-backup.cron" ]; then
    cp homeserver-backup.cron /etc/cron.d/homeserver-backup
    chmod 644 /etc/cron.d/homeserver-backup
    echo "✓ Cronjob installed"
else
    echo "WARNING: homeserver-backup.cron not found, skipping cronjob installation"
fi

# Set up logrotate
echo "Setting up log rotation..."
cat > /etc/logrotate.d/homeserver-backup << 'EOF'
/var/log/homeserver/backup.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
}
EOF

echo "✓ Log rotation configured"

# Install systemd service (optional, for manual triggering)
if [ -f "homeserver-backup.service" ]; then
    echo "Installing systemd service (for manual triggering)..."
    cp homeserver-backup.service /etc/systemd/system/
    systemctl daemon-reload
    echo "✓ Systemd service installed"
fi

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Backup directory: $BACKUP_DIR"
echo "Configuration: $BACKUP_DIR/backup_config.json"
echo "Logs: $BACKUP_DIR/backup.log"
echo ""
echo "Next steps:"
echo "1. Configure backup providers in backup_config.json"
echo "2. Set up provider credentials using keyman suite:"
echo "   /vault/keyman/newkey.sh aws_s3 <username> <password>"
echo "   /vault/keyman/newkey.sh google_drive <username> <password>"
echo "   /vault/keyman/newkey.sh dropbox <username> <password>"
echo "   /vault/keyman/newkey.sh backblaze <username> <password>"
echo "3. Test the backup:"
echo "   sudo -u www-data python3 $BACKUP_DIR/backup_service.py"
echo ""
echo "Restore Operations:"
echo "  List backups:     sudo -u www-data python3 $BACKUP_DIR/list_backups.py all"
echo "  List provider:    sudo -u www-data python3 $BACKUP_DIR/list_backups.py <provider>"
echo "  Get metadata:     sudo -u www-data python3 $BACKUP_DIR/list_backups.py <provider> --metadata <backup_name>"
echo "  Restore backup:   sudo -u www-data python3 $BACKUP_DIR/restore_service.py <restore_config.json>"
echo ""
echo "Cronjob Management:"
echo "  View cronjob:    cat /etc/cron.d/homeserver-backup"
echo "  Remove cronjob:  rm /etc/cron.d/homeserver-backup"
echo "  Manual backup:   sudo -u www-data python3 $BACKUP_DIR/backup_service.py"
echo ""
echo "This is a professional-grade backup system for HOMESERVER infrastructure."
echo "Configure it properly and maintain your own security practices."
echo ""
echo "=========================================="