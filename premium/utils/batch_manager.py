#!/usr/bin/env python3
"""
Batch Manager Utility for Premium Tab Installer

Handles batch installation operations with intelligent fallback to individual
installation when batch operations fail. Provides comprehensive batch state
tracking and rollback capabilities.
"""

import os
import json
import logging
import shutil
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime

from .file_operations import FileOperationsManager, FileOperation
from .package_manager import PackageManager
from .config_manager import ConfigManager, ServiceManager, BuildManager
from .validation import ValidationManager
from .version_checker import SemanticVersionChecker
from .logger import create_category_logger


@dataclass
class BatchInstallationState:
    """Tracks the complete state of a batch installation for rollback purposes."""
    tabs_to_install: List[str]
    file_operations: FileOperationsManager = None
    package_manager: PackageManager = None
    config_manager: ConfigManager = None
    service_manager: ServiceManager = None
    build_manager: BuildManager = None
    validation_manager: ValidationManager = None
    version_checker: SemanticVersionChecker = None
    
    # Batch-specific state
    installed_tabs: List[str] = field(default_factory=list)
    failed_tabs: List[str] = field(default_factory=list)
    skipped_tabs: List[str] = field(default_factory=list)
    batch_start_time: Optional[datetime] = None
    batch_end_time: Optional[datetime] = None
    
    # Deferred operations tracking
    deferred_builds: List[str] = field(default_factory=list)
    deferred_service_restarts: List[str] = field(default_factory=list)
    
    # Fallback state
    fallback_attempted: bool = False
    individual_successes: List[str] = field(default_factory=list)
    individual_failures: List[str] = field(default_factory=list)


class BatchManager:
    """Manages batch installation operations with intelligent fallback strategies."""
    
    def __init__(self, logger, 
                 venv_path: str = "/var/www/homeserver/venv",
                 package_json_path: str = "/var/www/homeserver/package.json",
                 homeserver_config_path: str = "/var/www/homeserver/src/config/homeserver.json"):
        self.logger = logger
        self.venv_path = venv_path
        self.package_json_path = package_json_path
        self.homeserver_config_path = homeserver_config_path
        
        # Initialize utility managers
        self.file_operations = FileOperationsManager(logger)
        self.package_manager = PackageManager(logger, venv_path, package_json_path)
        self.config_manager = ConfigManager(logger, homeserver_config_path)
        self.service_manager = ServiceManager(logger)
        self.build_manager = BuildManager(logger)
        self.validation_manager = ValidationManager(logger)
        self.version_checker = SemanticVersionChecker(logger)
        
        # Batch state
        self.batch_state: Optional[BatchInstallationState] = None
    
    def _initialize_batch_managers(self, logger=None) -> BatchInstallationState:
        """Initialize all utility managers for batch operations."""
        manager_logger = logger or self.logger
        
        state = BatchInstallationState(tabs_to_install=[])
        
        # Initialize managers with the provided logger
        state.file_operations = FileOperationsManager(manager_logger)
        state.package_manager = PackageManager(manager_logger, self.venv_path, self.package_json_path)
        state.config_manager = ConfigManager(manager_logger, self.homeserver_config_path)
        state.service_manager = ServiceManager(manager_logger)
        state.build_manager = BuildManager(manager_logger)
        state.validation_manager = ValidationManager(manager_logger)
        state.version_checker = SemanticVersionChecker(manager_logger)
        
        return state
    
    def install_premium_tabs_batch(self, tab_paths: List[str], 
                                 defer_build: bool = True,
                                 defer_service_restart: bool = True,
                                 logger=None) -> Tuple[bool, Dict[str, Any]]:
        """Install multiple premium tabs with deferred build/service restart operations."""
        # Get category logger for batch install operations
        category_logger = logger or self.logger
        
        category_logger.info(f"Starting batch installation of {len(tab_paths)} premium tabs")
        category_logger.info(f"Defer build: {defer_build}, Defer service restart: {defer_service_restart}")
        
        # Initialize batch state
        self.batch_state = self._initialize_batch_managers(category_logger)
        self.batch_state.tabs_to_install = tab_paths
        self.batch_state.batch_start_time = datetime.now()
        
        try:
            # Phase 1: Individual tab installation (deferring build/service restart)
            category_logger.info("=== PHASE 1: INDIVIDUAL TAB INSTALLATION ===")
            
            for tab_path in tab_paths:
                tab_name = os.path.basename(tab_path)
                category_logger.info(f"Installing tab: {tab_name}")
                
                try:
                    # Validate tab before installation and get resolved path
                    resolved_path = self._validate_tab_for_installation(tab_path, category_logger)
                    if not resolved_path:
                        self.batch_state.failed_tabs.append(tab_name)
                        category_logger.error(f"Validation failed for tab: {tab_name}")
                        continue
                    
                    # Install tab (without build/service restart) using resolved path
                    if self._install_single_tab_deferred(resolved_path, category_logger):
                        self.batch_state.installed_tabs.append(tab_name)
                        category_logger.info(f"✅ Successfully installed tab: {tab_name}")
                    else:
                        self.batch_state.failed_tabs.append(tab_name)
                        category_logger.error(f"❌ Failed to install tab: {tab_name}")
                        
                except Exception as e:
                    self.batch_state.failed_tabs.append(tab_name)
                    category_logger.error(f"❌ Exception during installation of {tab_name}: {str(e)}")
            
            # Check if we have enough successful installations to proceed
            success_rate = len(self.batch_state.installed_tabs) / len(tab_paths)
            category_logger.info(f"Installation success rate: {success_rate:.1%} ({len(self.batch_state.installed_tabs)}/{len(tab_paths)})")
            
            if success_rate < 0.5:  # Less than 50% success
                category_logger.error("Batch installation failed - success rate too low")
                return False, self._get_batch_status()
            
            # Phase 2: Deferred operations
            if defer_build or defer_service_restart:
                category_logger.info("=== PHASE 2: DEFERRED OPERATIONS ===")
                
                # Frontend rebuild
                if defer_build and self.batch_state.installed_tabs:
                    category_logger.info("Performing deferred frontend rebuild")
                    if not self.batch_state.build_manager.rebuild_frontend():
                        category_logger.error("Deferred frontend rebuild failed")
                        # Fall back to individual installation
                        return self._fallback_to_individual_installation(category_logger)
                    else:
                        category_logger.info("✅ Deferred frontend rebuild completed")
                
                # Service restart
                if defer_service_restart and self.batch_state.installed_tabs:
                    category_logger.info("Performing deferred service restart")
                    if not self.batch_state.service_manager.restart_homeserver_services():
                        category_logger.error("Deferred service restart failed")
                        # Fall back to individual installation
                        return self._fallback_to_individual_installation(category_logger)
                    else:
                        category_logger.info("✅ Deferred service restart completed")
            
            # Success!
            self.batch_state.batch_end_time = datetime.now()
            category_logger.info("=== BATCH INSTALLATION COMPLETED SUCCESSFULLY ===")
            category_logger.info(f"Successfully installed: {', '.join(self.batch_state.installed_tabs)}")
            
            if self.batch_state.failed_tabs:
                category_logger.warning(f"Some tabs failed: {', '.join(self.batch_state.failed_tabs)}")
            
            return True, self._get_batch_status()
            
        except Exception as e:
            category_logger.error(f"Batch installation failed with exception: {str(e)}")
            # Fall back to individual installation
            return self._fallback_to_individual_installation(category_logger)
    
    def _validate_tab_for_installation(self, tab_path: str, logger: logging.Logger) -> str:
        """Validate a single tab before installation and return resolved path."""
        try:
            # Auto-prepend premium directory if not already a full path
            if not os.path.isabs(tab_path) and not tab_path.startswith('/'):
                premium_path = os.path.join("/var/www/homeserver/premium", tab_path)
                if os.path.exists(premium_path):
                    tab_path = premium_path
                    logger.info(f"Auto-resolved tab path to: {tab_path}")
            
            # Basic validation
            if not os.path.exists(tab_path):
                logger.error(f"Tab path does not exist: {tab_path}")
                return None
            
            # Manifest validation
            valid, manifests = self.batch_state.validation_manager.validate_package_manifest(tab_path)
            if not valid:
                logger.error(f"Manifest validation failed for: {tab_path}")
                return None
            
            # Version conflict checking
            valid, conflicts = self.batch_state.version_checker.validate_premium_tab_dependencies(tab_path)
            if not valid:
                logger.error(f"Version conflicts detected for: {tab_path}")
                for conflict in conflicts:
                    logger.error(f"  - {conflict.description}")
                return None
            
            return tab_path
            
        except Exception as e:
            logger.error(f"Validation error for {tab_path}: {str(e)}")
            return None
    
    def _install_single_tab_deferred(self, tab_path: str, logger: logging.Logger) -> bool:
        """Install a single tab without build/service restart operations."""
        try:
            tab_name = os.path.basename(tab_path)
            
            # File operations
            if not self._perform_file_operations(tab_path, logger):
                return False
            
            # Package installations
            if not self._perform_package_installations(tab_path, logger):
                return False
            
            # Configuration patches
            if not self._perform_config_patches(tab_path, logger):
                return False
            
            logger.info(f"Tab {tab_name} installation completed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Installation failed for {tab_path}: {str(e)}")
            return False
    
    def _perform_file_operations(self, tab_path: str, logger: logging.Logger) -> bool:
        """Perform file operations for a tab using the FileOperationsManager."""
        try:
            # Load root manifest for complete file operations
            root_index = os.path.join(tab_path, "index.json")
            if os.path.exists(root_index):
                with open(root_index, 'r') as f:
                    root_manifest = json.load(f)
                
                # Get the tab name from the manifest (this is the key!)
                tab_name = root_manifest.get("name", os.path.basename(tab_path))
                logger.info(f"Processing files for tab: {tab_name}")
                
                # Use the existing FileOperationsManager from batch state
                file_manager = self.batch_state.file_operations
                
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
                                if not file_manager.perform_append_operation(operation, tab_path):
                                    logger.error(f"Failed to append backend file: {source}")
                                    return False
                                logger.info(f"Successfully appended backend file: {source} -> {target}")
                            else:
                                # Default to copy operation
                                if not file_manager.perform_copy_operation(operation, tab_path):
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
                            if not file_manager.perform_copy_operation(operation, tab_path):
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
                        if not file_manager.perform_copy_operation(operation, tab_path):
                            logger.error(f"Failed to copy frontend file: {source_path}")
                            return False
                        
                        logger.info(f"Successfully copied frontend file: {source_path} -> {target}")
                
                # Process permissions files
                permissions_files = root_manifest.get("files", {}).get("permissions", {})
                if isinstance(permissions_files, dict):
                    for file_key, target_path in permissions_files.items():
                        # Source path is the same as target path relative to tab root
                        source_path = target_path
                        target = os.path.join("/etc/sudoers.d", target_path)
                        
                        # Create FileOperation object
                        operation = FileOperation(
                            source=source_path,
                            target=target,
                            operation_type="copy",
                            identifier=tab_name,
                            description=f"Permissions file: {file_key}"
                        )
                        
                        # Use the file operations manager
                        if not file_manager.perform_copy_operation(operation, tab_path):
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
                    if not file_manager.perform_copy_operation(operation, tab_path):
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
                                if not file_manager.perform_append_operation(operation, tab_path):
                                    logger.error(f"Failed to append backend file: {source}")
                                    return False
                                logger.info(f"Successfully appended backend file: {source} -> {target}")
                            else:
                                # Default to copy operation
                                if not file_manager.perform_copy_operation(operation, tab_path):
                                    logger.error(f"Failed to copy backend file: {source}")
                                    return False
                                logger.info(f"Successfully copied backend file: {source} -> {target}")
                
                # After processing backend files, we need to append the blueprint registration
                # to the main backend/__init__.py file
                if backend_files or (isinstance(backend_files, dict) and backend_files):  # If any backend files were processed
                    # Create the append operation for blueprint registration
                    blueprint_operation = FileOperation(
                        source="",  # No source file needed for blueprint registration
                        target="/var/www/homeserver/backend/__init__.py",
                        operation_type="append",
                        identifier=tab_name,
                        marker="PREMIUM TAB BLUEPRINTS",
                        description=f"Blueprint registration for {tab_name}"
                    )
                    
                    # Perform the append operation
                    if not file_manager.perform_append_operation(blueprint_operation, tab_path):
                        logger.error(f"Failed to append blueprint registration for {tab_name}")
                        return False
                    
                    logger.info(f"Successfully appended blueprint registration for {tab_name}")
            
            logger.info(f"File operations completed successfully for tab: {tab_name}")
            return True
            
        except Exception as e:
            logger.error(f"File operations failed: {str(e)}")
            return False
    
    def _perform_package_installations(self, tab_path: str, logger: logging.Logger) -> bool:
        """Perform package installations for a tab."""
        try:
            # Check for Python requirements
            requirements_file = os.path.join(tab_path, "backend", "requirements.txt")
            if os.path.exists(requirements_file):
                logger.info(f"Installing Python requirements from: {requirements_file}")
                # Integrate with actual package manager
                if not self.batch_state.package_manager.install_python_requirements(requirements_file):
                    logger.error(f"Failed to install Python requirements from {requirements_file}")
                    return False
                logger.info("Python requirements installed successfully")
            
            # Check for NPM patches
            package_patch = os.path.join(tab_path, "frontend", "package.patch.json")
            if os.path.exists(package_patch):
                logger.info(f"Found NPM package patch: {package_patch}")
                # Integrate with actual package manager
                if not self.batch_state.package_manager.apply_npm_patch(package_patch):
                    logger.error(f"Failed to apply NPM package patch {package_patch}")
                    return False
                logger.info("NPM package patch applied successfully")
            
            # Check for system dependencies
            dependencies_file = os.path.join(tab_path, "system", "dependencies.json")
            if os.path.exists(dependencies_file):
                logger.info(f"Found system dependencies: {dependencies_file}")
                # Integrate with actual package manager
                if not self.batch_state.package_manager.install_system_dependencies(dependencies_file):
                    logger.error(f"Failed to install system dependencies from {dependencies_file}")
                    return False
                logger.info("System dependencies installed successfully")
            
            return True
            
        except Exception as e:
            logger.error(f"Package installation failed: {str(e)}")
            return False
    
    def _perform_config_patches(self, tab_path: str, logger: logging.Logger) -> bool:
        """Perform configuration patches for a tab."""
        try:
            # Check for homeserver config patch
            config_patch = os.path.join(tab_path, "homeserver.patch.json")
            if os.path.exists(config_patch):
                logger.info(f"Found config patch: {config_patch}")
                # Integrate with actual config manager
                if not self.batch_state.config_manager.apply_config_patch(config_patch):
                    logger.error(f"Failed to apply config patch {config_patch}")
                    return False
                logger.info("Config patch applied successfully")
            
            return True
            
        except Exception as e:
            logger.error(f"Config patch failed: {str(e)}")
            return False
    
    def _fallback_to_individual_installation(self, logger: logging.Logger) -> Tuple[bool, Dict[str, Any]]:
        """Fall back to individual installation when batch operations fail."""
        logger.warning("=== FALLBACK TO INDIVIDUAL INSTALLATION ===")
        logger.warning("Batch installation failed, attempting individual installation for working tabs")
        
        if not self.batch_state:
            logger.error("No batch installation state available for fallback")
            return False, {}
        
        self.batch_state.fallback_attempted = True
        
        # Get the list of tabs that were successfully installed
        working_tabs = self.batch_state.installed_tabs.copy()
        
        if not working_tabs:
            logger.error("No tabs were successfully installed, cannot fallback")
            return False, self._get_batch_status()
        
        logger.info(f"Attempting individual installation for {len(working_tabs)} working tabs")
        
        # Try to reinstall each working tab individually
        for tab_name in working_tabs:
            logger.info(f"Reinstalling tab individually: {tab_name}")
            
            try:
                # Find the tab path
                tab_path = None
                for path in self.batch_state.tabs_to_install:
                    if os.path.basename(path) == tab_name:
                        tab_path = path
                        break
                
                if not tab_path:
                    logger.error(f"Could not find path for tab: {tab_name}")
                    self.batch_state.individual_failures.append(tab_name)
                    continue
                
                # Perform individual installation with immediate build/service restart
                if self._install_single_tab_immediate(tab_path, logger):
                    self.batch_state.individual_successes.append(tab_name)
                    logger.info(f"✅ Individual installation successful: {tab_name}")
                else:
                    self.batch_state.individual_failures.append(tab_name)
                    logger.error(f"❌ Individual installation failed: {tab_name}")
                    
            except Exception as e:
                self.batch_state.individual_failures.append(tab_name)
                logger.error(f"❌ Exception during individual installation of {tab_name}: {str(e)}")
        
        # Final status
        final_success = len(self.batch_state.individual_successes) > 0
        
        if final_success:
            logger.info("=== FALLBACK INSTALLATION COMPLETED ===")
            logger.info(f"Successfully installed individually: {', '.join(self.batch_state.individual_successes)}")
            
            if self.batch_state.individual_failures:
                logger.warning(f"Some tabs failed individual installation: {', '.join(self.batch_state.individual_failures)}")
        else:
            logger.error("=== FALLBACK INSTALLATION FAILED ===")
            logger.error("All tabs failed individual installation")
        
        return final_success, self._get_batch_status()
    
    def _install_single_tab_immediate(self, tab_path: str, logger: logging.Logger) -> bool:
        """Install a single tab with immediate build/service restart."""
        try:
            tab_name = os.path.basename(tab_path)
            
            # File operations
            if not self._perform_file_operations(tab_path, logger):
                return False
            
            # Package installations
            if not self._perform_package_installations(tab_path, logger):
                return False
            
            # Configuration patches
            if not self._perform_config_patches(tab_path, logger):
                return False
            
            # Immediate frontend rebuild
            logger.info(f"Rebuilding frontend for {tab_name}")
            if not self.batch_state.build_manager.rebuild_frontend():
                logger.error(f"Frontend rebuild failed for {tab_name}")
                return False
            
            # Immediate service restart
            logger.info(f"Restarting services for {tab_name}")
            if not self.batch_state.service_manager.restart_homeserver_services():
                logger.error(f"Service restart failed for {tab_name}")
                return False
            
            logger.info(f"Individual installation completed successfully for {tab_name}")
            return True
            
        except Exception as e:
            logger.error(f"Individual installation failed for {tab_path}: {str(e)}")
            return False
    
    def _get_batch_status(self) -> Dict[str, Any]:
        """Get comprehensive batch installation status."""
        if not self.batch_state:
            return {
                "status": "no_batch_operation",
                "message": "No batch installation has been performed"
            }
        
        # Calculate duration
        duration = None
        if self.batch_state.batch_start_time:
            if self.batch_state.batch_end_time:
                duration = (self.batch_state.batch_end_time - self.batch_state.batch_start_time).total_seconds()
            else:
                duration = (datetime.now() - self.batch_state.batch_start_time).total_seconds()
        
        return {
            "status": "batch_completed" if self.batch_state.batch_end_time else "batch_in_progress",
            "total_tabs": len(self.batch_state.tabs_to_install),
            "successful_installations": len(self.batch_state.installed_tabs),
            "failed_installations": len(self.batch_state.failed_tabs),
            "successful_tabs": self.batch_state.installed_tabs,
            "failed_tabs": self.batch_state.failed_tabs,
            "skipped_tabs": self.batch_state.skipped_tabs,
            "fallback_attempted": self.batch_state.fallback_attempted,
            "individual_successes": self.batch_state.individual_successes,
            "individual_failures": self.batch_state.individual_failures,
            "batch_duration_seconds": duration,
            "deferred_builds": self.batch_state.deferred_builds,
            "deferred_service_restarts": self.batch_state.deferred_service_restarts
        }
    
    def rollback_batch_installation(self, logger=None) -> bool:
        """Rollback the entire batch installation."""
        category_logger = logger or self.logger
        
        if not self.batch_state:
            category_logger.warning("No batch installation to rollback")
            return True
        
        category_logger.info("=== ROLLING BACK BATCH INSTALLATION ===")
        
        try:
            # Rollback in reverse order of operations
            if self.batch_state.config_manager:
                self.batch_state.config_manager.rollback_config()
            
            if self.batch_state.package_manager:
                self.batch_state.package_manager.rollback_package_installations()
            
            if self.batch_state.file_operations:
                self.batch_state.file_operations.rollback_operations()
            
            if self.batch_state.service_manager:
                self.batch_state.service_manager.rollback_service_states()
            
            category_logger.info("Batch installation rollback completed")
            return True
            
        except Exception as e:
            category_logger.error(f"Batch rollback failed: {str(e)}")
            return False
        finally:
            # Clear batch state
            self.batch_state = None