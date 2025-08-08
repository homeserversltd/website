#!/usr/bin/env python3
"""
Premium Tab Installer for Homeserver Platform (Refactored)

A comprehensive installer for dynamically injecting premium content into the homeserver platform.
Supports atomic installation/uninstallation with full rollback capabilities.

This refactored version uses modular utilities for better maintainability and separation of concerns.

Usage:
    sudo python3 installer_refactored.py install <tab_path>
    sudo python3 installer_refactored.py uninstall [<tab_name>|--all]
    sudo python3 installer_refactored.py validate <tab_path>
    sudo python3 installer_refactored.py list

Author: Homeserver Development Team
License: BSL 1.1
"""

import argparse
import os
import sys
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime

# Import utility modules
from utils import (
    SemanticVersionChecker,
    FileOperationsManager, FileOperation,
    ValidationManager,
    PackageManager,
    ConfigManager, ServiceManager, BuildManager,
    UninstallManager,
    create_category_logger
)

# Constants
HOMESERVER_CONFIG_PATH = "/var/www/homeserver/src/config/homeserver.json"
TABLETS_DIR = "/var/www/homeserver/src/tablets"
VENV_PATH = "/var/www/homeserver/venv"
PACKAGE_JSON_PATH = "/var/www/homeserver/package.json"
LOG_FILE = "/var/log/homeserver/premium_installer.log"


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
    """Main installer class for premium tabs using modular utilities."""
    
    def __init__(self, debug: bool = False):
        self.debug = debug
        self.logger = self._setup_logging()
        self.installation_state: Optional[InstallationState] = None
        
        # Initialize utility managers
        self.validation_manager = ValidationManager(self.logger)
        
    def _setup_logging(self) -> logging.Logger:
        """Set up console logging configuration (JSON logging handled separately)."""
        # Ensure log directory exists
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        
        # DO NOT clear the log file - let category loggers handle their own sections
        
        logger = logging.getLogger('premium_installer')
        logger.setLevel(logging.DEBUG if self.debug else logging.INFO)
        
        # Clear any existing handlers to avoid duplication
        logger.handlers.clear()
        
        # File handler for console logs only (JSON logs handled separately)
        file_handler = logging.FileHandler(LOG_FILE + '.console')
        file_handler.setLevel(logging.DEBUG)
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.DEBUG if self.debug else logging.INFO)
        
        # Formatter
        formatter = logging.Formatter(
            '[%(asctime)s] [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)
        
        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        
        return logger
    
    def _get_category_logger(self, category: str, json_level: str = None):
        """Get a category logger for a specific operation."""
        # If no json_level specified, use DEBUG if --debug flag is set, otherwise INFO
        if json_level is None:
            json_level = "DEBUG" if self.debug else "INFO"
        return create_category_logger(category, self.logger, LOG_FILE, json_level)
    
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
    
    def _check_version_conflicts(self, tab_path: str, manifests: Dict[str, Any], category_logger: logging.Logger) -> bool:
        """Check for version conflicts using semantic version checker."""
        category_logger.info("Checking for version conflicts")
        
        if self.debug:
            category_logger.debug(f"DEBUG: Analyzing tab path: {tab_path}")
            category_logger.debug(f"DEBUG: Manifest components: {list(manifests.get('components', {}).keys())}")
        
        try:
            # Create version checker instance
            version_checker = SemanticVersionChecker(category_logger)
            
            if self.debug:
                category_logger.debug("DEBUG: Created SemanticVersionChecker instance")
                category_logger.debug(f"DEBUG: Checking dependencies for tab: {os.path.basename(tab_path)}")
            
            # Validate dependencies for single tab
            is_valid, conflicts = version_checker.validate_premium_tab_dependencies(tab_path)
            
            if self.debug:
                category_logger.debug(f"DEBUG: Dependency validation result: valid={is_valid}, conflicts_count={len(conflicts) if conflicts else 0}")
            
            if conflicts:
                category_logger.error("Version conflicts detected:")
                conflict_report = version_checker.generate_conflict_report(conflicts)
                category_logger.error(conflict_report)
                return False
            
            # Skipping multi-level index.json version consistency checks by design
            if self.debug:
                category_logger.debug("DEBUG: Skipping index.json version consistency validation by configuration")
            
            category_logger.info("No version conflicts detected")
            return True
            
        except ImportError:
            if self.debug:
                category_logger.debug("DEBUG: SemanticVersionChecker not available, using fallback")
            category_logger.warning("Version checker utility not available, falling back to basic checking")
            return self._check_version_conflicts_basic(tab_path, manifests, category_logger)
        except Exception as e:
            if self.debug:
                category_logger.debug(f"DEBUG: Exception in version conflict checking: {type(e).__name__}: {str(e)}")
            category_logger.error(f"Error during version conflict checking: {str(e)}")
            return False
    
    def _check_version_conflicts_basic(self, tab_path: str, manifests: Dict[str, Any], category_logger: logging.Logger) -> bool:
        """Basic version conflict checking (fallback method)."""
        # Use package manager for conflict checking
        requirements_file = os.path.join(tab_path, "backend", "requirements.txt")
        patch_file = os.path.join(tab_path, "frontend", "package.patch.json")
        dependencies_file = os.path.join(tab_path, "system", "dependencies.json")
        
        conflicts = self.installation_state.package_manager.check_all_conflicts(
            requirements_file, patch_file, dependencies_file
        )
        
        if conflicts:
            category_logger.error("Version conflicts detected:")
            for conflict in conflicts:
                category_logger.error(f"  - {conflict}")
            return False
        
        return True
    
    def _process_system_dependencies(self, tab_path: str, category_logger: logging.Logger) -> bool:
        """Process system dependencies installation."""
        dependencies_file = os.path.join(tab_path, "system", "dependencies.json")
        
        if not os.path.exists(dependencies_file):
            category_logger.info("No system dependencies to process")
            return True
        
        category_logger.info("Processing system dependencies")
        
        # Validate system dependencies first
        valid, dependencies_data = self.validation_manager.validate_system_dependencies(dependencies_file)
        if not valid:
            raise Exception("System dependencies validation failed")
        
        if self.debug and dependencies_data:
            category_logger.debug(f"DEBUG: System dependencies loaded: {len(dependencies_data.get('packages', []))} packages")
            for pkg in dependencies_data.get('packages', []):
                category_logger.debug(f"DEBUG: - {pkg.get('name')} {pkg.get('version', 'latest')}")
        
        # Install system dependencies
        if not self.installation_state.package_manager.install_system_dependencies(dependencies_file):
            raise Exception("Failed to install system dependencies")
        
        category_logger.info("System dependencies processed successfully")
        return True
    
    def _process_backend_component(self, tab_path: str, backend_manifest: Dict[str, Any], category_logger: logging.Logger) -> bool:
        """Process backend component installation."""
        category_logger.info("Processing backend component")
        
        # Install Python requirements
        requirements_file = os.path.join(tab_path, "backend", "requirements.txt")
        if not self.installation_state.package_manager.install_python_requirements(requirements_file):
            raise Exception("Failed to install Python requirements")
        
        # Process backend file operations
        for file_op in backend_manifest.get("files", []):
            operation = FileOperation(
                source=file_op["source"],
                target=file_op["target"],
                operation_type=file_op["type"],
                identifier=file_op.get("identifier"),
                marker=file_op.get("marker"),
                description=file_op.get("description", "")
            )
            
            success = False
            if operation.operation_type == "append":
                success = self.installation_state.file_operations.perform_append_operation(operation, tab_path)
            elif operation.operation_type == "copy":
                success = self.installation_state.file_operations.perform_copy_operation(operation, tab_path)
            
            if not success:
                raise Exception(f"Failed to perform {operation.operation_type} operation")
        
        return True
    
    def _process_frontend_component(self, tab_path: str, frontend_manifest: Dict[str, Any], category_logger: logging.Logger) -> bool:
        """Process frontend component installation."""
        category_logger.info("Processing frontend component")
        
        # Apply NPM patch
        patch_file = os.path.join(tab_path, "frontend", "package.patch.json")
        if not self.installation_state.package_manager.apply_npm_patch(patch_file):
            raise Exception("Failed to apply NPM patch")
        
        # Create tablet directory if needed
        tablet_dir = os.path.join(TABLETS_DIR, self.installation_state.tab_name)
        if not os.path.exists(tablet_dir):
            os.makedirs(tablet_dir, exist_ok=True)
            self.installation_state.file_operations.set_permissions(tablet_dir, "www-data", "www-data", "775")
            self.installation_state.file_operations.created_directories.append(tablet_dir)
        
        # Process frontend file operations
        for file_op in frontend_manifest.get("files", []):
            # Replace {tabName} placeholder
            target_path = file_op["target"].replace("{tabName}", self.installation_state.tab_name)
            
            operation = FileOperation(
                source=file_op["source"],
                target=target_path,
                operation_type=file_op["type"],
                description=file_op.get("description", "")
            )
            
            success = False
            if operation.operation_type == "symlink":
                success = self.installation_state.file_operations.perform_symlink_operation(operation, tab_path)
            elif operation.operation_type == "copy":
                success = self.installation_state.file_operations.perform_copy_operation(operation, tab_path)
            
            if not success:
                raise Exception(f"Failed to perform {operation.operation_type} operation")
        
        return True
    
    def _process_permissions(self, tab_path: str, category_logger: logging.Logger) -> bool:
        """Process permissions installation."""
        permissions_file = os.path.join(tab_path, "permissions", f"premium_{self.installation_state.tab_name}")
        if os.path.exists(permissions_file):
            category_logger.info("Installing permissions")
            target_permissions = os.path.join("/etc/sudoers.d", f"premium_{self.installation_state.tab_name}")
            
            operation = FileOperation(
                source=f"permissions/premium_{self.installation_state.tab_name}",
                target=target_permissions,
                operation_type="copy",
                description="Sudoers permissions file"
            )
            
            if not self.installation_state.file_operations.perform_copy_operation(operation, tab_path):
                raise Exception("Failed to install permissions")
        
        return True
    
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
        
        category_logger.info("Rollback completed")
    
    def install_premium_tab(self, tab_path: str) -> bool:
        """Install a premium tab using modular utilities."""
        # Get category logger for install operations
        category_logger = self._get_category_logger("install")
        
        category_logger.info(f"Starting installation of premium tab: {tab_path}")
        
        # Initialize installation state and managers with category logger
        tab_name = os.path.basename(tab_path)
        self.installation_state = self._initialize_managers(tab_name, category_logger)
        
        try:
            # Pre-validation phase
            category_logger.info("=== PRE-VALIDATION PHASE ===")
            
            # Validate current config
            category_logger.info("Validating current configuration")
            if not self.installation_state.config_manager.validate_config_with_factory_fallback():
                category_logger.error("Current configuration is invalid")
                return False
            
            # Validate package manifest
            category_logger.info("Validating package manifest")
            if self.debug:
                category_logger.debug(f"DEBUG: Starting package manifest validation for: {tab_path}")
            
            valid, manifests = self.validation_manager.validate_package_manifest(tab_path)
            
            if self.debug:
                category_logger.debug(f"DEBUG: Package manifest validation result: {valid}")
                if valid and manifests:
                    category_logger.debug(f"DEBUG: Manifest structure: {list(manifests.keys())}")
                    if 'components' in manifests:
                        category_logger.debug(f"DEBUG: Components found: {list(manifests['components'].keys())}")
            
            if not valid:
                if self.debug:
                    category_logger.debug("DEBUG: Package manifest validation failed - aborting installation")
                return False
            
            # Check version conflicts
            category_logger.info("Checking for version conflicts")
            if not self._check_version_conflicts(tab_path, manifests, category_logger):
                return False
            
            # Check name collisions
            category_logger.info(f"Checking name collisions for tab: {tab_name}")
            if self.debug:
                category_logger.debug(f"DEBUG: Checking name collisions for tab: {tab_name}")
            
            if not self.validation_manager.check_name_collision(tab_name):
                if self.debug:
                    category_logger.debug(f"DEBUG: Name collision detected for: {tab_name}")
                category_logger.error(f"Name collision detected for tab: {tab_name}")
                return False
            
            if self.debug:
                category_logger.debug(f"DEBUG: No name collisions found for: {tab_name}")
            
            # Validate environments
            category_logger.info("Validating Python and Node.js environments")
            if not self.installation_state.package_manager.validate_environments():
                category_logger.error("Environment validation failed")
                return False
            
            category_logger.info("Pre-validation completed successfully")
            
            # Process system dependencies
            category_logger.info("Processing system dependencies")
            if not self._process_system_dependencies(tab_path, category_logger):
                return False
            
            # Installation phase
            category_logger.info("=== INSTALLATION PHASE ===")
            
            if self.debug:
                category_logger.debug(f"DEBUG: Starting installation phase for tab: {tab_name}")
                category_logger.debug(f"DEBUG: Available components: {list(manifests['components'].keys())}")
            
            # Process backend component
            if "backend" in manifests["components"]:
                if self.debug:
                    category_logger.debug("DEBUG: Processing backend component")
                if not self._process_backend_component(tab_path, manifests["components"]["backend"], category_logger):
                    raise Exception("Backend component processing failed")
                if self.debug:
                    category_logger.debug("DEBUG: Backend component processing completed")
            
            # Process frontend component
            if "frontend" in manifests["components"]:
                if self.debug:
                    category_logger.debug("DEBUG: Processing frontend component")
                if not self._process_frontend_component(tab_path, manifests["components"]["frontend"], category_logger):
                    raise Exception("Frontend component processing failed")
                if self.debug:
                    category_logger.debug("DEBUG: Frontend component processing completed")
            
            # Install permissions
            category_logger.info("Processing permissions")
            if not self._process_permissions(tab_path, category_logger):
                raise Exception("Permissions processing failed")
            
            # Apply config patch
            category_logger.info("Applying configuration patch")
            config_patch = os.path.join(tab_path, "homeserver.patch.json")
            if not self.installation_state.config_manager.apply_config_patch(config_patch):
                raise Exception("Failed to apply config patch")
            
            # Rebuild frontend
            category_logger.info("Rebuilding frontend application")
            if not self.installation_state.build_manager.rebuild_frontend():
                raise Exception("Failed to rebuild frontend")
            
            # Restart services
            category_logger.info("Restarting homeserver services")
            if not self.installation_state.service_manager.restart_homeserver_services():
                raise Exception("Failed to restart services")
            
            # Post-validation
            category_logger.info("=== POST-VALIDATION ===")
            category_logger.info("Performing post-installation validation")
            if not self.installation_state.config_manager.validate_config_with_factory_fallback():
                raise Exception("Post-installation config validation failed")
            
            category_logger.info(f"Premium tab '{tab_name}' installed successfully")
            return True
            
        except Exception as e:
            category_logger.error(f"Installation failed: {str(e)}")
            self._rollback_installation(category_logger)
            return False

    def install_all_premium_tabs(self, premium_dir: str) -> bool:
        """Install all premium tabs from a directory with comprehensive validation."""
        # Convert relative path to absolute
        premium_dir = os.path.abspath(premium_dir)
        
        # Get category logger for install operations
        category_logger = self._get_category_logger("install")
        category_logger.info(f"Starting batch installation of all premium tabs from: {premium_dir}")
        
        try:
            # Create version checker instance
            version_checker = SemanticVersionChecker(logger=self.logger)
            
            # Pre-validation: comprehensive check of ALL tabs before installing ANY
            category_logger.info("=== COMPREHENSIVE PRE-VALIDATION ===")
            is_valid, results = version_checker.validate_all_premium_tabs(premium_dir)
            
            if not is_valid:
                category_logger.error("Batch validation failed - aborting installation")
                report = version_checker.generate_comprehensive_report(results)
                category_logger.error(f"Validation Report:\n{report}")
                return False
            
            category_logger.info("✅ Comprehensive validation passed - proceeding with installations")
            
            # Get list of tabs to install
            tabs = version_checker.discover_premium_tabs(premium_dir)
            if not tabs:
                category_logger.warning(f"No premium tabs found in {premium_dir}")
                return True
            
            # Install each tab
            installed_tabs = []
            failed_tabs = []
            
            for tab_path in tabs:
                tab_name = os.path.basename(tab_path)
                category_logger.info(f"Installing premium tab: {tab_name}")
                
                try:
                    if self.install_premium_tab(tab_path):
                        installed_tabs.append(tab_name)
                        category_logger.info(f"✅ Successfully installed: {tab_name}")
                    else:
                        failed_tabs.append(tab_name)
                        category_logger.error(f"❌ Failed to install: {tab_name}")
                        
                except Exception as e:
                    failed_tabs.append(tab_name)
                    category_logger.error(f"❌ Exception during installation of {tab_name}: {str(e)}")
            
            # Summary
            category_logger.info(f"=== BATCH INSTALLATION SUMMARY ===")
            category_logger.info(f"Total tabs: {len(tabs)}")
            category_logger.info(f"Successfully installed: {len(installed_tabs)} - {', '.join(installed_tabs)}")
            
            if failed_tabs:
                category_logger.error(f"Failed installations: {len(failed_tabs)} - {', '.join(failed_tabs)}")
                return False
            else:
                category_logger.info("🎉 All premium tabs installed successfully!")
                return True
                
        except ImportError:
            category_logger.error("Version checker utility not available - batch installation requires it")
            return False
        except Exception as e:
            category_logger.error(f"Batch installation failed: {str(e)}")
            return False
    
    def uninstall_premium_tab(self, tab_name: str = None, uninstall_all: bool = False, 
                             dry_run: bool = False) -> bool:
        """Uninstall premium tab(s)."""
        # Get category logger for uninstall operations
        category_logger = self._get_category_logger("uninstall")
        
        try:
            # Initialize uninstall manager with category logger
            category_logger.info("Initializing uninstall manager")
            uninstall_manager = UninstallManager(category_logger)
            
            if dry_run:
                if not tab_name:
                    category_logger.error("Tab name required for dry run")
                    return False
                
                category_logger.info(f"Performing dry run for tab: {tab_name}")
                result = uninstall_manager.dry_run_uninstall(tab_name)
                if "error" in result:
                    category_logger.error(result["error"])
                    return False
                
                category_logger.info("=== DRY RUN UNINSTALL PREVIEW ===")
                category_logger.info(f"Tab: {result['tab_name']}")
                category_logger.info(f"Files to remove: {result['estimated_impact']['files_count']}")
                category_logger.info(f"Has permissions: {result['estimated_impact']['has_permissions']}")
                category_logger.info(f"Has append operations: {result['estimated_impact']['has_append_operations']}")
                
                if result['files_to_remove']:
                    category_logger.info("Files that would be removed:")
                    for file_path in result['files_to_remove'][:10]:  # Show first 10
                        category_logger.info(f"  - {file_path}")
                    if len(result['files_to_remove']) > 10:
                        category_logger.info(f"  ... and {len(result['files_to_remove']) - 10} more files")
                
                category_logger.info("Dry run completed successfully")
                return True
            
            if uninstall_all:
                category_logger.info("Starting batch uninstallation of all premium tabs")
                result = uninstall_manager.uninstall_all_premium_tabs()
                if result:
                    category_logger.info("Batch uninstallation completed successfully")
                else:
                    category_logger.error("Batch uninstallation failed")
                return result
            
            elif tab_name:
                # Uninstall by discovering installation data
                category_logger.info(f"Uninstalling premium tab: {tab_name}")
                category_logger.info("Discovering installation data")
                result = uninstall_manager.uninstall_premium_tab(tab_name)
                if result:
                    category_logger.info(f"Successfully uninstalled premium tab: {tab_name}")
                else:
                    category_logger.error(f"Failed to uninstall premium tab: {tab_name}")
                return result
            
            else:
                category_logger.error("Must specify either tab_name or --all")
                return False
                
        except Exception as e:
            category_logger.error(f"Uninstallation failed: {str(e)}")
            return False
    
    def validate_premium_tab(self, tab_path: str) -> bool:
        """Validate a premium tab without installing."""
        # Get category logger for validate operations
        category_logger = self._get_category_logger("validate")
        category_logger.info(f"Validating premium tab: {tab_path}")
        
        # Validate package manifest
        valid, manifests = self.validation_manager.validate_package_manifest(tab_path)
        if not valid:
            return False
        
        # Check version conflicts using basic method
        tab_name = os.path.basename(tab_path)
        temp_state = self._initialize_managers(tab_name)
        
        requirements_file = os.path.join(tab_path, "backend", "requirements.txt")
        patch_file = os.path.join(tab_path, "frontend", "package.patch.json")
        
        conflicts = temp_state.package_manager.check_all_conflicts(requirements_file, patch_file)
        if conflicts:
            category_logger.error("Version conflicts detected:")
            for conflict in conflicts:
                category_logger.error(f"  - {conflict}")
            return False
        
        # Check name collisions
        if not self.validation_manager.check_name_collision(tab_name):
            return False
        
        category_logger.info("Validation completed successfully")
        return True
    
    def validate_all_premium_tabs(self, premium_dir: str, generate_report: bool = False) -> bool:
        """Validate all premium tabs for cross-tab conflicts."""
        # Get category logger for validate operations
        category_logger = self._get_category_logger("validate")
        category_logger.info(f"Starting comprehensive cross-tab validation in: {premium_dir}")
        
        # Create version checker instance
        try:
            checker = SemanticVersionChecker(category_logger)
        except Exception as e:
            category_logger.error(f"Failed to create version checker: {e}")
            return False
        
        # Run comprehensive validation
        is_valid, results = checker.validate_all_premium_tabs(premium_dir)
        
        # Log a single-line compact summary only
        summary = results["summary"]
        status = summary['overall_status']
        reasons = []
        if summary['tabs_with_version_errors']:
            reasons.append(f"version={summary['tabs_with_version_errors']}")
        if summary['tabs_with_manifest_errors']:
            reasons.append(f"manifest={summary['tabs_with_manifest_errors']}")
        if summary['tabs_with_dependency_conflicts']:
            reasons.append(f"deps={summary['tabs_with_dependency_conflicts']}")
        if summary['cross_tab_conflicts']:
            reasons.append(f"cross={summary['cross_tab_conflicts']}")
        reason_str = ("; ".join(reasons)) if reasons else ""
        line = f"Validation Summary: {status} (tabs={summary['total_tabs']})" + (f" | {reason_str}" if reason_str else "")
        # Always emit one terminal line; INFO for PASS, ERROR for FAIL
        (category_logger.info if status == 'PASS' else category_logger.error)(line)
        
        return is_valid
    
    def list_premium_tabs(self, premium_dir: str = "/var/www/homeserver/premium") -> List[str]:
        """List available premium tabs from the premium directory."""
        tabs = []
        
        if os.path.exists(premium_dir):
            for item in os.listdir(premium_dir):
                item_path = os.path.join(premium_dir, item)
                # Check if it's a directory and has an index.json (indicates it's a premium tab)
                if (os.path.isdir(item_path) and 
                    item != "utils" and  # Skip utils directory
                    os.path.exists(os.path.join(item_path, "index.json"))):
                    tabs.append(item)
        
        tabs.sort()  # Sort alphabetically for consistent output
        self.logger.info(f"Found {len(tabs)} available premium tabs: {', '.join(tabs) if tabs else 'none'}")
        return tabs
    
    def list_installed_premium_tabs(self, premium_dir: str = "/var/www/homeserver/premium") -> List[str]:
        """List installed premium tabs by checking for __pycache__ directories."""
        installed_tabs = []
        
        if os.path.exists(premium_dir):
            for item in os.listdir(premium_dir):
                item_path = os.path.join(premium_dir, item)
                # Check if it's a directory and has an index.json (indicates it's a premium tab)
                if (os.path.isdir(item_path) and 
                    item != "utils" and  # Skip utils directory
                    os.path.exists(os.path.join(item_path, "index.json"))):
                    
                    # Check for __pycache__ in backend directory (indicates installation)
                    pycache_path = os.path.join(item_path, "backend", "__pycache__")
                    if os.path.exists(pycache_path) and os.path.isdir(pycache_path):
                        installed_tabs.append(item)
        
        installed_tabs.sort()  # Sort alphabetically for consistent output
        self.logger.info(f"Found {len(installed_tabs)} installed premium tabs: {', '.join(installed_tabs) if installed_tabs else 'none'}")
        return installed_tabs


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Premium Tab Installer (Refactored)")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Install command
    install_parser = subparsers.add_parser("install", help="Install premium tab(s)")
    install_group = install_parser.add_mutually_exclusive_group(required=True)
    install_group.add_argument("tab_path", nargs="?", help="Path to premium tab directory")
    install_group.add_argument("--all", nargs="?", const=".", metavar="PREMIUM_DIR", 
                              help="Install all premium tabs from directory (defaults to current directory)")
    
    # Uninstall command
    uninstall_parser = subparsers.add_parser("uninstall", help="Uninstall premium tab(s)")
    uninstall_group = uninstall_parser.add_mutually_exclusive_group(required=True)
    uninstall_group.add_argument("tab_name", nargs="?", help="Name of tab to uninstall")
    uninstall_group.add_argument("--all", action="store_true", help="Uninstall all premium tabs")
    uninstall_parser.add_argument("--dry-run", action="store_true", 
                                 help="Show what would be removed without actually removing it")
    
    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate premium tab(s)")
    validate_group = validate_parser.add_mutually_exclusive_group(required=True)
    validate_group.add_argument("tab_path", nargs="?", help="Path to premium tab directory")
    validate_group.add_argument("--all", nargs="?", const="/var/www/homeserver/premium", metavar="PREMIUM_DIR",
                               help="Validate all premium tabs for cross-tab conflicts (defaults to system premium directory)")
    validate_parser.add_argument("--report", action="store_true", 
                                help="Generate detailed validation report")
    
    # List command
    list_parser = subparsers.add_parser("list", help="List premium tabs")
    list_parser.add_argument("--installed", action="store_true", 
                            help="Show only installed tabs (with __pycache__)")
    list_parser.add_argument("--available", action="store_true", 
                            help="Show only available tabs (default)")
    list_parser.add_argument("--all", action="store_true", 
                            help="Show both available and installed status")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    # Check if running as root
    if os.geteuid() != 0:
        print("Error: This installer must be run as root (use sudo)")
        return 1
    
    installer = PremiumInstaller(debug=args.debug)
    
    try:
        if args.command == "install":
            if args.all:
                success = installer.install_all_premium_tabs(args.all)
            else:
                success = installer.install_premium_tab(args.tab_path)
            return 0 if success else 1
            
        elif args.command == "uninstall":
            if args.all:
                success = installer.uninstall_premium_tab(uninstall_all=True, dry_run=args.dry_run)
            else:
                success = installer.uninstall_premium_tab(args.tab_name, dry_run=args.dry_run)
            return 0 if success else 1
            
        elif args.command == "validate":
            if args.all:
                success = installer.validate_all_premium_tabs(args.all, args.report)
            else:
                success = installer.validate_premium_tab(args.tab_path)
            return 0 if success else 1
            
        elif args.command == "list":
            if args.installed:
                installer.list_installed_premium_tabs()
            elif args.all:
                # Show comprehensive status
                available_tabs = installer.list_premium_tabs()
                installed_tabs = installer.list_installed_premium_tabs()
                
                print("\n=== PREMIUM TAB STATUS ===")
                if available_tabs:
                    for tab in available_tabs:
                        status = "INSTALLED" if tab in installed_tabs else "AVAILABLE"
                        print(f"  {tab}: {status}")
                else:
                    print("  No premium tabs found")
            else:
                # Default: show available tabs
                installer.list_premium_tabs()
            return 0
            
    except KeyboardInterrupt:
        print("\nInstallation interrupted by user")
        return 1
    except Exception as e:
        installer.logger.error(f"Unexpected error: {str(e)}")
        return 1


if __name__ == "__main__":
    sys.exit(main()) 