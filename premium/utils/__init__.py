"""
Premium Tab Utilities Package

This package contains utility modules for the premium tab system:
- version_checker: Semantic version validation and conflict detection
- file_operations: File system operations with backup and rollback
- validation: Manifest and security validation
- package_manager: Python, NPM, and system package management
- config_manager: Configuration and service management
- logger: JSON-based category logging system
"""

from .version_checker import SemanticVersionChecker, SemanticVersion, PackageRequirement, VersionConflict
from .file_operations import FileOperationsManager, FileOperation
from .validation import ValidationManager
from .package_manager import PackageManager, PackageInstallationState, SystemPackage, SystemDependencies
from .config_manager import ConfigManager, ServiceManager, BuildManager
from .uninstall_manager import UninstallManager
from .logger import PremiumJSONLogger, CategoryLogger, create_category_logger

__all__ = [
    # Version checking
    'SemanticVersionChecker',
    'SemanticVersion', 
    'PackageRequirement',
    'VersionConflict',
    
    # File operations
    'FileOperationsManager',
    'FileOperation',
    
    # Validation
    'ValidationManager',
    
    # Package management
    'PackageManager',
    'PackageInstallationState',
    'SystemPackage',
    'SystemDependencies',
    
    # Configuration and services
    'ConfigManager',
    'ServiceManager',
    'BuildManager',
    
    # Uninstall management
    'UninstallManager',
    
    # JSON Category Logging
    'PremiumJSONLogger',
    'CategoryLogger',
    'create_category_logger'
]

__version__ = '1.2.1' 