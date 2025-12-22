#!/usr/bin/env python3
"""
Package Management Utility for Premium Tab Installer

Handles Python, NPM, and system package installations, patches, and rollbacks.
Provides atomic package operations with comprehensive tracking.
"""

import os
import json
import subprocess
import shutil
import platform
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field


@dataclass
class PackageInstallationState:
    """Tracks package installation state for rollback purposes."""
    installed_packages: Dict[str, List[str]] = field(default_factory=dict)  # pip, npm, system
    package_json_backup: Optional[str] = None
    system_packages_state: Dict[str, str] = field(default_factory=dict)  # package -> previous_state


@dataclass
class SystemPackage:
    """Represents a system package requirement."""
    name: str
    version: Optional[str] = None
    description: Optional[str] = None
    flags: List[str] = field(default_factory=list)
    conflicts: List[str] = field(default_factory=list)


@dataclass
class SystemDependencies:
    """Represents system dependencies from dependencies.json."""
    packages: List[SystemPackage]
    metadata: Dict[str, Any]
    platform: str
    version: str
    conflicts: List[str] = field(default_factory=list)


class PackageManager:
    """Manages package installations and rollbacks for premium tabs."""
    
    def __init__(self, logger, venv_path: str = "/var/www/homeserver/venv", 
                 package_json_path: str = "/var/www/homeserver/package.json"):
        self.logger = logger
        self.venv_path = venv_path
        self.package_json_path = package_json_path
        self.installation_state = PackageInstallationState()
        self.supported_platforms = ["debian", "ubuntu"]  # Supported system platforms
    
    def _run_command(self, cmd: List[str], check: bool = True, capture_output: bool = True, cwd: str = None) -> subprocess.CompletedProcess:
        """Run a command with logging."""
        cmd_str = ' '.join(cmd)
        if cwd:
            self.logger.debug(f"Running command in {cwd}: {cmd_str}")
        else:
            self.logger.debug(f"Running command: {cmd_str}")
        try:
            result = subprocess.run(cmd, check=check, capture_output=capture_output, text=True, cwd=cwd)
            if result.stdout:
                self.logger.debug(f"Command output: {result.stdout.strip()}")
            return result
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Command failed: {cmd_str}")
            self.logger.error(f"Error: {e.stderr if e.stderr else str(e)}")
            raise
    
    def _detect_system_platform(self) -> str:
        """Detect the current system platform."""
        try:
            # Try to detect using /etc/os-release
            if os.path.exists("/etc/os-release"):
                with open("/etc/os-release", 'r') as f:
                    for line in f:
                        if line.startswith("ID="):
                            platform_id = line.split("=")[1].strip().strip('"')
                            return platform_id.lower()
            
            # Fallback to platform module
            system = platform.system().lower()
            if system == "linux":
                # Try to determine distribution
                if os.path.exists("/etc/debian_version"):
                    return "debian"
                elif os.path.exists("/etc/redhat-release"):
                    return "rhel"
                elif os.path.exists("/etc/arch-release"):
                    return "arch"
            
            return system
        except Exception as e:
            self.logger.warning(f"Could not detect platform: {str(e)}")
            return "unknown"
    
    def _get_package_manager_command(self) -> List[str]:
        """Get the appropriate package manager command for the current platform."""
        platform_id = self._detect_system_platform()
        
        if platform_id in ["debian", "ubuntu"]:
            return ["apt-get", "install", "-y"]
        elif platform_id in ["rhel", "centos", "fedora"]:
            return ["dnf", "install", "-y"]
        elif platform_id == "arch":
            return ["pacman", "-S", "--noconfirm"]
        else:
            raise ValueError(f"Unsupported platform: {platform_id}")
    
    def _is_package_installed(self, package_name: str) -> bool:
        """Check if a system package is installed."""
        platform_id = self._detect_system_platform()
        
        try:
            if platform_id in ["debian", "ubuntu"]:
                result = self._run_command(["dpkg", "-l", package_name], check=False)
                return result.returncode == 0 and "ii" in result.stdout
            elif platform_id in ["rhel", "centos", "fedora"]:
                result = self._run_command(["rpm", "-q", package_name], check=False)
                return result.returncode == 0
            elif platform_id == "arch":
                result = self._run_command(["pacman", "-Q", package_name], check=False)
                return result.returncode == 0
            else:
                self.logger.warning(f"Package check not supported for platform: {platform_id}")
                return False
        except Exception:
            return False
    
    def _get_installed_package_version(self, package_name: str) -> Optional[str]:
        """Get the version of an installed system package."""
        platform_id = self._detect_system_platform()
        
        try:
            if platform_id in ["debian", "ubuntu"]:
                result = self._run_command(["dpkg-query", "--showformat='${Version}'", "--show", package_name], check=False)
                if result.returncode == 0:
                    return result.stdout.strip().strip("'")
            elif platform_id in ["rhel", "centos", "fedora"]:
                result = self._run_command(["rpm", "-q", "--queryformat", "%{VERSION}-%{RELEASE}", package_name], check=False)
                if result.returncode == 0:
                    return result.stdout.strip()
            elif platform_id == "arch":
                result = self._run_command(["pacman", "-Q", package_name], check=False)
                if result.returncode == 0:
                    # Output format: "package-name version-release"
                    parts = result.stdout.strip().split()
                    if len(parts) >= 2:
                        return parts[1]
        except Exception:
            pass
        
        return None
    
    def load_system_dependencies(self, dependencies_file: str) -> Optional[SystemDependencies]:
        """Load system dependencies from dependencies.json file."""
        if not os.path.exists(dependencies_file):
            self.logger.info("No system dependencies file found")
            return None
        
        try:
            with open(dependencies_file, 'r') as f:
                data = json.load(f)
            
            # Parse packages
            packages = []
            for pkg_data in data.get("packages", []):
                package = SystemPackage(
                    name=pkg_data["name"],
                    version=pkg_data.get("version"),
                    description=pkg_data.get("description"),
                    flags=pkg_data.get("flags", []),
                    conflicts=pkg_data.get("conflicts", [])
                )
                packages.append(package)
            
            # Parse metadata
            metadata = data.get("metadata", {})
            
            system_deps = SystemDependencies(
                packages=packages,
                metadata=metadata,
                platform=metadata.get("platform", "unknown"),
                version=metadata.get("version", "1.0.0"),
                conflicts=metadata.get("conflicts", [])
            )
            
            return system_deps
            
        except Exception as e:
            self.logger.error(f"Failed to load system dependencies: {str(e)}")
            return None
    
    def validate_system_platform(self, system_deps: SystemDependencies) -> bool:
        """Validate that system dependencies are compatible with current platform."""
        if not system_deps:
            return True
        
        current_platform = self._detect_system_platform()
        required_platform = system_deps.platform
        
        if required_platform == "unknown" or current_platform == "unknown":
            self.logger.warning("Platform detection uncertain - proceeding with caution")
            return True
        
        if current_platform not in self.supported_platforms:
            self.logger.error(f"Current platform '{current_platform}' is not supported")
            return False
        
        if required_platform != current_platform and required_platform != "any":
            self.logger.error(f"Platform mismatch: required='{required_platform}', current='{current_platform}'")
            return False
        
        self.logger.info(f"Platform validation passed: {current_platform}")
        return True
    
    def check_system_conflicts(self, system_deps: SystemDependencies) -> List[str]:
        """Check for system package conflicts."""
        conflicts = []
        
        if not system_deps:
            return conflicts
        
        # Check global conflicts
        for conflict_pkg in system_deps.conflicts:
            if self._is_package_installed(conflict_pkg):
                conflicts.append(f"Conflicting package installed: {conflict_pkg}")
        
        # Check per-package conflicts
        for package in system_deps.packages:
            for conflict_pkg in package.conflicts:
                if self._is_package_installed(conflict_pkg):
                    conflicts.append(f"Package {package.name} conflicts with installed package: {conflict_pkg}")
        
        return conflicts
    
    def install_system_dependencies(self, dependencies_file: str) -> bool:
        """Install system dependencies from dependencies.json file."""
        system_deps = self.load_system_dependencies(dependencies_file)
        if not system_deps:
            self.logger.info("No system dependencies to install")
            return True
        
        # Validate platform compatibility
        if not self.validate_system_platform(system_deps):
            return False
        
        # Check for conflicts
        conflicts = self.check_system_conflicts(system_deps)
        if conflicts:
            self.logger.error("System package conflicts detected:")
            for conflict in conflicts:
                self.logger.error(f"  - {conflict}")
            return False
        
        try:
            # Track current package states for rollback
            for package in system_deps.packages:
                was_installed = self._is_package_installed(package.name)
                self.installation_state.system_packages_state[package.name] = "installed" if was_installed else "not_installed"
            
            # Update package lists first
            self.logger.info("Updating package lists...")
            platform_id = self._detect_system_platform()
            if platform_id in ["debian", "ubuntu"]:
                self._run_command(["apt-get", "update"])
            elif platform_id in ["rhel", "centos", "fedora"]:
                self._run_command(["dnf", "check-update"], check=False)  # check-update returns 100 if updates available
            
            # Install packages
            packages_to_install = []
            for package in system_deps.packages:
                if not self._is_package_installed(package.name):
                    packages_to_install.append(package)
                else:
                    # Package is installed - check if version satisfies requirement
                    if package.version:
                        installed_version = self._get_installed_package_version(package.name)
                        if installed_version:
                            try:
                                # Parse versions for comparison (use permissive parsing)
                                from .version_checker import SemanticVersionChecker
                                version_checker = SemanticVersionChecker(self.logger)
                                
                                installed_sem_ver = version_checker.parse_semantic_version(installed_version, strict=False)
                                required_sem_ver = version_checker.parse_semantic_version(package.version, strict=False)
                                
                                # Use >= comparison (newer versions satisfy requirement)
                                if installed_sem_ver >= required_sem_ver:
                                    self.logger.info(f"Package {package.name} already installed with satisfactory version: {installed_version} >= {package.version}")
                                else:
                                    self.logger.info(f"Package {package.name} installed but version {installed_version} < {package.version}, will upgrade")
                                    packages_to_install.append(package)
                            except Exception as e:
                                # If version parsing fails, assume installed version is acceptable
                                self.logger.warning(f"Could not parse versions for {package.name} (installed: {installed_version}, required: {package.version}), assuming acceptable: {str(e)}")
                        else:
                            # Could not determine installed version, assume it's acceptable
                            self.logger.warning(f"Could not determine installed version for {package.name}, assuming acceptable")
                    else:
                        # No specific version required, any installed version is fine
                        self.logger.info(f"Package {package.name} already installed (no specific version required)")
            
            if packages_to_install:
                self.logger.info(f"Installing {len(packages_to_install)} system packages...")
                
                # Install packages with fallback mechanism for pinned versions
                successfully_installed = []
                for package in packages_to_install:
                    if self._install_single_system_package(package, platform_id):
                        successfully_installed.append(package.name)
                    else:
                        self.logger.error(f"Failed to install package: {package.name}")
                        return False
                
                # Track installed packages for rollback
                if successfully_installed:
                    if not self.installation_state.installed_packages.get("system"):
                        self.installation_state.installed_packages["system"] = []
                    self.installation_state.installed_packages["system"].extend(successfully_installed)
                
                self.logger.info(f"Successfully installed {len(successfully_installed)} system packages")
            else:
                self.logger.info("All required system packages are already installed with satisfactory versions")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to install system dependencies: {str(e)}")
            return False
    
    def _install_single_system_package(self, package: SystemPackage, platform_id: str) -> bool:
        """
        Install a single system package with fallback mechanism.
        
        If a pinned version is specified but unavailable in the repository,
        falls back to installing the unpinned (latest available) version.
        
        Args:
            package: SystemPackage object with name, version, and flags
            platform_id: Platform identifier (debian, ubuntu, etc.)
            
        Returns:
            bool: True if package was successfully installed, False otherwise
        """
        try:
            # Build base install command
            install_cmd = self._get_package_manager_command()
            
            # Add package flags if specified
            if package.flags:
                install_cmd.extend(package.flags)
                if hasattr(self.logger, 'debug'):
                    self.logger.debug(f"DEBUG: Using package flags for {package.name}: {package.flags}")
            
            # First attempt: try with pinned version if specified
            if package.version and platform_id in ["debian", "ubuntu"]:
                pinned_package = f"{package.name}={package.version}"
                pinned_cmd = install_cmd + [pinned_package]
                
                self.logger.info(f"Attempting to install {package.name} with pinned version {package.version}")
                if hasattr(self.logger, 'debug'):
                    self.logger.debug(f"DEBUG: Pinned install command: {' '.join(pinned_cmd)}")
                
                try:
                    self._run_command(pinned_cmd)
                    self.logger.info(f"✅ Successfully installed {package.name}={package.version}")
                    return True
                    
                except Exception as pinned_error:
                    self.logger.warning(f"⚠️  Failed to install {package.name}={package.version}: {str(pinned_error)}")
                    self.logger.info(f"🔄 Falling back to unpinned version for {package.name}")
                    
                    if hasattr(self.logger, 'debug'):
                        self.logger.debug(f"DEBUG: Pinned version installation failed, attempting fallback")
                        self.logger.debug(f"DEBUG: Original error: {type(pinned_error).__name__}: {str(pinned_error)}")
                    
                    # Fallback: try unpinned version
                    unpinned_cmd = install_cmd + [package.name]
                    
                    if hasattr(self.logger, 'debug'):
                        self.logger.debug(f"DEBUG: Fallback install command: {' '.join(unpinned_cmd)}")
                    
                    try:
                        self._run_command(unpinned_cmd)
                        
                        # Get the actually installed version for logging
                        installed_version = self._get_installed_package_version(package.name)
                        if installed_version:
                            self.logger.info(f"✅ Successfully installed {package.name} (fallback version: {installed_version})")
                            if hasattr(self.logger, 'debug'):
                                self.logger.debug(f"DEBUG: Fallback successful - installed version: {installed_version}")
                        else:
                            self.logger.info(f"✅ Successfully installed {package.name} (unpinned fallback)")
                            if hasattr(self.logger, 'debug'):
                                self.logger.debug(f"DEBUG: Fallback successful - could not determine installed version")
                        
                        return True
                        
                    except Exception as unpinned_error:
                        self.logger.error(f"❌ Failed to install {package.name} even with unpinned version: {str(unpinned_error)}")
                        if hasattr(self.logger, 'debug'):
                            self.logger.debug(f"DEBUG: Fallback also failed: {type(unpinned_error).__name__}: {str(unpinned_error)}")
                        return False
            
            else:
                # No version specified or non-Debian platform - install directly
                direct_cmd = install_cmd + [package.name]
                
                if package.version:
                    self.logger.info(f"Installing {package.name} (version pinning not supported on {platform_id})")
                    if hasattr(self.logger, 'debug'):
                        self.logger.debug(f"DEBUG: Platform {platform_id} does not support version pinning")
                else:
                    self.logger.info(f"Installing {package.name} (no version specified)")
                    if hasattr(self.logger, 'debug'):
                        self.logger.debug(f"DEBUG: No version specified for {package.name}")
                
                if hasattr(self.logger, 'debug'):
                    self.logger.debug(f"DEBUG: Direct install command: {' '.join(direct_cmd)}")
                
                self._run_command(direct_cmd)
                
                # Get the actually installed version for logging
                installed_version = self._get_installed_package_version(package.name)
                if installed_version:
                    self.logger.info(f"✅ Successfully installed {package.name} (version: {installed_version})")
                    if hasattr(self.logger, 'debug'):
                        self.logger.debug(f"DEBUG: Direct installation successful - version: {installed_version}")
                else:
                    self.logger.info(f"✅ Successfully installed {package.name}")
                    if hasattr(self.logger, 'debug'):
                        self.logger.debug(f"DEBUG: Direct installation successful - could not determine version")
                
                return True
                
        except Exception as e:
            self.logger.error(f"❌ Failed to install {package.name}: {str(e)}")
            if hasattr(self.logger, 'debug'):
                self.logger.debug(f"DEBUG: Installation failed with exception: {type(e).__name__}: {str(e)}")
            return False
    
    def uninstall_system_packages(self, packages: List[str]) -> bool:
        """Uninstall system packages."""
        if not packages:
            return True
        
        try:
            platform_id = self._detect_system_platform()
            
            if platform_id in ["debian", "ubuntu"]:
                remove_cmd = ["apt-get", "remove", "-y"] + packages
            elif platform_id in ["rhel", "centos", "fedora"]:
                remove_cmd = ["dnf", "remove", "-y"] + packages
            elif platform_id == "arch":
                remove_cmd = ["pacman", "-R", "--noconfirm"] + packages
            else:
                self.logger.error(f"Package removal not supported for platform: {platform_id}")
                return False
            
            self.logger.info(f"Removing system packages: {', '.join(packages)}")
            self._run_command(remove_cmd)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to uninstall system packages: {str(e)}")
            return False
    
    def create_backup(self, file_path: str) -> Optional[str]:
        """Create a backup of a file and return backup path."""
        if not os.path.exists(file_path):
            return None
            
        from datetime import datetime
        backup_path = f"/tmp/{os.path.basename(file_path)}.installer_backup.{int(datetime.now().timestamp())}"
        shutil.copy2(file_path, backup_path)
        self.logger.debug(f"Created backup: {file_path} -> {backup_path}")
        return backup_path
    
    def restore_backup(self, backup_path: str, target_path: str) -> bool:
        """Restore a file from backup."""
        if not backup_path or not os.path.exists(backup_path):
            return False
            
        try:
            shutil.copy2(backup_path, target_path)
            self.logger.debug(f"Restored backup: {backup_path} -> {target_path}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to restore backup: {str(e)}")
            return False
    
    def get_current_pip_packages(self) -> Dict[str, str]:
        """Get currently installed pip packages."""
        try:
            result = self._run_command([f"{self.venv_path}/bin/pip", "freeze"])
            current_packages = {}
            for line in result.stdout.split('\n'):
                if '==' in line:
                    name, version = line.split('==', 1)
                    current_packages[name.lower()] = version
            return current_packages
        except Exception as e:
            self.logger.warning(f"Could not get current Python packages: {str(e)}")
            return {}
    
    def get_current_npm_packages(self) -> Dict[str, str]:
        """Get currently installed npm packages."""
        try:
            if not os.path.exists(self.package_json_path):
                return {}
                
            with open(self.package_json_path, 'r') as f:
                package_data = json.load(f)
            
            packages = {}
            for section in ["dependencies", "devDependencies"]:
                if section in package_data:
                    packages.update(package_data[section])
            
            return packages
        except Exception as e:
            self.logger.warning(f"Could not get current NPM packages: {str(e)}")
            return {}
    
    def install_python_requirements(self, requirements_file: str) -> bool:
        """Install Python requirements."""
        if not os.path.exists(requirements_file) or os.path.getsize(requirements_file) == 0:
            self.logger.info("No Python requirements to install")
            return True
        
        try:
            self.logger.info("Installing Python requirements")
            self._run_command([
                f"{self.venv_path}/bin/pip", "install", "-r", requirements_file
            ])
            
            # Track installed packages for rollback
            with open(requirements_file, 'r') as f:
                packages = [line.strip().split('==')[0] for line in f 
                          if line.strip() and not line.startswith('#') and '==' in line]
            
            if not self.installation_state.installed_packages.get("pip"):
                self.installation_state.installed_packages["pip"] = []
            self.installation_state.installed_packages["pip"].extend(packages)
            
            self.logger.info("Python requirements installed successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to install Python requirements: {str(e)}")
            return False
    
    def apply_npm_patch(self, patch_file: str) -> bool:
        """Apply NPM package patch."""
        if not os.path.exists(patch_file):
            self.logger.info("No NPM patch to apply")
            return True
        
        try:
            with open(patch_file, 'r') as f:
                patch_data = json.load(f)
            
            if not patch_data:  # Empty patch
                self.logger.info("Empty NPM patch, skipping")
                return True
            
            # Read current package.json
            with open(self.package_json_path, 'r') as f:
                package_data = json.load(f)
            
            # Create backup
            self.installation_state.package_json_backup = self.create_backup(self.package_json_path)
            
            # Apply patch
            for section in ["dependencies", "devDependencies"]:
                if section in patch_data:
                    if section not in package_data:
                        package_data[section] = {}
                    
                    # Track new packages for rollback
                    new_packages = []
                    for name, version in patch_data[section].items():
                        if name not in package_data[section]:
                            new_packages.append(name)
                        package_data[section][name] = version
                    
                    if new_packages:
                        if not self.installation_state.installed_packages.get("npm"):
                            self.installation_state.installed_packages["npm"] = []
                        self.installation_state.installed_packages["npm"].extend(new_packages)
            
            # Write updated package.json
            with open(self.package_json_path, 'w') as f:
                json.dump(package_data, f, indent=2)
            
            # Install new packages
            self.logger.info("Installing NPM packages")
            self._run_command(["npm", "install"], cwd=os.path.dirname(self.package_json_path))
            
            self.logger.info("NPM patch applied successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to apply NPM patch: {str(e)}")
            # Restore backup
            if self.installation_state.package_json_backup:
                self.restore_backup(self.installation_state.package_json_backup, self.package_json_path)
            return False
    
    def check_python_conflicts(self, requirements_file: str) -> List[str]:
        """Check for Python package version conflicts."""
        conflicts = []
        
        if not os.path.exists(requirements_file) or os.path.getsize(requirements_file) == 0:
            return conflicts
        
        try:
            with open(requirements_file, 'r') as f:
                new_requirements = [line.strip() for line in f if line.strip() and not line.startswith('#')]
            
            # Get current venv packages
            current_packages = self.get_current_pip_packages()
            
            # Check for direct version conflicts first
            for req in new_requirements:
                if '==' in req:
                    name, version = req.split('==', 1)
                    name = name.lower()
                    if name in current_packages and current_packages[name] != version:
                        conflicts.append(f"Python package {name}: current={current_packages[name]}, required={version}")
            
            # If no direct conflicts, perform dependency resolution check
            if not conflicts:
                dependency_conflicts = self.check_pip_dependency_resolution(requirements_file)
                conflicts.extend(dependency_conflicts)
                        
        except Exception as e:
            self.logger.error(f"Error checking Python conflicts: {str(e)}")
            
        return conflicts
    
    def check_pip_dependency_resolution(self, requirements_file: str) -> List[str]:
        """Use pip's dependency resolver to check for conflicts via dry-run installation."""
        conflicts = []
        
        try:
            self.logger.debug("Performing pip dependency resolution check")
            
            # Use pip install --dry-run to check dependencies without actually installing
            # This uses pip's full dependency resolver
            pip_cmd = [
                f"{self.venv_path}/bin/pip", "install", 
                "--dry-run",  # Don't actually install
                "--report", "/dev/stdout",  # Output resolution report to stdout
                "-r", requirements_file
            ]
            
            # Run the command and capture output
            result = subprocess.run(
                pip_cmd,
                capture_output=True,
                text=True,
                timeout=60  # 60 second timeout
            )
            
            # If pip returns non-zero exit code, there's a conflict
            if result.returncode != 0:
                # Parse the error output for useful conflict information
                error_output = result.stderr.strip()
                if "ResolutionImpossible" in error_output or "conflicting dependencies" in error_output:
                    # Extract the key conflict information
                    conflict_lines = []
                    for line in error_output.split('\n'):
                        if any(keyword in line.lower() for keyword in [
                            'cannot install', 'conflicting dependencies', 'resolutionimpossible',
                            'incompatible', 'requires', 'but'
                        ]):
                            conflict_lines.append(line.strip())
                    
                    if conflict_lines:
                        conflicts.append(f"Pip dependency resolution failed: {'; '.join(conflict_lines[:3])}")  # Limit to first 3 lines
                    else:
                        conflicts.append(f"Pip dependency resolution failed: {error_output[:200]}...")  # First 200 chars
                else:
                    conflicts.append(f"Pip installation failed: {error_output[:200]}...")
                    
                self.logger.debug(f"Pip dependency resolution failed with exit code {result.returncode}")
                self.logger.debug(f"Error output: {error_output}")
            else:
                self.logger.debug("Pip dependency resolution check passed")
                
        except subprocess.TimeoutExpired:
            conflicts.append("Pip dependency resolution check timed out")
            self.logger.error("Pip dependency resolution check timed out")
        except Exception as e:
            conflicts.append(f"Error during dependency resolution check: {str(e)}")
            self.logger.error(f"Error during pip dependency resolution check: {str(e)}")
            
        return conflicts
    
    def check_npm_conflicts(self, patch_file: str) -> List[str]:
        """Check for NPM package version conflicts."""
        conflicts = []
        
        if not os.path.exists(patch_file):
            return conflicts
        
        try:
            with open(patch_file, 'r') as f:
                patch_data = json.load(f)
            
            if not patch_data:  # Empty patch
                return conflicts
            
            # Get current package.json
            current_packages = self.get_current_npm_packages()
            
            # Check dependencies
            for dep_type in ["dependencies", "devDependencies"]:
                if dep_type in patch_data:
                    for name, version in patch_data[dep_type].items():
                        if name in current_packages and current_packages[name] != version:
                            conflicts.append(f"NPM package {name}: current={current_packages[name]}, required={version}")
                            
        except Exception as e:
            self.logger.error(f"Error checking NPM conflicts: {str(e)}")
            
        return conflicts
    
    def check_all_conflicts(self, requirements_file: str, patch_file: str, dependencies_file: str = None) -> List[str]:
        """Check for all package conflicts (Python, NPM, and system)."""
        all_conflicts = []
        
        # Check Python conflicts
        python_conflicts = self.check_python_conflicts(requirements_file)
        all_conflicts.extend(python_conflicts)
        
        # Check NPM conflicts
        npm_conflicts = self.check_npm_conflicts(patch_file)
        all_conflicts.extend(npm_conflicts)
        
        # Check system conflicts
        if dependencies_file:
            system_deps = self.load_system_dependencies(dependencies_file)
            if system_deps:
                system_conflicts = self.check_system_conflicts(system_deps)
                all_conflicts.extend(system_conflicts)
        
        return all_conflicts
    
    def rollback_package_installations(self) -> None:
        """Rollback package installations."""
        self.logger.info("Rolling back package installations")
        
        # Restore package.json backup
        if self.installation_state.package_json_backup:
            self.restore_backup(self.installation_state.package_json_backup, self.package_json_path)
        
        # Rollback package installations
        for package_type, packages in self.installation_state.installed_packages.items():
            try:
                if package_type == "pip" and packages:
                    # DISABLED: Never uninstall Python packages to prevent breaking other components
                    self.logger.info(f"Preserving {len(packages)} Python packages during rollback (uninstall disabled per policy)")
                    # self.uninstall_python_packages(packages)
                elif package_type == "npm" and packages:
                    self.logger.info(f"Uninstalling NPM packages: {', '.join(packages)}")
                    self._run_command(["npm", "uninstall"] + packages, 
                                    cwd=os.path.dirname(self.package_json_path))
                elif package_type == "system" and packages:
                    # Only remove packages that were not previously installed
                    packages_to_remove = []
                    for pkg in packages:
                        if (pkg in self.installation_state.system_packages_state and 
                            self.installation_state.system_packages_state[pkg] == "not_installed"):
                            packages_to_remove.append(pkg)
                        else:
                            self.logger.info(f"Keeping system package {pkg} (was previously installed)")
                    
                    if packages_to_remove:
                        self.logger.info(f"Removing newly installed system packages: {', '.join(packages_to_remove)}")
                        self.uninstall_system_packages(packages_to_remove)
                    
            except Exception as e:
                self.logger.error(f"Error rolling back {package_type} packages: {str(e)}")
        
        # Clear installation state
        self.installation_state = PackageInstallationState()
    
    def validate_python_environment(self) -> bool:
        """Validate Python virtual environment."""
        try:
            # Check if venv exists
            if not os.path.exists(self.venv_path):
                self.logger.error(f"Virtual environment not found: {self.venv_path}")
                return False
            
            # Check if pip is available
            pip_path = f"{self.venv_path}/bin/pip"
            if not os.path.exists(pip_path):
                self.logger.error(f"Pip not found in virtual environment: {pip_path}")
                return False
            
            # Test pip functionality
            self._run_command([pip_path, "--version"])
            
            self.logger.debug("Python environment validation successful")
            return True
            
        except Exception as e:
            self.logger.error(f"Python environment validation failed: {str(e)}")
            return False
    
    def validate_npm_environment(self) -> bool:
        """Validate NPM environment."""
        try:
            # Check if npm is available
            self._run_command(["npm", "--version"])
            
            # Check if package.json exists
            if not os.path.exists(self.package_json_path):
                self.logger.error(f"Package.json not found: {self.package_json_path}")
                return False
            
            # Validate package.json syntax
            with open(self.package_json_path, 'r') as f:
                json.load(f)
            
            self.logger.debug("NPM environment validation successful")
            return True
            
        except Exception as e:
            self.logger.error(f"NPM environment validation failed: {str(e)}")
            return False
    
    def validate_environments(self) -> bool:
        """Validate both Python and NPM environments."""
        python_valid = self.validate_python_environment()
        npm_valid = self.validate_npm_environment()
        
        return python_valid and npm_valid
    
    def _get_core_system_dependencies(self) -> List[str]:
        """Get list of core system Python dependencies from main requirements.txt."""
        core_requirements_file = os.path.join(os.path.dirname(self.package_json_path), "requirements.txt")
        core_dependencies = []
        
        if os.path.exists(core_requirements_file):
            try:
                with open(core_requirements_file, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            # Extract package name (before ==, >=, etc.)
                            package_name = line.split('==')[0].split('>=')[0].split('<=')[0].split('>')[0].split('<')[0].split('!')[0].strip()
                            if package_name:
                                core_dependencies.append(package_name.lower())
            except Exception as e:
                self.logger.warning(f"Could not read core requirements file: {str(e)}")
        
        return core_dependencies

    def uninstall_python_packages(self, packages: List[str]) -> bool:
        """Uninstall specific Python packages, but preserve core system dependencies."""
        if not packages:
            self.logger.info("No Python packages to uninstall")
            return True
        
        # Get core system dependencies to protect them
        core_dependencies = self._get_core_system_dependencies()
        
        # Filter out core system dependencies
        packages_to_remove = []
        protected_packages = []
        
        for package in packages:
            package_name_lower = package.lower()
            if package_name_lower in core_dependencies:
                protected_packages.append(package)
                self.logger.info(f"Keeping core system dependency: {package}")
            else:
                packages_to_remove.append(package)
        
        if protected_packages:
            self.logger.warning(f"Protected {len(protected_packages)} core system dependencies from removal:")
            for pkg in protected_packages:
                self.logger.warning(f"  - {pkg}")
        
        if not packages_to_remove:
            self.logger.info("No packages to uninstall (all were core system dependencies)")
            return True
        
        try:
            self.logger.info(f"Uninstalling {len(packages_to_remove)} Python packages: {', '.join(packages_to_remove)}")
            self._run_command([
                f"{self.venv_path}/bin/pip", "uninstall", "-y"
            ] + packages_to_remove)
            
            self.logger.info("Python packages uninstalled successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to uninstall Python packages: {str(e)}")
            return False
    
    def remove_npm_packages(self, packages: List[str]) -> bool:
        """Remove specific NPM packages."""
        if not packages:
            self.logger.info("No NPM packages to remove")
            return True
        
        try:
            self.logger.info(f"Removing NPM packages: {', '.join(packages)}")
            self._run_command(["npm", "uninstall"] + packages, 
                            cwd=os.path.dirname(self.package_json_path))
            
            self.logger.info("NPM packages removed successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to remove NPM packages: {str(e)}")
            return False
    
    def revert_npm_patch(self, patch_file: str) -> bool:
        """Revert NPM package patch by removing the packages it added."""
        if not os.path.exists(patch_file):
            self.logger.info("No NPM patch to revert")
            return True
        
        try:
            with open(patch_file, 'r') as f:
                patch_data = json.load(f)
            
            if not patch_data:  # Empty patch
                self.logger.info("Empty NPM patch, nothing to revert")
                return True
            
            # Read current package.json
            with open(self.package_json_path, 'r') as f:
                package_data = json.load(f)
            
            # Create backup
            backup_path = self.create_backup(self.package_json_path)
            
            # Remove packages that were added by the patch
            packages_to_remove = []
            modified = False
            
            for section in ["dependencies", "devDependencies"]:
                if section in patch_data and section in package_data:
                    for name, version in patch_data[section].items():
                        if name in package_data[section]:
                            # Only remove if the version matches what we installed
                            if package_data[section][name] == version:
                                del package_data[section][name]
                                packages_to_remove.append(name)
                                modified = True
                                self.logger.debug(f"Removed {name} from {section}")
                            else:
                                self.logger.warning(f"Version mismatch for {name}, not removing")
            
            if not modified:
                self.logger.info("No packages to remove from package.json")
                return True
            
            # Write updated package.json
            with open(self.package_json_path, 'w') as f:
                json.dump(package_data, f, indent=2)
            
            # Remove packages from node_modules
            if packages_to_remove:
                success = self.remove_npm_packages(packages_to_remove)
                if not success:
                    # Restore backup on failure
                    self.restore_backup(backup_path, self.package_json_path)
                    return False
            
            self.logger.info("NPM patch reverted successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to revert NPM patch: {str(e)}")
            return False
    
    def get_packages_from_requirements(self, requirements_file: str) -> List[str]:
        """Extract package names from requirements.txt file."""
        packages = []
        
        if not os.path.exists(requirements_file) or os.path.getsize(requirements_file) == 0:
            return packages
        
        try:
            with open(requirements_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        # Extract package name (before ==, >=, etc.)
                        package_name = line.split('==')[0].split('>=')[0].split('<=')[0].split('~=')[0].strip()
                        if package_name:
                            packages.append(package_name)
            
            return packages
            
        except Exception as e:
            self.logger.error(f"Failed to read requirements file: {str(e)}")
            return []
    
    def get_packages_from_npm_patch(self, patch_file: str) -> List[str]:
        """Extract package names from NPM patch file."""
        packages = []
        
        if not os.path.exists(patch_file):
            return packages
        
        try:
            with open(patch_file, 'r') as f:
                patch_data = json.load(f)
            
            for section in ["dependencies", "devDependencies"]:
                if section in patch_data:
                    packages.extend(patch_data[section].keys())
            
            return packages
            
        except Exception as e:
            self.logger.error(f"Failed to read NPM patch file: {str(e)}")
            return [] 