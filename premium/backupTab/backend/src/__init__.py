"""
HOMESERVER Backup System
Copyright (C) 2024 HOMESERVER LLC

Enhanced backup system with modular provider support for HOMESERVER platform.
Provides comprehensive backup functionality with multiple storage providers,
encryption, compression, and automated service management.
"""

# Version information
__version__ = "1.0.0"
__author__ = "HOMESERVER LLC"
__copyright__ = "Copyright (C) 2024 HOMESERVER LLC"

# Core imports
from .service.backup_service import BackupService

# Provider system imports
try:
    from .providers import get_provider, PROVIDERS
    from .providers.base import BaseProvider
    from .providers.local import LocalProvider
except ImportError as e:
    # Graceful degradation if providers fail to import
    print(f"WARNING: Provider system import failed: {e}")
    PROVIDERS = {}
    get_provider = None
    BaseProvider = None
    LocalProvider = None

# CLI import (conditional to avoid circular imports)
def get_cli():
    """Get the EnhancedBackupCLI class when needed."""
    try:
        import sys
        from pathlib import Path
        # Add parent directory to path to import the backup CLI
        parent_dir = Path(__file__).parent.parent
        sys.path.insert(0, str(parent_dir))
        from ..backup import EnhancedBackupCLI
        return EnhancedBackupCLI
    except ImportError as e:
        print(f"WARNING: Failed to import CLI: {e}")
        return None

# Public API
__all__ = [
    # Core classes
    'BackupService',
    'BaseProvider',
    'LocalProvider',
    
    # Functions
    'get_provider',
    'get_cli',
    
    # Constants
    'PROVIDERS',
    '__version__',
    '__author__',
    '__copyright__'
]

# Module metadata
__doc__ = """
HOMESERVER Backup System

A comprehensive backup solution designed for the HOMESERVER platform with:

Features:
- Multiple storage providers (Local, AWS S3, Google Cloud Storage, Backblaze)
- FAK-based encryption using skeleton.key
- Configurable compression levels
- Automated service management via systemd
- Cron-based scheduling with random delays
- Retention policy management
- Comprehensive logging and error handling

Usage:
    # Service integration
    from src import BackupService
    service = BackupService()
    service.create_backup()
    
    # Provider management
    from src import get_provider, PROVIDERS
    provider = get_provider('local', config)
    
    # CLI access
    from src import get_cli
    CLI = get_cli()
    if CLI:
        cli = CLI()
        cli.create_backup()

Architecture:
- service/: Service integration and systemd management
- providers/: Modular storage provider system
- installer/: Installation and configuration utilities
- config/: Service configuration files

The system is designed for enterprise-grade reliability with comprehensive
error handling, logging, and graceful degradation when optional dependencies
are unavailable.
"""