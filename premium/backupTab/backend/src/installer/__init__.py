"""
HOMESERVER Backup Installer Module
Copyright (C) 2024 HOMESERVER LLC

Installation and configuration utilities.
"""

from .deployBackupService import deploy_backup_service, undeploy_backup_service

try:
    from .setupEnvironment import BackupEnvironmentSetup
    __all__ = ['deploy_backup_service', 'undeploy_backup_service', 'BackupEnvironmentSetup']
except ImportError:
    # Environment setup may not be available in all environments
    __all__ = ['deploy_backup_service', 'undeploy_backup_service']