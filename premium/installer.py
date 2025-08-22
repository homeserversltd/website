#!/usr/bin/env python3
"""
Premium Tab Installer with Enhanced Batch Processing

A comprehensive installer for premium tabs with intelligent batch operations,
deferred builds, and robust fallback strategies.
"""

import os
import sys
import json
import logging
import argparse
import subprocess
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime

# Import our utility modules
try:
    from .utils import (
        FileOperationsManager, FileOperation, PackageManager, ConfigManager, ServiceManager, BuildManager,
        ValidationManager, SemanticVersionChecker, UninstallManager, BatchManager, InstallationTracker,
        create_category_logger, PremiumJSONLogger
    )
except ImportError:
    # Fallback for direct execution
    from utils import (
        FileOperationsManager, FileOperation, PackageManager, ConfigManager, ServiceManager, BuildManager,
        ValidationManager, SemanticVersionChecker, UninstallManager, BatchManager, InstallationTracker,
        create_category_logger, PremiumJSONLogger
    )

# Constants
VENV_PATH = "/var/www/homeserver/venv"
PACKAGE_JSON_PATH = "/var/www/homeserver/package.json"
HOMESERVER_CONFIG_PATH = "/var/www/homeserver/src/config/homeserver.json"


@dataclass
class InstallationState:
    """Tracks the complete state of an installation for rollback purposes."""
    tab_name: str
    file_operations: FileOperationsManager = None
    package_manager: PackageManager = None
    config_manager: ConfigManager = None
    service_manager: ServiceManager = None
    build_manager: BuildManager = None


class PremiumInstaller:
    """Enhanced premium tab installer with batch processing capabilities."""
    
    def __init__(self, logger=None):
        # Set up main logger
        self.logger = logger or self._setup_logger()
                
        # Initialize utility managers
        self.file_operations = FileOperationsManager(self.logger)
        self.package_manager = PackageManager(self.logger, VENV_PATH, PACKAGE_JSON_PATH)
        self.config_manager = ConfigManager(self.logger, HOMESERVER_CONFIG_PATH)
        self.service_manager = ServiceManager(self.logger)
        self.build_manager = BuildManager(self.logger)
        self.validation_manager = ValidationManager(self.logger)
        self.version_checker = SemanticVersionChecker(self.logger)
        self.uninstall_manager = UninstallManager(self.logger)
        self.batch_manager = BatchManager(self.logger, VENV_PATH, PACKAGE_JSON_PATH, HOMESERVER_CONFIG_PATH)
        self.installation_tracker = InstallationTracker(self.logger)
        
        # Installation state tracking
        self.installation_state: Optional[InstallationState] = None
        self.batch_installation_state: Optional[Any] = None  # Will be BatchInstallationState
        
        # JSON logger for structured logging
        self.json_logger = PremiumJSONLogger()
    
    def _setup_logger(self) -> logging.Logger:
        """Set up the main logger."""
        logger = logging.getLogger('premium_installer')
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
        return logger
    
    def _get_category_logger(self, category: str) -> Any:
        """Get a category logger for specific operations."""
        return create_category_logger(category, self.logger, json_level="INFO")
    
    def _initialize_managers(self, tab_name: str, logger=None) -> InstallationState:
        """Initialize all utility managers for an installation."""
        state = InstallationState(tab_name=tab_name)
        
        # Use provided logger or fall back to self.logger
        manager_logger = logger or self.logger
        
        # Initialize managers
        state.file_operations = FileOperationsManager(manager_logger)
        state.package_manager = PackageManager(manager_logger, VENV_PATH, PACKAGE_JSON_PATH)
        state.config_manager = ConfigManager(manager_logger, HOMESERVER_CONFIG_PATH)
        state.service_manager = ServiceManager(manager_logger)
        state.build_manager = BuildManager(manager_logger)
        
        return state
    
    def install_premium_tab(self, tab_path: str, batch_mode: bool = False) -> bool:
        """Install a premium tab using modular utilities."""
        # Get category logger for install operations
        category_logger = self._get_category_logger("install")
        
        # Auto-prepend premium directory if not already a full path
        if not os.path.isabs(tab_path) and not tab_path.startswith('/'):
            premium_path = os.path.join("/var/www/homeserver/premium", tab_path)
            if os.path.exists(premium_path):
                tab_path = premium_path
                category_logger.info(f"Auto-resolved tab path to: {tab_path}")
        
        category_logger.info(f"Starting installation of premium tab: {tab_path}")
        
        # Initialize installation state and managers with category logger
        tab_name = os.path.basename(tab_path)
        self.installation_state = self._initialize_managers(tab_name, category_logger)
        
        try:
            # Pre-validation phase
            category_logger.info("=== PRE-VALIDATION PHASE ===")
            
            # Validate current configuration
            if not self.installation_state.config_manager.validate_config_with_factory_fallback():
                category_logger.error("Current configuration is invalid")
                return False
            
            # Validate package manifest
            valid, manifests = self.validation_manager.validate_package_manifest(tab_path)
            if not valid:
                category_logger.error("Package manifest validation failed")
                return False
            
            # Check for name collisions
            if not self.validation_manager.check_name_collision(tab_name):
                return False
            
            # Check version conflicts
            valid, conflicts = self.version_checker.validate_premium_tab_dependencies(tab_path)
            if not valid:
                category_logger.error("Version conflicts detected:")
                for conflict in conflicts:
                    category_logger.error(f"  - {conflict.description}")
                return False
            
            # Installation phase
            category_logger.info("=== INSTALLATION PHASE ===")
            
            # File operations
            if not self._perform_file_operations(tab_path, category_logger):
                return False
            
            # Package installations
            if not self._perform_package_installations(tab_path, category_logger):
                return False
            
            # Configuration patches
            if not self._perform_config_patches(tab_path, category_logger):
                return False
            
            # Post-installation operations (only if not in batch mode)
            if not batch_mode:
                category_logger.info("=== POST-INSTALLATION PHASE ===")
                
                # Frontend rebuild
                if not self.installation_state.build_manager.rebuild_frontend():
                    category_logger.error("Frontend rebuild failed")
                    return False
                
                # Service restart
                if not self.installation_state.service_manager.restart_homeserver_services():
                    category_logger.error("Service restart failed")
                    return False
            
            category_logger.info(f"Premium tab '{tab_name}' installed successfully")
            return True
            
        except Exception as e:
            category_logger.error(f"Installation failed: {str(e)}")
            self._rollback_installation(category_logger)
            return False
    
    def _perform_file_operations(self, tab_path: str, logger: logging.Logger) -> bool:
        """Perform file operations for a tab."""
        try:
            # Load root manifest for complete file operations
            root_index = os.path.join(tab_path, "index.json")
            if os.path.exists(root_index):
                with open(root_index, 'r') as f:
                    root_manifest = json.load(f)
                
                # Get the tab name from the manifest (this is the key!)
                tab_name = root_manifest.get("name", os.path.basename(tab_path))
                logger.info(f"Processing files for tab: {tab_name}")
                
                # Process backend files first (for blueprint registration)
                backend_files = root_manifest.get("files", {}).get("backend", {})
                if isinstance(backend_files, dict):
                    for file_key, file_config in backend_files.items():
                        if isinstance(file_config, dict):
                            # Handle structured file config with type, source, target, etc.
                            source = file_config.get("source", file_key)
                            target = file_config.get("target")
                            operation_type = file_config.get("type", "copy")
                            identifier = file_config.get("identifier", tab_name)
                            description = file_config.get("description", f"Backend file: {file_key}")
                            
                            if not target:
                                logger.error(f"Missing target for backend file: {file_key}")
                                return False
                            
                            # Create FileOperation object
                            operation = FileOperation(
                                source=source,
                                target=target,
                                operation_type=operation_type,
                                identifier=identifier,
                                marker="PREMIUM TAB BLUEPRINTS",
                                description=description
                            )
                            
                            # Use appropriate operation method
                            if operation_type == "append":
                                if not self.installation_state.file_operations.perform_append_operation(operation, tab_path):
                                    logger.error(f"Failed to append backend file: {source}")
                                    return False
                                logger.info(f"Successfully appended backend file: {source} -> {target}")
                            else:
                                # Default to copy operation
                                if not self.installation_state.file_operations.perform_copy_operation(operation, tab_path):
                                    logger.error(f"Failed to copy backend file: {source}")
                                    return False
                                logger.info(f"Successfully copied backend file: {source} -> {target}")
                        else:
                            # Handle simple string mapping (legacy format)
                            source_path = file_config
                            # Copy contents directly into the backend directory, not nested
                            target = os.path.join("/var/www/homeserver/backend", tab_name, os.path.basename(file_config))
                            
                            # Create FileOperation object
                            operation = FileOperation(
                                source=source_path,
                                target=target,
                                operation_type="copy",
                                identifier=tab_name,
                                description=f"Backend file: {file_key}"
                            )
                            
                            # Use the file operations manager
                            if not self.installation_state.file_operations.perform_copy_operation(operation, tab_path):
                                logger.error(f"Failed to copy backend file: {source_path}")
                                return False
                            
                            logger.info(f"Successfully copied backend file: {source_path} -> {target}")
                
                # Process frontend files - RESPECT THE MANIFEST STRUCTURE!
                frontend_files = root_manifest.get("files", {}).get("frontend", {})
                if isinstance(frontend_files, dict):
                    for file_key, target_path in frontend_files.items():
                        # Source path is the same as target path relative to tab root
                        source_path = target_path
                        # Copy contents directly into the dev folder, not nested frontend folder
                        # Remove the "frontend/" prefix from the target path
                        if target_path.startswith("frontend/"):
                            target_path = target_path[9:]  # Remove "frontend/" prefix
                        target = os.path.join("/var/www/homeserver/src/tablets", tab_name, target_path)
                        
                        # Create FileOperation object
                        operation = FileOperation(
                            source=source_path,
                            target=target,
                            operation_type="copy",
                            identifier=tab_name,
                            description=f"Frontend file: {file_key}"
                        )
                        
                        # Use the file operations manager
                        if not self.installation_state.file_operations.perform_copy_operation(operation, tab_path):
                            logger.error(f"Failed to copy frontend file: {source_path}")
                            return False
                        
                        logger.info(f"Successfully copied frontend file: {source_path} -> {target}")
                
                # Process permissions files
                permissions_files = root_manifest.get("files", {}).get("permissions", {})
                if isinstance(permissions_files, dict):
                    for file_key, target_path in permissions_files.items():
                        # Source path is the same as target path relative to tab root
                        source_path = target_path
                        # Extract just the filename for permissions files to avoid nested directories
                        target = os.path.join("/etc/sudoers.d", os.path.basename(target_path))
                        
                        # Create FileOperation object
                        operation = FileOperation(
                            source=source_path,
                            target=target,
                            operation_type="copy",
                            identifier=tab_name,
                            description=f"Permissions file: {file_key}"
                        )
                        
                        # Use the file operations manager
                        if not self.installation_state.file_operations.perform_copy_operation(operation, tab_path):
                            logger.error(f"Failed to copy permissions file: {source_path}")
                            return False
                        
                        logger.info(f"Successfully copied permissions file: {source_path} -> {target}")
                
                # Process root-level files (config, readme, etc.)
                root_files = root_manifest.get("files", {})
                for file_key, target_path in root_files.items():
                    if isinstance(target_path, dict) or file_key in ["backend", "frontend", "permissions"]:
                        # Skip nested sections and already processed sections
                        continue
                    
                    # Source path is the same as target path relative to tab root
                    source_path = target_path
                    # Use the manifest name, NOT the folder name!
                    target = os.path.join("/var/www/homeserver/src/tablets", tab_name, target_path)
                    
                    # Create FileOperation object
                    operation = FileOperation(
                        source=source_path,
                        target=target,
                        operation_type="copy",
                        identifier=tab_name,
                        description=f"Root file: {file_key}"
                    )
                    
                    # Use the file operations manager
                    if not self.installation_state.file_operations.perform_copy_operation(operation, tab_path):
                        logger.error(f"Failed to copy root file: {source_path}")
                        return False
                    
                    logger.info(f"Successfully copied root file: {source_path} -> {target}")
            
            # Process backend index.json for append operations (blueprint registration)
            backend_index = os.path.join(tab_path, "backend", "index.json")
            if os.path.exists(backend_index):
                with open(backend_index, 'r') as f:
                    backend_manifest = json.load(f)
                
                # Process backend file operations
                backend_files = backend_manifest.get("files", [])
                if isinstance(backend_files, list):
                    for file_op in backend_files:
                        if isinstance(file_op, dict):
                            source = file_op.get("source")
                            target = file_op.get("target")
                            operation_type = file_op.get("type", "copy")
                            identifier = file_op.get("identifier", tab_name)
                            description = file_op.get("description", f"Backend operation: {source}")
                            
                            if not source or not target:
                                logger.error(f"Invalid backend file operation: missing source or target")
                                continue
                            
                            # Create FileOperation object
                            operation = FileOperation(
                                source=source,
                                target=target,
                                operation_type=operation_type,
                                identifier=identifier,
                                marker="PREMIUM TAB BLUEPRINTS",
                                description=description
                            )
                            
                            # Use appropriate operation method
                            if operation_type == "append":
                                if not self.installation_state.file_operations.perform_append_operation(operation, tab_path):
                                    logger.error(f"Failed to append backend file: {source}")
                                    return False
                                logger.info(f"Successfully appended backend file: {source} -> {target}")
                            else:
                                # Default to copy operation
                                if not self.installation_state.file_operations.perform_copy_operation(operation, tab_path):
                                    logger.error(f"Failed to copy backend file: {source}")
                                    return False
                                logger.info(f"Successfully copied backend file: {source} -> {target}")
            
            return True
            
        except Exception as e:
            logger.error(f"File operations failed: {str(e)}")
            return False
    
    def _process_file_operation(self, file_op: Dict[str, Any], tab_path: str, logger: logging.Logger) -> bool:
        """Process a single file operation."""
        try:
            operation_type = file_op.get("type", "copy")
            source = file_op.get("source")
            target = file_op.get("target")
            
            if not source or not target:
                logger.error(f"Invalid file operation: missing source or target")
                return False
            
            # Replace {tabName} placeholder
            target = target.replace("{tabName}", os.path.basename(tab_path))
            
            if operation_type == "symlink":
                return self.installation_state.file_operations.perform_symlink_operation(
                    file_op, tab_path
                )
            elif operation_type == "copy":
                return self.installation_state.file_operations.perform_copy_operation(
                    file_op, tab_path
                )
            elif operation_type == "append":
                return self.installation_state.file_operations.perform_append_operation(
                    file_op, tab_path
                )
            else:
                logger.error(f"Unknown file operation type: {operation_type}")
                return False
                
        except Exception as e:
            logger.error(f"File operation processing failed: {str(e)}")
            return False
    
    def _perform_package_installations(self, tab_path: str, logger: logging.Logger) -> bool:
        """Perform package installations for a tab."""
        try:
            # Python requirements
            requirements_file = os.path.join(tab_path, "backend", "requirements.txt")
            if os.path.exists(requirements_file):
                if not self.installation_state.package_manager.install_python_requirements(requirements_file):
                    logger.error("Python requirements installation failed")
                    return False
            
            # NPM patch
            npm_patch_file = os.path.join(tab_path, "frontend", "package.patch.json")
            if os.path.exists(npm_patch_file):
                if not self.installation_state.package_manager.apply_npm_patch(npm_patch_file):
                    logger.error("NPM patch application failed")
                    return False
            
            # System dependencies
            dependencies_file = os.path.join(tab_path, "system", "dependencies.json")
            if os.path.exists(dependencies_file):
                if not self.installation_state.package_manager.install_system_dependencies(dependencies_file):
                    logger.error("System dependencies installation failed")
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"Package installations failed: {str(e)}")
            return False
    
    def _perform_config_patches(self, tab_path: str, logger: logging.Logger) -> bool:
        """Perform configuration patches for a tab."""
        try:
            config_patch_file = os.path.join(tab_path, "homeserver.patch.json")
            if os.path.exists(config_patch_file):
                if not self.installation_state.config_manager.apply_config_patch(config_patch_file):
                    logger.error("Configuration patch application failed")
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"Configuration patches failed: {str(e)}")
            return False
    
    def install_premium_tabs_batch(self, tab_paths: List[str], 
                                 defer_build: bool = True,
                                 defer_service_restart: bool = True) -> bool:
        """Install multiple premium tabs using the BatchManager."""
        # Get category logger for batch install operations
        category_logger = self._get_category_logger("batch_install")
        
        category_logger.info(f"Starting batch installation of {len(tab_paths)} premium tabs")
        
        try:
            # Use the BatchManager for batch operations
            success, status = self.batch_manager.install_premium_tabs_batch(
                tab_paths=tab_paths,
                defer_build=defer_build,
                defer_service_restart=defer_service_restart,
                logger=category_logger
            )
            
            if success:
                category_logger.info("=== BATCH INSTALLATION COMPLETED SUCCESSFULLY ===")
                category_logger.info(f"Successfully installed: {', '.join(status.get('successful_tabs', []))}")
                
                if status.get('failed_tabs'):
                    category_logger.warning(f"Some tabs failed: {', '.join(status['failed_tabs'])}")
                
                if status.get('fallback_attempted'):
                    category_logger.info("Fallback to individual installation was used")
                    category_logger.info(f"Individual successes: {', '.join(status.get('individual_successes', []))}")
                    
                    if status.get('individual_failures'):
                        category_logger.warning(f"Individual failures: {', '.join(status['individual_failures'])}")
            else:
                category_logger.error("=== BATCH INSTALLATION FAILED ===")
                category_logger.error(f"Failed tabs: {', '.join(status.get('failed_tabs', []))}")
            
            return success
            
        except Exception as e:
            category_logger.error(f"Batch installation failed with exception: {str(e)}")
            return False
    
    def _rollback_installation(self, category_logger: logging.Logger) -> None:
        """Rollback installation changes using utility managers."""
        if not self.installation_state:
            return
        
        category_logger.info("Rolling back installation changes")
        
        # Rollback in reverse order of operations
        if self.installation_state.config_manager:
            self.installation_state.config_manager.rollback_config()
        
        if self.installation_state.package_manager:
            self.installation_state.package_manager.rollback_package_installations()
        
        if self.installation_state.file_operations:
            self.installation_state.file_operations.rollback_operations()
        
        if self.installation_state.service_manager:
            self.installation_state.service_manager.rollback_service_states()
    
    def uninstall_premium_tab(self, tab_name: str) -> bool:
        """Uninstall a premium tab using the UninstallManager."""
        # Get category logger for uninstall operations
        category_logger = self._get_category_logger("uninstall")
        
        category_logger.info(f"Starting uninstallation of premium tab: {tab_name}")
        
        try:
            success = self.uninstall_manager.uninstall_premium_tab(tab_name)
            
            if success:
                category_logger.info(f"Premium tab '{tab_name}' uninstalled successfully")
            else:
                category_logger.error(f"Premium tab '{tab_name}' uninstallation failed")
            
            return success
            
        except Exception as e:
            category_logger.error(f"Uninstallation failed with exception: {str(e)}")
            return False
    
    def uninstall_all_premium_tabs(self) -> bool:
        """Uninstall all premium tabs using the UninstallManager."""
        # Get category logger for uninstall operations
        category_logger = self._get_category_logger("uninstall")
        
        category_logger.info("Starting uninstallation of all premium tabs")
        
        try:
            success = self.uninstall_manager.uninstall_all_premium_tabs()
            
            if success:
                category_logger.info("All premium tabs uninstalled successfully")
            else:
                category_logger.error("Some premium tabs failed to uninstall")
            
            return success
            
        except Exception as e:
            category_logger.error(f"Batch uninstallation failed with exception: {str(e)}")
            return False
    
    def validate_premium_tab(self, tab_path: str) -> bool:
        """Validate a premium tab using the ValidationManager."""
        # Get category logger for validation operations
        category_logger = self._get_category_logger("validate")
        
        category_logger.info(f"Validating premium tab: {tab_path}")
        
        try:
            # Basic validation
            valid, manifests = self.validation_manager.validate_package_manifest(tab_path)
            if not valid:
                category_logger.error("Package manifest validation failed")
                return False
            
            # Version conflict checking
            valid, conflicts = self.version_checker.validate_premium_tab_dependencies(tab_path)
            if not valid:
                category_logger.error("Version conflicts detected:")
                for conflict in conflicts:
                    category_logger.error(f"  - {conflict.description}")
                return False
            
            category_logger.info("Premium tab validation passed")
            return True
            
        except Exception as e:
            category_logger.error(f"Validation failed with exception: {str(e)}")
            return False
    
    def validate_all_premium_tabs(self, premium_dir: str) -> bool:
        """Validate all premium tabs in a directory using the VersionChecker."""
        # Get category logger for validation operations
        category_logger = self._get_category_logger("validate")
        
        category_logger.info(f"Validating all premium tabs in: {premium_dir}")
        
        try:
            valid, results = self.version_checker.validate_all_premium_tabs(premium_dir)
            
            if valid:
                category_logger.info("All premium tabs validation passed")
            else:
                category_logger.error("Premium tabs validation failed")
                
                # Log detailed results
                summary = results.get("summary", {})
                category_logger.error(f"Validation Summary: {summary}")
            
            return valid
            
        except Exception as e:
            category_logger.error(f"Batch validation failed with exception: {str(e)}")
            return False
    
    def get_installed_premium_tabs(self) -> List[Dict[str, Any]]:
        """Get detailed information about currently installed premium tabs using InstallationTracker."""
        return self.installation_tracker.get_installed_premium_tabs()
    
    def reinstall_premium_tab(self, tab_name: str) -> bool:
        """Reinstall a premium tab by first uninstalling then installing."""
        # Get category logger for reinstall operations
        category_logger = self._get_category_logger("reinstall")
        
        category_logger.info(f"Starting reinstallation of premium tab: {tab_name}")
        
        try:
            # Check if tab is currently installed
            installed_tabs = self.get_installed_premium_tabs()
            tab_installed = any(tab['name'] == tab_name for tab in installed_tabs)
            
            if not tab_installed:
                category_logger.warning(f"Tab '{tab_name}' is not currently installed, performing fresh installation")
                # Find the tab in premium directory and install it
                premium_dir = "/var/www/homeserver/premium"
                tab_path = None
                
                if os.path.exists(premium_dir):
                    for item in os.listdir(premium_dir):
                        item_path = os.path.join(premium_dir, item)
                        if (os.path.isdir(item_path) and 
                            os.path.basename(item_path) != "utils" and
                            os.path.exists(os.path.join(item_path, "index.json"))):
                            
                            try:
                                with open(os.path.join(item_path, "index.json"), 'r') as f:
                                    tab_info = json.load(f)
                                if tab_info.get("name") == tab_name:
                                    tab_path = item_path
                                    break
                            except Exception:
                                continue
                
                if tab_path:
                    category_logger.info(f"Found tab '{tab_name}' in premium directory, installing...")
                    return self.install_premium_tab(tab_path)
                else:
                    category_logger.error(f"Tab '{tab_name}' not found in premium directory")
                    return False
            
            # Tab is installed, proceed with reinstall
            category_logger.info(f"Tab '{tab_name}' is currently installed, proceeding with reinstall")
            
            # Step 1: Uninstall the current installation
            category_logger.info("Step 1: Uninstalling current installation")
            if not self.uninstall_manager.uninstall_premium_tab(tab_name, skip_build_and_restart=True):
                category_logger.error("Failed to uninstall current installation")
                return False
            
            # Step 2: Find and reinstall the tab
            category_logger.info("Step 2: Reinstalling tab")
            premium_dir = "/var/www/homeserver/premium"
            tab_path = None
            
            if os.path.exists(premium_dir):
                for item in os.listdir(premium_dir):
                    item_path = os.path.join(premium_dir, item)
                    if (os.path.isdir(item_path) and 
                        os.path.basename(item_path) != "utils" and
                        os.path.exists(os.path.join(item_path, "index.json"))):
                        
                        try:
                            with open(os.path.join(item_path, "index.json"), 'r') as f:
                                tab_info = json.load(f)
                            if tab_info.get("name") == tab_name:
                                tab_path = item_path
                                break
                        except Exception:
                            continue
            
            if tab_path:
                category_logger.info(f"Found tab '{tab_name}' in premium directory, reinstalling...")
                if self.install_premium_tab(tab_path):
                    category_logger.info(f"Premium tab '{tab_name}' reinstalled successfully")
                    return True
                else:
                    category_logger.error(f"Failed to reinstall tab '{tab_name}'")
                    return False
            else:
                category_logger.error(f"Tab '{tab_name}' not found in premium directory after uninstall")
                return False
                
        except Exception as e:
            category_logger.error(f"Reinstallation failed with exception: {str(e)}")
            return False
    
    def reinstall_premium_tabs_batch(self, tab_names: List[str], 
                                   defer_build: bool = True,
                                   defer_service_restart: bool = True) -> bool:
        """Reinstall multiple premium tabs using batch operations."""
        # Get category logger for batch reinstall operations
        category_logger = self._get_category_logger("batch_reinstall")
        
        category_logger.info(f"Starting batch reinstallation of {len(tab_names)} premium tabs")
        
        try:
            # Step 1: Uninstall all specified tabs
            category_logger.info("=== STEP 1: UNINSTALLING CURRENT INSTALLATIONS ===")
            uninstall_successes = []
            uninstall_failures = []
            
            for tab_name in tab_names:
                category_logger.info(f"Uninstalling tab: {tab_name}")
                if self.uninstall_manager.uninstall_premium_tab(tab_name, skip_build_and_restart=True):
                    uninstall_successes.append(tab_name)
                    category_logger.info(f"Successfully uninstalled: {tab_name}")
                else:
                    uninstall_failures.append(tab_name)
                    category_logger.error(f"Failed to uninstall: {tab_name}")
            
            if uninstall_failures:
                category_logger.warning(f"Some tabs failed to uninstall: {', '.join(uninstall_failures)}")
                # Continue with the ones that were successfully uninstalled
                tab_names = uninstall_successes
            
            if not tab_names:
                category_logger.error("No tabs were successfully uninstalled, cannot proceed with reinstall")
                return False
            
            # Step 2: Find tab paths and reinstall
            category_logger.info("=== STEP 2: REINSTALLING TABS ===")
            premium_dir = "/var/www/homeserver/premium"
            tab_paths = []
            
            if os.path.exists(premium_dir):
                for item in os.listdir(premium_dir):
                    item_path = os.path.join(premium_dir, item)
                    if (os.path.isdir(item_path) and 
                        os.path.basename(item_path) != "utils" and
                        os.path.exists(os.path.join(item_path, "index.json"))):
                        
                        try:
                            with open(os.path.join(item_path, "index.json"), 'r') as f:
                                tab_info = json.load(f)
                            if tab_info.get("name") in tab_names:
                                tab_paths.append(item_path)
                                category_logger.info(f"Found tab '{tab_info.get('name')}' at: {item_path}")
                        except Exception as e:
                            category_logger.error(f"Error reading manifest for {item_path}: {e}")
                            continue
            
            if not tab_paths:
                category_logger.error("No tab paths found for reinstallation")
                return False
            
            # Step 3: Use batch installation for reinstall
            category_logger.info("=== STEP 3: PERFORMING BATCH REINSTALLATION ===")
            success, status = self.batch_manager.install_premium_tabs_batch(
                tab_paths=tab_paths,
                defer_build=defer_build,
                defer_service_restart=defer_service_restart,
                logger=category_logger
            )
            
            if success:
                category_logger.info("=== BATCH REINSTALLATION COMPLETED SUCCESSFULLY ===")
                category_logger.info(f"Successfully reinstalled: {', '.join(status.get('successful_tabs', []))}")
                
                if status.get('failed_tabs'):
                    category_logger.warning(f"Some tabs failed reinstallation: {', '.join(status['failed_tabs'])}")
                
                if status.get('fallback_attempted'):
                    category_logger.info("Fallback to individual installation was used")
                    category_logger.info(f"Individual successes: {', '.join(status.get('individual_successes', []))}")
                    
                    if status.get('individual_failures'):
                        category_logger.warning(f"Individual failures: {', '.join(status['individual_failures'])}")
            else:
                category_logger.error("=== BATCH REINSTALLATION FAILED ===")
                category_logger.error(f"Failed tabs: {', '.join(status.get('failed_tabs', []))}")
            
            return success
            
        except Exception as e:
            category_logger.error(f"Batch reinstallation failed with exception: {str(e)}")
            return False
    
    def get_installation_status(self) -> Dict[str, Any]:
        """Get detailed installation status for the update system integration."""
        if not hasattr(self.batch_manager, 'batch_state') or not self.batch_manager.batch_state:
            return {
                "status": "no_batch_operation",
                "message": "No batch installation has been performed"
            }
        
        return self.batch_manager._get_batch_status()


def main():
    """Main CLI interface."""
    parser = argparse.ArgumentParser(
        description="Premium Tab Installer - Professional-grade tab management for homeserver",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
EXAMPLES:
  # Install a single tab
  sudo python3 installer.py install testTab
  
  # Install multiple specific tabs (automatically uses batch mode)
  sudo python3 installer.py install testTab devTab
  
  # Install multiple tabs with immediate build/restart
  sudo python3 installer.py install testTab devTab --no-defer-build --no-defer-restart
  
  # Install all tabs from premium directory
  sudo python3 installer.py install --all
  
  # Reinstall a single tab
  sudo python3 installer.py reinstall testTab
  
  # Reinstall multiple tabs with deferred operations
  sudo python3 installer.py reinstall testTab devTab
  
  # Reinstall with immediate build and restart
  sudo python3 installer.py reinstall testTab --no-defer-build --no-defer-restart
  
  # Uninstall a specific tab
  sudo python3 installer.py uninstall testTab
  
  # Uninstall all installed tabs
  sudo python3 installer.py uninstall --all
  
  # List available tabs in premium directory (ready to install)
  python3 installer.py list --available
  
  # List currently installed tabs
  python3 installer.py list --installed
  
  # List both available and installed tabs
  python3 installer.py list --all
  
  # Validate all premium tabs
  python3 installer.py validate --all
        """
    )
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Install command - handles both single and multiple tabs intelligently
    # Automatically detects single vs batch mode based on number of tab paths provided
    install_parser = subparsers.add_parser("install", help="Install premium tab(s) with dependency validation")
    
    # Add the --all flag first (optional)
    install_parser.add_argument("--all", nargs="?", const="/var/www/homeserver/premium", metavar="PREMIUM_DIR", 
                              help="Install all premium tabs from directory (defaults to premium directory)")
    
    # Add tab paths as optional (can be empty when using --all)
    install_parser.add_argument("tab_paths", nargs="*", help="Paths to premium tab directories (multiple paths for batch install)")
    
    install_parser.add_argument("--no-defer-build", action="store_true", 
                               help="Rebuild frontend after each tab (default: defer until all tabs installed)")
    install_parser.add_argument("--no-defer-restart", action="store_true", 
                               help="Restart services after each tab (default: defer until all tabs installed)")
    
    # Reinstall command
    reinstall_parser = subparsers.add_parser("reinstall", help="Reinstall premium tab(s) with clean state")
    reinstall_parser.add_argument("tab_names", nargs="+", help="Names of premium tabs to reinstall")
    reinstall_parser.add_argument("--no-defer-build", action="store_true", 
                                 help="Rebuild frontend after each tab (default: defer until all tabs reinstalled)")
    reinstall_parser.add_argument("--no-defer-restart", action="store_true", 
                                 help="Restart services after each tab (default: defer until all tabs reinstalled)")
    
    # Uninstall command
    uninstall_parser = subparsers.add_parser("uninstall", help="Remove premium tab(s) and clean up dependencies")
    uninstall_group = uninstall_parser.add_mutually_exclusive_group(required=True)
    uninstall_group.add_argument("tab_name", nargs="?", help="Name of premium tab to uninstall (use manifest name, not folder name)")
    uninstall_group.add_argument("--all", action="store_true", help="Uninstall all currently installed premium tabs")
    
    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate premium tab(s) for compatibility and completeness")
    validate_group = validate_parser.add_mutually_exclusive_group(required=True)
    validate_group.add_argument("tab_path", nargs="?", help="Path to premium tab directory")
    validate_group.add_argument("--all", nargs="?", const="/var/www/homeserver/premium", metavar="PREMIUM_DIR", 
                               help="Validate all premium tabs from directory (defaults to premium directory)")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List premium tabs with status information")
    list_group = list_parser.add_mutually_exclusive_group()
    list_group.add_argument("--available", action="store_true", help="List available tabs in premium directory (ready to install)")
    list_group.add_argument("--installed", action="store_true", help="List currently installed tabs")
    list_group.add_argument("--all", action="store_true", help="List both available and installed tabs (default)")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    # Set up logging
    if args.debug:
        logging.basicConfig(level=logging.DEBUG)
    
    # Create installer
    installer = PremiumInstaller()
    
    try:
        if args.command == "install":
            # Check if we have tab paths or --all flag
            if args.tab_paths and args.all:
                print("Error: Cannot specify both tab paths and --all flag simultaneously")
                return 1
            
            if not args.tab_paths and not args.all:
                print("Error: Must specify either tab paths or --all flag")
                return 1
            
            if args.tab_paths:
                # Check if we have multiple tab paths or just one
                if len(args.tab_paths) == 1:
                    # Single tab installation
                    success = installer.install_premium_tab(args.tab_paths[0])
                else:
                    # Multiple tab paths - use batch installation
                    success = installer.install_premium_tabs_batch(
                        tab_paths=args.tab_paths,
                        defer_build=not args.no_defer_build,
                        defer_service_restart=not args.no_defer_restart
                    )
            else:
                # Install all tabs from directory
                premium_dir = args.all or "/var/www/homeserver/premium"
                if not os.path.exists(premium_dir):
                    print(f"Error: Directory does not exist: {premium_dir}")
                    return 1
                
                # Discover premium tabs
                tab_paths = []
                for item in os.listdir(premium_dir):
                    item_path = os.path.join(premium_dir, item)
                    if (os.path.isdir(item_path) and 
                        os.path.basename(item_path) != "utils" and
                        os.path.exists(os.path.join(item_path, "index.json"))):
                        tab_paths.append(item_path)
                
                if not tab_paths:
                    print(f"Error: No premium tabs found in directory: {premium_dir}")
                    return 1
                
                # Use batch installation with deferred operations
                success = installer.install_premium_tabs_batch(
                    tab_paths=tab_paths,
                    defer_build=True,
                    defer_service_restart=True
                )
            
            return 0 if success else 1
            
        elif args.command == "reinstall":
            if args.no_defer_build:
                defer_build = False
            else:
                defer_build = True
            if args.no_defer_restart:
                defer_service_restart = False
            else:
                defer_service_restart = True
            
            # Handle single vs batch reinstallation
            if len(args.tab_names) == 1:
                # Single tab reinstallation
                success = installer.reinstall_premium_tab(args.tab_names[0])
            else:
                # Batch reinstallation
                success = installer.reinstall_premium_tabs_batch(
                    tab_names=args.tab_names,
                    defer_build=defer_build,
                    defer_service_restart=defer_service_restart
                )
            return 0 if success else 1
            
        elif args.command == "uninstall":
            if args.tab_name:
                success = installer.uninstall_premium_tab(args.tab_name)
            else:
                success = installer.uninstall_all_premium_tabs()
            return 0 if success else 1
            
        elif args.command == "validate":
            if args.tab_path:
                success = installer.validate_premium_tab(args.tab_path)
            else:
                # Validate all tabs from directory
                premium_dir = args.all or "/var/www/homeserver/premium"
                if not os.path.exists(premium_dir):
                    print(f"Error: Directory does not exist: {premium_dir}")
                    return 1
                success = installer.validate_all_premium_tabs(premium_dir)
            return 0 if success else 1
            
        elif args.command == "list":
            # Default to showing all if no specific flag
            show_available = args.available or args.all or (not args.installed)
            show_installed = args.installed or args.all or (not args.available)
            
            if show_available:
                print("=== AVAILABLE PREMIUM TABS ===")
                premium_dir = "/var/www/homeserver/premium"
                if os.path.exists(premium_dir):
                    available_tabs = []
                    for item in os.listdir(premium_dir):
                        item_path = os.path.join(premium_dir, item)
                        if (os.path.isdir(item_path) and 
                            os.path.basename(item_path) != "utils" and
                            os.path.exists(os.path.join(item_path, "index.json"))):
                            
                            try:
                                with open(os.path.join(item_path, "index.json"), 'r') as f:
                                    tab_info = json.load(f)
                                available_tabs.append({
                                    "folder": item,
                                    "name": tab_info.get("name", "unknown"),
                                    "version": tab_info.get("version", "unknown"),
                                    "description": tab_info.get("description", "")
                                })
                            except Exception as e:
                                available_tabs.append({
                                    "folder": item,
                                    "name": "ERROR",
                                    "version": "ERROR",
                                    "description": f"Failed to read manifest: {e}"
                                })
                    
                    if available_tabs:
                        for tab in available_tabs:
                            print(f"  [DIR] {tab['folder']}")
                            print(f"     Name: {tab['name']}")
                            print(f"     Version: {tab['version']}")
                            if tab['description']:
                                print(f"     Description: {tab['description']}")
                            print()
                    else:
                        print("  No premium tabs found in premium directory")
                else:
                    print("  Premium directory not found")
            
            if show_installed:
                print("=== INSTALLED PREMIUM TABS ===")
                installed_tabs = installer.get_installed_premium_tabs()
                if installed_tabs:
                    for tab in installed_tabs:
                        print(f"  [INSTALLED] {tab['name']} (v{tab['version']})")
                        if tab.get('install_time'):
                            print(f"     Installed: {tab['install_time']}")
                        print()
                else:
                    print("  No premium tabs currently installed")
            
            return 0
            
    except Exception as e:
        print(f"Fatal error: {e}")
        if args.debug:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main()) 