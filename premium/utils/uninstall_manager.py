#!/usr/bin/env python3
"""
Uninstall Manager Utility for Premium Tab Installer

Handles complete uninstallation of premium tabs including file removal,
package cleanup, and configuration reversion.
"""

import os
import json
import shutil
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path

from .file_operations import FileOperationsManager, FileOperation
from .package_manager import PackageManager
from .config_manager import ConfigManager, ServiceManager, BuildManager
from .validation import ValidationManager
from .installation_tracker import InstallationTracker


class UninstallManager:
    """Manages complete uninstallation of premium tabs."""
    
    def __init__(self, logger, 
                 tablets_dir: str = "/var/www/homeserver/src/tablets",
                 sudoers_dir: str = "/etc/sudoers.d",
                 venv_path: str = "/var/www/homeserver/venv",
                 package_json_path: str = "/var/www/homeserver/package.json",
                 homeserver_config_path: str = "/var/www/homeserver/src/config/homeserver.json"):
        self.logger = logger
        self.tablets_dir = tablets_dir
        self.sudoers_dir = sudoers_dir
        
        # Initialize utility managers
        self.file_operations = FileOperationsManager(logger)
        self.package_manager = PackageManager(logger, venv_path, package_json_path)
        self.config_manager = ConfigManager(logger, homeserver_config_path)
        self.service_manager = ServiceManager(logger)
        self.build_manager = BuildManager(logger)
        self.validation_manager = ValidationManager(logger)
        self.installation_tracker = InstallationTracker(logger)
    
    def discover_installed_tabs(self) -> List[str]:
        """Discover all installed premium tabs using InstallationTracker.
        
        This will find both properly installed tabs (with blueprints) and 
        broken installations (files exist but no blueprints).
        """
        try:
            # Use InstallationTracker to get comprehensive installation info
            installed_tabs = self.installation_tracker.get_installed_premium_tabs()
            
            # Extract just the tab names
            tab_names = [tab["name"] for tab in installed_tabs]
            
            # Log what we found
            if tab_names:
                self.logger.info(f"Discovered {len(tab_names)} installed premium tabs: {', '.join(tab_names)}")
                
                # Log details about each tab's installation status
                for tab in installed_tabs:
                    status = tab.get("status", "unknown")
                    has_blueprint = tab.get("has_blueprint", False)
                    
                    if has_blueprint:
                        self.logger.info(f"  ✅ {tab['name']}: {status} (blueprint registered)")
                    else:
                        self.logger.warning(f"  ⚠️  {tab['name']}: {status} (NO blueprint - broken installation)")
            else:
                self.logger.info("No premium tabs currently installed")
            
            return tab_names
            
        except Exception as e:
            self.logger.error(f"Failed to discover installed tabs: {str(e)}")
            return []
    
    def discover_broken_installations(self) -> List[str]:
        """Discover premium tabs that are installed but missing blueprint registrations.
        
        These are tabs that exist in the filesystem but won't work because
        they're not registered with Flask.
        """
        try:
            installed_tabs = self.installation_tracker.get_installed_premium_tabs()
            broken_tabs = []
            
            for tab in installed_tabs:
                has_blueprint = tab.get("has_blueprint", False)
                if not has_blueprint:
                    broken_tabs.append(tab["name"])
            
            if broken_tabs:
                self.logger.warning(f"Found {len(broken_tabs)} broken installations: {', '.join(broken_tabs)}")
                self.logger.warning("These tabs exist but won't work due to missing blueprint registrations")
            else:
                self.logger.info("No broken installations found")
            
            return broken_tabs
            
        except Exception as e:
            self.logger.error(f"Failed to discover broken installations: {str(e)}")
            return []
    
    def cleanup_broken_installations(self) -> bool:
        """Clean up all broken premium tab installations.
        
        This removes tabs that exist in filesystem but lack blueprint registrations,
        effectively cleaning up failed or incomplete installations.
        """
        self.logger.info("Starting cleanup of broken premium tab installations")
        
        broken_tabs = self.discover_broken_installations()
        if not broken_tabs:
            self.logger.info("No broken installations to clean up")
            return True
        
        self.logger.warning(f"Found {len(broken_tabs)} broken installations to clean up")
        
        cleaned_tabs = []
        failed_tabs = []
        
        for tab_name in broken_tabs:
            self.logger.info(f"Cleaning up broken installation: {tab_name}")
            
            try:
                if self.uninstall_premium_tab(tab_name):
                    cleaned_tabs.append(tab_name)
                    self.logger.info(f"✅ Successfully cleaned up: {tab_name}")
                else:
                    failed_tabs.append(tab_name)
                    self.logger.error(f"❌ Failed to clean up: {tab_name}")
                    
            except Exception as e:
                failed_tabs.append(tab_name)
                self.logger.error(f"❌ Exception during cleanup of {tab_name}: {str(e)}")
        
        # Summary
        self.logger.info(f"=== BROKEN INSTALLATION CLEANUP SUMMARY ===")
        self.logger.info(f"Total broken installations: {len(broken_tabs)}")
        self.logger.info(f"Successfully cleaned up: {len(cleaned_tabs)} - {', '.join(cleaned_tabs)}")
        
        if failed_tabs:
            self.logger.error(f"Failed cleanups: {len(failed_tabs)} - {', '.join(failed_tabs)}")
            return False
        else:
            self.logger.info("🎉 All broken installations cleaned up successfully!")
            return True
    
    def find_premium_tab_source_directory(self, tab_name: str) -> Optional[str]:
        """Find the original premium tab source directory containing index.json.
        
        The tab_name should be the exact folder name in the premium directory.
        """
        # Direct path to premium directory
        premium_base_dir = "/var/www/homeserver/premium"
        potential_tab_dir = os.path.join(premium_base_dir, tab_name)
        
        if os.path.exists(potential_tab_dir):
            root_index_path = os.path.join(potential_tab_dir, "index.json")
            if os.path.exists(root_index_path):
                self.logger.info(f"Found premium tab source directory: {potential_tab_dir}")
                return potential_tab_dir
        
        self.logger.warning(f"Could not find premium tab source directory for: {tab_name}")
        self.logger.warning(f"Expected path: {potential_tab_dir}")
        return None
    
    def find_tab_installation_data(self, tab_name: str) -> Optional[Dict[str, Any]]:
        """Find comprehensive installation data for a premium tab by analyzing its directory structure and existing installation."""
        self.logger.info(f"Discovering installation data for tab: {tab_name}")
        
        # Find source directory
        source_directory = self.find_premium_tab_source_directory(tab_name)
        if not source_directory:
            self.logger.warning(f"Could not find source directory for tab: {tab_name}")
        
        # Get backend name from configuration (may differ from folder name)
        backend_name = tab_name  # Default to folder name
        if source_directory:
            backend_index_file = os.path.join(source_directory, "backend", "index.json")
            if os.path.exists(backend_index_file):
                try:
                    import json
                    with open(backend_index_file, 'r') as f:
                        backend_manifest = json.load(f)
                    backend_name = backend_manifest.get("name", tab_name)
                    self.logger.debug(f"Using backend name '{backend_name}' from configuration (folder: '{tab_name}')")
                except Exception as e:
                    self.logger.warning(f"Error reading backend manifest, using folder name: {str(e)}")
        
        # Initialize installation data
        installation_data = {
            "tab_name": tab_name,
            "backend_name": backend_name,  # Store the actual backend name
            "source_directory": source_directory,
            "tab_directory": os.path.join(self.tablets_dir, backend_name),  # Use backend name, not folder name
            "backend_directory": os.path.join("/var/www/homeserver/backend", backend_name),  # Use backend name, not folder name
            "permissions_file": None,
            "files_to_remove": [],
            "backend_files_to_remove": [],  # New: backend files to remove
            "append_operations": [],
            "packages": {
                "python": [],
                "npm_patch": None,
                "system": []  # Added system packages
            },
            "config_patch": None
        }
        
        # 1. Check if frontend tab directory exists
        tab_dir = installation_data["tab_directory"]
        frontend_exists = os.path.exists(tab_dir)
        
        # 1.5. Check if backend directory exists (new structure)
        backend_dir = installation_data["backend_directory"]
        backend_exists = os.path.exists(backend_dir)
        
        # Check for blueprint registration as authoritative source
        blueprint_registered = False
        backend_init_path = "/var/www/homeserver/backend/__init__.py"
        if os.path.exists(backend_init_path):
            try:
                with open(backend_init_path, 'r') as f:
                    content = f.read()
                    # Check for blueprint registration marker
                    blueprint_pattern = f'# PREMIUM_TAB_IDENTIFIER: {backend_name}'
                    if blueprint_pattern in content:
                        blueprint_registered = True
                        self.logger.debug(f"Found blueprint registration for: {backend_name}")
            except Exception as e:
                self.logger.warning(f"Error checking blueprint registration: {str(e)}")
        
        # Only fail if NEITHER directory exists AND no blueprint registration found
        if not frontend_exists and not backend_exists and not blueprint_registered:
            self.logger.error(f"Tab directory not found: {tab_dir}")
            self.logger.error(f"Backend directory not found: {backend_dir}")
            self.logger.error(f"No blueprint registration found for: {backend_name}")
            self.logger.error(f"Could not find installation data for tab: {tab_name}")
            return None
        
        # Log what we found
        if frontend_exists:
            self.logger.debug(f"Found frontend directory: {tab_dir}")
        else:
            self.logger.debug(f"Frontend directory not found: {tab_dir} (partial installation)")
        
        if backend_exists:
            self.logger.debug(f"Found backend directory: {backend_dir}")
            # Add all backend files to removal list
            try:
                for root, dirs, files in os.walk(backend_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        installation_data["backend_files_to_remove"].append(file_path)
                        self.logger.debug(f"Found backend file to remove: {file_path}")
                
                self.logger.debug(f"Found {len(installation_data['backend_files_to_remove'])} backend files to remove")
            except Exception as e:
                self.logger.error(f"Error scanning backend directory: {str(e)}")
        else:
            self.logger.debug(f"Backend directory not found: {backend_dir} (partial installation)")
        
        if blueprint_registered:
            self.logger.info(f"Found blueprint registration - will clean up during uninstall")
        
        # 2. Find permissions file
        permissions_file = os.path.join(self.sudoers_dir, f"premium_{tab_name}")
        if os.path.exists(permissions_file):
            installation_data["permissions_file"] = permissions_file
            self.logger.debug(f"Found permissions file: {permissions_file}")
        
        # 3. Discover files to remove by reading frontend index.json
        if source_directory and os.path.exists(source_directory):
            frontend_index_file = os.path.join(source_directory, "frontend", "index.json")
            if os.path.exists(frontend_index_file):
                try:
                    import json
                    with open(frontend_index_file, 'r') as f:
                        frontend_manifest = json.load(f)
                    
                    # Extract file targets from manifest
                    for file_operation in frontend_manifest.get("files", []):
                        target_path = file_operation["target"]
                        # Replace {tabName} placeholder if present - use backend name for consistency
                        target_path = target_path.replace("{tabName}", backend_name)
                        installation_data["files_to_remove"].append(target_path)
                        self.logger.debug(f"Found file to remove: {target_path}")
                    
                    self.logger.debug(f"Found {len(installation_data['files_to_remove'])} files from frontend manifest")
                except Exception as e:
                    self.logger.warning(f"Error reading frontend manifest: {str(e)}")
            else:
                self.logger.warning(f"Frontend manifest not found, falling back to directory scan")
                # Fallback to directory scan if manifest not available (only if directory exists)
                if frontend_exists:
                    try:
                        for root, dirs, files in os.walk(tab_dir):
                            for file in files:
                                file_path = os.path.join(root, file)
                                installation_data["files_to_remove"].append(file_path)
                        
                        self.logger.debug(f"Found {len(installation_data['files_to_remove'])} files in tab directory (fallback)")
                    except Exception as e:
                        self.logger.error(f"Error scanning tab directory: {str(e)}")
                else:
                    self.logger.debug(f"Frontend directory does not exist, skipping directory scan")
        else:
            self.logger.warning(f"Source directory not found, falling back to directory scan")
            # Fallback to directory scan if source directory not available (only if directory exists)
            if frontend_exists:
                try:
                    for root, dirs, files in os.walk(tab_dir):
                        for file in files:
                            file_path = os.path.join(root, file)
                            installation_data["files_to_remove"].append(file_path)
                    
                    self.logger.debug(f"Found {len(installation_data['files_to_remove'])} files in tab directory (fallback)")
                except Exception as e:
                    self.logger.error(f"Error scanning tab directory: {str(e)}")
            else:
                self.logger.debug(f"Frontend directory does not exist, skipping directory scan")
        
        # 4. Find append operations to revert by reading backend index.json
        if source_directory and os.path.exists(source_directory):
            backend_index_file = os.path.join(source_directory, "backend", "index.json")
            if os.path.exists(backend_index_file):
                try:
                    import json
                    with open(backend_index_file, 'r') as f:
                        backend_manifest = json.load(f)
                    
                    # Extract append operations from manifest
                    for file_operation in backend_manifest.get("files", []):
                        if file_operation.get("type") == "append":
                            installation_data["append_operations"].append({
                                "target": file_operation["target"],
                                "identifier": file_operation["identifier"],
                                "marker": file_operation.get("marker", "")
                            })
                            self.logger.debug(f"Found append operation: {file_operation['target']} (identifier: {file_operation['identifier']})")
                
                except Exception as e:
                    self.logger.warning(f"Error reading backend manifest: {str(e)}")
        
        # 4.5. If blueprint is registered but we don't have source directory, add blueprint cleanup
        # This handles cases where source directory is missing but blueprint registration exists
        if blueprint_registered:
            # Check if we already have this append operation (from source directory)
            blueprint_append_exists = any(
                op.get("target") == "/var/www/homeserver/backend/__init__.py" and 
                op.get("identifier") == backend_name 
                for op in installation_data["append_operations"]
            )
            
            if not blueprint_append_exists:
                # Add blueprint cleanup operation
                installation_data["append_operations"].append({
                    "target": "/var/www/homeserver/backend/__init__.py",
                    "identifier": backend_name,
                    "marker": "PREMIUM TAB BLUEPRINTS"
                })
                self.logger.debug(f"Added blueprint cleanup operation for: {backend_name}")
        
        # 5. Discover package installation data from source directory
        if source_directory and os.path.exists(source_directory):
            
            # Python packages
            requirements_file = os.path.join(source_directory, "backend", "requirements.txt")
            if os.path.exists(requirements_file):
                try:
                    packages = self.package_manager.get_packages_from_requirements(requirements_file)
                    installation_data["packages"]["python"] = packages
                    self.logger.debug(f"Found {len(packages)} Python packages to uninstall")
                except Exception as e:
                    self.logger.warning(f"Error reading Python requirements: {str(e)}")
            
            # NPM packages
            npm_patch_file = os.path.join(source_directory, "frontend", "package.patch.json")
            if os.path.exists(npm_patch_file):
                installation_data["npm_patch"] = npm_patch_file
                try:
                    packages = self.package_manager.get_packages_from_npm_patch(npm_patch_file)
                    self.logger.debug(f"Found {len(packages)} NPM packages to uninstall")
                except Exception as e:
                    self.logger.warning(f"Error reading NPM patch: {str(e)}")
            
            # System packages
            dependencies_file = os.path.join(source_directory, "system", "dependencies.json")
            if os.path.exists(dependencies_file):
                try:
                    import json
                    with open(dependencies_file, 'r') as f:
                        dependencies_data = json.load(f)
                    
                    system_packages = []
                    for package in dependencies_data.get("packages", []):
                        system_packages.append(package["name"])
                    
                    installation_data["packages"]["system"] = system_packages
                    installation_data["system_dependencies_file"] = dependencies_file
                    self.logger.debug(f"Found {len(system_packages)} system packages to potentially uninstall")
                except Exception as e:
                    self.logger.warning(f"Error reading system dependencies: {str(e)}")
            
            # Config patch
            config_patch_file = os.path.join(source_directory, "homeserver.patch.json")
            if os.path.exists(config_patch_file):
                installation_data["config_patch"] = config_patch_file
                self.logger.debug(f"Found config patch: {config_patch_file}")
        
        self.logger.info(f"Installation data discovery completed for tab: {tab_name}")
        return installation_data
    
    def _cleanup_development_artifacts(self, source_directory: str) -> None:
        """Clean up development artifacts from premium tab source directory.
        
        This removes files that are generated during development/testing but
        should not be part of the distribution manifest, such as:
        - Python __pycache__ directories
        - .pyc files
        - Node.js node_modules (if any)
        - Build artifacts
        """
        self.logger.info(f"Cleaning up development artifacts from: {source_directory}")
        
        artifacts_removed = 0
        
        try:
            # Walk through the source directory
            for root, dirs, files in os.walk(source_directory, topdown=False):
                # FIRST: Remove individual .pyc files (before removing their parent directories)
                for file in files:
                    if file.endswith('.pyc'):
                        file_path = os.path.join(root, file)
                        try:
                            os.remove(file_path)
                            self.logger.info(f"Removed .pyc file: {file_path}")
                            artifacts_removed += 1
                        except Exception as e:
                            self.logger.warning(f"Failed to remove .pyc file {file_path}: {str(e)}")
                
                # SECOND: Remove node_modules directories (if any exist)
                for dir_name in dirs[:]:  # Use slice to avoid modification during iteration
                    if dir_name == "node_modules":
                        node_modules_path = os.path.join(root, dir_name)
                        try:
                            shutil.rmtree(node_modules_path)
                            self.logger.info(f"Removed node_modules directory: {node_modules_path}")
                            artifacts_removed += 1
                            dirs.remove(dir_name)  # Remove from dirs list to avoid walking into it
                        except Exception as e:
                            self.logger.warning(f"Failed to remove node_modules directory {node_modules_path}: {str(e)}")
                
                # THIRD: Remove __pycache__ directories (after individual .pyc files are gone)
                if os.path.basename(root) == "__pycache__":
                    try:
                        # Check if directory is empty or only contains files we couldn't remove
                        remaining_files = []
                        if os.path.exists(root):
                            remaining_files = [f for f in os.listdir(root) if not f.endswith('.pyc')]
                        
                        if not remaining_files:  # Directory is empty or only has .pyc files
                            shutil.rmtree(root)
                            self.logger.info(f"Removed __pycache__ directory: {root}")
                            artifacts_removed += 1
                        else:
                            self.logger.warning(f"Skipping __pycache__ directory {root} - contains non-.pyc files: {remaining_files}")
                    except Exception as e:
                        self.logger.warning(f"Failed to remove __pycache__ directory {root}: {str(e)}")
            
            if artifacts_removed > 0:
                self.logger.info(f"Successfully cleaned up {artifacts_removed} development artifacts")
            else:
                self.logger.info("No development artifacts found to clean up")
                
        except Exception as e:
            self.logger.error(f"Error during development artifacts cleanup: {str(e)}")
    
    def _clear_starred_tab_if_needed(self, tab_name: str) -> None:
        """Clear the starred tab field if it's set to the tab being uninstalled.
        
        This prevents the site from failing to load when the starred tab
        no longer exists after uninstallation.
        """
        try:
            # Get current starred tab value
            starred_tab = self.config_manager.get_config_value("tabs.starred")
            
            if starred_tab == tab_name:
                self.logger.warning(f"Starred tab is set to '{tab_name}' which is being uninstalled")
                self.logger.info("Clearing starred tab field to prevent site loading failure")
                
                # Clear the starred tab field
                if self.config_manager.set_config_value("tabs.starred", ""):
                    self.logger.info("Successfully cleared starred tab field")
                else:
                    self.logger.error("Failed to clear starred tab field")
            else:
                self.logger.debug(f"Starred tab '{starred_tab}' is not being uninstalled, leaving unchanged")
                
        except Exception as e:
            self.logger.error(f"Error checking/clearing starred tab: {str(e)}")
    
    def uninstall_premium_tab(self, tab_name: str, skip_build_and_restart: bool = False) -> bool:
        """Uninstall a premium tab completely.
        
        Args:
            tab_name: Name of the tab to uninstall
            skip_build_and_restart: If True, skip frontend rebuild and service restart
                                   (useful for reinstall operations)
        """
        self.logger.info(f"Starting uninstallation of premium tab: {tab_name}")
        
        try:
            # Discover installation data
            installation_data = self.find_tab_installation_data(tab_name)
            if not installation_data:
                self.logger.error(f"Could not find installation data for tab: {tab_name}")
                return False
            
            # Pre-validation
            self.logger.info("=== PRE-UNINSTALL VALIDATION ===")
            if not self.config_manager.validate_config_with_factory_fallback():
                self.logger.error("Current configuration is invalid")
                return False
            
            # Uninstall phase
            self.logger.info("=== UNINSTALLATION PHASE ===")
            
            # 1. Remove appended content from files
            for append_op in installation_data["append_operations"]:
                if not self.file_operations.remove_appended_content(
                    append_op["target"], append_op["identifier"]
                ):
                    self.logger.warning(f"Failed to remove appended content for {append_op['identifier']}")
            
            # 2. Remove files and symlinks
            for file_path in installation_data["files_to_remove"]:
                if not self.file_operations.remove_file_or_symlink(file_path):
                    self.logger.warning(f"Failed to remove file: {file_path}")
            
            # 2.5. Remove backend files from /var/www/homeserver/backend/{tabName}/ (new structure)
            for file_path in installation_data["backend_files_to_remove"]:
                if not self.file_operations.remove_file_or_symlink(file_path):
                    self.logger.warning(f"Failed to remove backend file: {file_path}")
            
            # 3. Remove permissions file
            if installation_data["permissions_file"]:
                if not self.file_operations.remove_file_or_symlink(installation_data["permissions_file"]):
                    self.logger.warning(f"Failed to remove permissions file: {installation_data['permissions_file']}")
            
            # 4. Remove tab directory
            tab_dir = installation_data["tab_directory"]
            if os.path.exists(tab_dir):
                try:
                    shutil.rmtree(tab_dir)
                    self.logger.info(f"Removed tab directory: {tab_dir}")
                except Exception as e:
                    self.logger.error(f"Failed to remove tab directory: {str(e)}")
            
            # 4.5. Remove backend directory (new structure)
            backend_dir = installation_data["backend_directory"]
            if os.path.exists(backend_dir):
                try:
                    shutil.rmtree(backend_dir)
                    self.logger.info(f"Removed backend directory: {backend_dir}")
                except Exception as e:
                    self.logger.error(f"Failed to remove backend directory: {str(e)}")
            
            # 5. Clean up empty directories
            self.file_operations.remove_empty_directories(tab_dir)
            # Also clean up empty backend directories
            self.file_operations.remove_empty_directories(backend_dir)
            
            # 5.5. Clean up development artifacts from source directory
            source_dir = installation_data.get("source_directory")
            if source_dir and os.path.exists(source_dir):
                self._cleanup_development_artifacts(source_dir)
                # Also clean up empty source directories
                self.file_operations.remove_empty_directories(source_dir)
            
            # 6. Revert package installations
            # Handle Python packages from installation data
            python_packages = installation_data["packages"].get("python", [])
            if python_packages:
                self.logger.info(f"Preserving {len(python_packages)} Python packages (uninstall disabled per policy)")
                # DISABLED: Never uninstall Python packages to prevent breaking other components
                # if not self.package_manager.uninstall_python_packages(python_packages):
                #     self.logger.warning("Failed to uninstall some Python packages")
            
            # Handle NPM patch from installation data
            npm_patch_file = installation_data["packages"].get("npm_patch")
            if npm_patch_file and os.path.exists(npm_patch_file):
                self.logger.info(f"Reverting NPM patch: {npm_patch_file}")
                if not self.package_manager.revert_npm_patch(npm_patch_file):
                    self.logger.warning("Failed to revert NPM patch")
            
            # Handle system packages from installation data (with caution)
            system_packages = installation_data["packages"].get("system", [])
            if system_packages:
                self.logger.info(f"Checking {len(system_packages)} system packages for safe removal")
                
                # WARNING: We generally do NOT automatically remove system packages during uninstall
                # because they may be required by other parts of the system or other tabs.
                # Instead, we log them for manual review.
                self.logger.warning("System packages were installed with this tab:")
                for pkg in system_packages:
                    self.logger.warning(f"  - {pkg}")
                
                self.logger.warning("These packages were NOT automatically removed for safety.")
                self.logger.warning("If you need to remove them, please do so manually after verifying")
                self.logger.warning("they are not required by other system components or premium tabs.")
                
                # Optional: Check if packages are still needed
                # This is a more advanced feature that could be implemented later
                # if we want to track system package dependencies across tabs
            
            # 7. Revert configuration changes
            # Use config patch from installation data first
            config_patch_from_data = installation_data.get("config_patch")
            if config_patch_from_data and os.path.exists(config_patch_from_data):
                self.logger.info(f"Reverting config patch: {config_patch_from_data}")
                if not self.config_manager.revert_config_patch(config_patch_from_data):
                    self.logger.warning("Failed to revert configuration patch")
            
            # 7.5. Check and clear starred tab if it's being uninstalled
            self._clear_starred_tab_if_needed(tab_name)
            
            # 8. Rebuild frontend
            if not skip_build_and_restart:
                if not self.build_manager.rebuild_frontend():
                    self.logger.warning("Failed to rebuild frontend")
            
            # 9. Restart services
            if not skip_build_and_restart:
                if not self.service_manager.restart_homeserver_services():
                    self.logger.warning("Failed to restart services")
            
            # Post-validation
            self.logger.info("=== POST-UNINSTALL VALIDATION ===")
            if not self.config_manager.validate_config_with_factory_fallback():
                self.logger.warning("Post-uninstall config validation failed")
            
            self.logger.info(f"Premium tab '{tab_name}' uninstalled successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Uninstallation failed: {str(e)}")
            return False
    

    
    def uninstall_all_premium_tabs(self) -> bool:
        """Uninstall all premium tabs, including broken installations."""
        self.logger.info("Starting uninstallation of all premium tabs")
        
        # Discover all installed tabs (including broken ones)
        installed_tabs = self.discover_installed_tabs()
        if not installed_tabs:
            self.logger.info("No premium tabs found to uninstall")
            return True
        
        # Separate properly installed tabs from broken ones
        broken_tabs = self.discover_broken_installations()
        proper_tabs = [tab for tab in installed_tabs if tab not in broken_tabs]
        
        if broken_tabs:
            self.logger.warning(f"Found {len(broken_tabs)} broken installations that will also be cleaned up")
            self.logger.warning(f"Broken tabs: {', '.join(broken_tabs)}")
        
        if proper_tabs:
            self.logger.info(f"Found {len(proper_tabs)} properly installed tabs to uninstall")
            self.logger.info(f"Proper tabs: {', '.join(proper_tabs)}")
        
        # Uninstall each tab
        uninstalled_tabs = []
        failed_tabs = []
        
        for tab_name in installed_tabs:
            is_broken = tab_name in broken_tabs
            status_msg = "broken installation" if is_broken else "proper installation"
            
            self.logger.info(f"Uninstalling premium tab: {tab_name} ({status_msg})")
            
            try:
                if self.uninstall_premium_tab(tab_name):
                    uninstalled_tabs.append(tab_name)
                    self.logger.info(f"✅ Successfully uninstalled: {tab_name}")
                else:
                    failed_tabs.append(tab_name)
                    self.logger.error(f"❌ Failed to uninstall: {tab_name}")
                    
            except Exception as e:
                failed_tabs.append(tab_name)
                self.logger.error(f"❌ Exception during uninstallation of {tab_name}: {str(e)}")
        
        # Summary
        self.logger.info(f"=== BATCH UNINSTALLATION SUMMARY ===")
        self.logger.info(f"Total tabs processed: {len(installed_tabs)}")
        self.logger.info(f"  - Proper installations: {len(proper_tabs)}")
        self.logger.info(f"  - Broken installations: {len(broken_tabs)}")
        self.logger.info(f"Successfully uninstalled: {len(uninstalled_tabs)} - {', '.join(uninstalled_tabs)}")
        
        if failed_tabs:
            self.logger.error(f"Failed uninstallations: {len(failed_tabs)} - {', '.join(failed_tabs)}")
            return False
        else:
            self.logger.info("🎉 All premium tabs uninstalled successfully!")
            return True
    
    def dry_run_uninstall(self, tab_name: str) -> Dict[str, Any]:
        """Perform a dry run of uninstallation to show what would be removed."""
        self.logger.info(f"Performing dry run uninstall for: {tab_name}")
        
        installation_data = self.find_tab_installation_data(tab_name)
        if not installation_data:
            return {"error": f"Could not find installation data for tab: {tab_name}"}
        
        dry_run_result = {
            "tab_name": tab_name,
            "files_to_remove": installation_data["files_to_remove"],
            "backend_files_to_remove": installation_data["backend_files_to_remove"],  # New: backend files
            "append_operations_to_revert": installation_data["append_operations"],
            "permissions_file": installation_data["permissions_file"],
            "tab_directory": installation_data["tab_directory"],
            "backend_directory": installation_data["backend_directory"],  # New: backend directory
            "estimated_impact": {
                "files_count": len(installation_data["files_to_remove"]),
                "backend_files_count": len(installation_data["backend_files_to_remove"]),  # New: backend count
                "has_permissions": installation_data["permissions_file"] is not None,
                "has_append_operations": len(installation_data["append_operations"]) > 0
            }
        }
        
        return dry_run_result 