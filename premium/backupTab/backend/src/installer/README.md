# HOMESERVER Backup System Installer

## Self-Contained Installation

The backup system now includes a self-contained installer that automatically:

- Creates a dedicated virtual environment
- Installs all dependencies from requirements files
- Sets up proper permissions and ownership
- Creates system links for easy access
- Installs cron jobs for automated backups
- Tests the installation

## Usage

### Install the Backup System

```bash
# Using the main backup CLI
python3 backup install

# Or directly using the installer
python3 src/installer/self_contained_installer.py
```

### Uninstall the Backup System

```bash
# Using the main backup CLI
python3 backup uninstall

# Or directly using the installer
python3 src/installer/self_contained_installer.py --uninstall
```

## Installation Details

### What Gets Installed

- **Virtual Environment**: `/var/www/homeserver/backup/venv/`
- **Source Files**: `/var/www/homeserver/backup/src/`
- **Main Script**: `/var/www/homeserver/backup/backup`
- **Wrapper Script**: `/var/www/homeserver/backup/backup-venv`
- **System Link**: `/usr/local/bin/homeserver-backup` (requires root)
- **Cron Job**: `/etc/cron.d/homeserver-backup` (requires root)
- **Log Directory**: `/var/log/homeserver/`

### Dependencies

The installer automatically installs dependencies from:

1. `requirements.txt` - Core and optional dependencies
2. `src/installer/requirements.txt` - Additional installer-specific dependencies

### Requirements Files Used

The installer looks for and installs from these requirements files:

- `backend/requirements.txt` - Main requirements file
- `backend/src/installer/requirements.txt` - Installer-specific requirements

If no requirements files are found, it falls back to installing essential core dependencies.

### Virtual Environment

The installer creates a dedicated virtual environment at `/var/www/homeserver/backup/venv/` that contains all the Python dependencies needed for the backup system. This isolates the backup system from other Python packages on the system.

### Wrapper Script

A wrapper script `backup-venv` is created that automatically uses the virtual environment when running the backup system. This ensures all dependencies are available.

### System Integration

When run as root, the installer also:

- Sets proper ownership (`www-data:www-data`)
- Creates system-wide symlink (`/usr/local/bin/homeserver-backup`)
- Installs automated cron job for daily backups
- Sets up log directory with proper permissions

### Non-Root Installation

The installer can also run without root privileges, but with limited functionality:

- No system-wide links
- No cron job installation
- Limited permission setting
- User must run backup system directly from installation directory

## Usage After Installation

### With Root Installation

```bash
# System-wide command (if installed as root)
homeserver-backup create
homeserver-backup list
homeserver-backup test-providers

# Or using the wrapper directly
/var/www/homeserver/backup/backup-venv create
```

### Without Root Installation

```bash
# Direct wrapper usage
/var/www/homeserver/backup/backup-venv create
/var/www/homeserver/backup/backup-venv list
```

## Troubleshooting

### Installation Issues

1. **Python Version**: Requires Python 3.7+
2. **Missing Tools**: Requires `python3`, `pip3`, and `python3-venv`
3. **Permissions**: Some features require root access
4. **Dependencies**: Optional cloud provider dependencies may fail but won't stop installation

### Testing Installation

```bash
# Test the installation
homeserver-backup test-providers

# Or using the service directly
python3 /var/www/homeserver/backup/venv/bin/python /var/www/homeserver/backup/src/service/backup_service.py --test
```

### Manual Cleanup

If automatic uninstallation fails:

```bash
# Remove installation directory
sudo rm -rf /var/www/homeserver/backup

# Remove system link
sudo rm -f /usr/local/bin/homeserver-backup

# Remove cron job
sudo rm -f /etc/cron.d/homeserver-backup
```

## Features

- **Isolated Environment**: Uses virtual environment for dependency isolation
- **Graceful Degradation**: Continues installation even if optional dependencies fail
- **Requirements File Support**: Automatically installs from existing requirements files
- **System Integration**: Full system integration when run as root
- **Easy Uninstallation**: Complete removal of all installed components
- **Installation Testing**: Automatically tests installation after completion