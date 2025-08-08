#!/usr/bin/env python3
"""
Validation Utility for Premium Tab Installer

Handles manifest validation, security checks, and configuration validation.
Provides comprehensive validation with detailed error reporting.
"""

import os
import json
import re
import subprocess
from typing import Dict, List, Tuple, Any, Optional
from pathlib import Path


class ValidationManager:
    """Manages all validation operations for premium tab installation."""
    
    # Valid target paths for security
    ALLOWED_TARGET_PATHS = [
        "/var/www/homeserver/backend/__init__.py",
        "/etc/sudoers.d/",
        "/var/www/homeserver/src/tablets/",
        "/var/www/homeserver/src/config/homeserver.json",
        "/var/www/homeserver/src/tablets",
        "/var/www/homeserver/backend",
        "/usr/local/bin",
        "/usr/local/sbin"
    ]
    
    # Dangerous system packages that should be avoided
    DANGEROUS_SYSTEM_PACKAGES = [
        "rm", "rmdir", "dd", "fdisk", "mkfs", "format",
        "shutdown", "reboot", "halt", "init", "systemctl",
        "iptables", "ufw", "firewalld", "selinux", "apparmor"
    ]
    
    # Required fields for dependencies.json
    DEPENDENCIES_REQUIRED_FIELDS = ["packages", "metadata"]
    DEPENDENCIES_METADATA_REQUIRED = ["version", "platform"]
    DEPENDENCIES_PACKAGE_REQUIRED = ["name"]
    
    def __init__(self, logger):
        self.logger = logger
    
    def is_target_path_allowed(self, target_path: str) -> bool:
        """Check if target path is within allowed directories."""
        target_path = os.path.abspath(target_path)
        
        for allowed_path in self.ALLOWED_TARGET_PATHS:
            if target_path.startswith(os.path.abspath(allowed_path)):
                return True
                
        return False
    
    def validate_json_schema(self, file_path: str, schema_type: str) -> bool:
        """Validate JSON file against expected schema."""
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            
            if schema_type == "root_index":
                required_fields = ["name", "version", "files"]
                if not all(field in data for field in required_fields):
                    self.logger.error(f"Missing required fields in {file_path}")
                    return False
                    
                # Validate version format (semantic versioning)
                if not re.match(r'^\d+\.\d+\.\d+$', data["version"]):
                    self.logger.error(f"Invalid version format in {file_path}: {data['version']}")
                    return False
                    
            elif schema_type == "component_index":
                required_fields = ["name", "version", "files"]
                if not all(field in data for field in required_fields):
                    self.logger.error(f"Missing required fields in {file_path}")
                    return False
                    
                # Validate file operations
                if isinstance(data["files"], list):
                    for file_op in data["files"]:
                        required_op_fields = ["source", "target", "type"]
                        if not all(field in file_op for field in required_op_fields):
                            self.logger.error(f"Invalid file operation in {file_path}")
                            return False
                            
                        # Validate target path security
                        if not self.is_target_path_allowed(file_op["target"]):
                            self.logger.error(f"Target path not allowed: {file_op['target']}")
                            return False
            
            elif schema_type == "dependencies":
                # Validate dependencies.json structure
                if not all(field in data for field in self.DEPENDENCIES_REQUIRED_FIELDS):
                    missing_fields = [f for f in self.DEPENDENCIES_REQUIRED_FIELDS if f not in data]
                    self.logger.error(f"Missing required fields in {file_path}: {missing_fields}")
                    return False
                
                # Validate metadata section
                metadata = data.get("metadata", {})
                if not all(field in metadata for field in self.DEPENDENCIES_METADATA_REQUIRED):
                    missing_fields = [f for f in self.DEPENDENCIES_METADATA_REQUIRED if f not in metadata]
                    self.logger.error(f"Missing required metadata fields in {file_path}: {missing_fields}")
                    return False
                
                # Validate version format
                if not re.match(r'^\d+\.\d+\.\d+$', metadata["version"]):
                    self.logger.error(f"Invalid metadata version format in {file_path}: {metadata['version']}")
                    return False
                
                # Validate platform
                supported_platforms = ["debian", "ubuntu", "rhel", "centos", "fedora", "arch", "any"]
                if metadata["platform"] not in supported_platforms:
                    self.logger.error(f"Unsupported platform in {file_path}: {metadata['platform']}")
                    return False
                
                # Validate packages section
                packages = data.get("packages", [])
                if not isinstance(packages, list):
                    self.logger.error(f"Packages must be a list in {file_path}")
                    return False
                
                for i, package in enumerate(packages):
                    if not isinstance(package, dict):
                        self.logger.error(f"Package {i} must be an object in {file_path}")
                        return False
                    
                    if not all(field in package for field in self.DEPENDENCIES_PACKAGE_REQUIRED):
                        missing_fields = [f for f in self.DEPENDENCIES_PACKAGE_REQUIRED if f not in package]
                        self.logger.error(f"Package {i} missing required fields in {file_path}: {missing_fields}")
                        return False
                    
                    # Validate package name (security check)
                    if not self.validate_system_package_name(package["name"]):
                        self.logger.error(f"Invalid or dangerous package name in {file_path}: {package['name']}")
                        return False
                    
                    # Validate version format if provided
                    if "version" in package and package["version"]:
                        if not re.match(r'^[\d\w\.\-\+:~]+$', package["version"]):
                            self.logger.error(f"Invalid version format for package {package['name']} in {file_path}: {package['version']}")
                            return False
                    
                    # Validate flags if provided
                    if "flags" in package:
                        if not isinstance(package["flags"], list):
                            self.logger.error(f"Flags must be a list for package {package['name']} in {file_path}")
                            return False
                        
                        # Check for dangerous flags
                        for flag in package["flags"]:
                            if not self.validate_package_flag(flag):
                                self.logger.error(f"Dangerous flag for package {package['name']} in {file_path}: {flag}")
                                return False
                    
                    # Validate conflicts if provided
                    if "conflicts" in package:
                        if not isinstance(package["conflicts"], list):
                            self.logger.error(f"Conflicts must be a list for package {package['name']} in {file_path}")
                            return False
                        
                        for conflict_pkg in package["conflicts"]:
                            if not self.validate_system_package_name(conflict_pkg):
                                self.logger.error(f"Invalid conflict package name for {package['name']} in {file_path}: {conflict_pkg}")
                                return False
            
            return True
            
        except json.JSONDecodeError as e:
            self.logger.error(f"Invalid JSON in {file_path}: {str(e)}")
            return False
        except Exception as e:
            self.logger.error(f"Error validating {file_path}: {str(e)}")
            return False
    
    def validate_system_package_name(self, package_name: str) -> bool:
        """Validate system package name for security."""
        if not package_name or not isinstance(package_name, str):
            return False
        
        # Check against dangerous packages
        if package_name.lower() in self.DANGEROUS_SYSTEM_PACKAGES:
            return False
        
        # Check for valid package name format (alphanumeric, hyphens, plus, dots)
        if not re.match(r'^[a-zA-Z0-9\.\-\+]+$', package_name):
            return False
        
        # Package name should not start with special characters
        if package_name.startswith('-') or package_name.startswith('+') or package_name.startswith('.'):
            return False
        
        return True
    
    def validate_package_flag(self, flag: str) -> bool:
        """Validate package manager flags for security."""
        if not flag or not isinstance(flag, str):
            return False
        
        # Allow common safe flags
        safe_flags = [
            "--no-install-recommends", "--no-install-suggests",
            "--allow-unauthenticated", "--allow-downgrades",
            "--assume-yes", "-y", "--quiet", "-q",
            "--verbose", "-v", "--dry-run", "--simulate",
            "--reinstall", "--fix-broken", "--fix-missing"
        ]
        
        # Check if it's a safe flag
        if flag in safe_flags:
            return True
        
        # Check for dangerous patterns
        dangerous_patterns = [
            r'--force', r'--unsafe', r'--skip.*check',
            r'--allow.*unauth', r'--ignore.*dep',
            r'rm\s', r'del\s', r'format\s', r'mkfs\s'
        ]
        
        for pattern in dangerous_patterns:
            if re.search(pattern, flag, re.IGNORECASE):
                return False
        
        # Warn about unknown flags but allow them (with validation logging)
        self.logger.warning(f"Unknown package flag (allowed but logged): {flag}")
        return True
    
    def validate_package_manifest(self, tab_path: str) -> Tuple[bool, Dict[str, Any]]:
        """Validate complete package manifest and return parsed data."""
        self.logger.info(f"Validating package manifest for {tab_path}")
        
        # Check root index.json
        root_index_path = os.path.join(tab_path, "index.json")
        if not os.path.exists(root_index_path):
            self.logger.error(f"Root index.json not found: {root_index_path}")
            return False, {}
            
        if not self.validate_json_schema(root_index_path, "root_index"):
            return False, {}
            
        try:
            with open(root_index_path, 'r') as f:
                root_manifest = json.load(f)
        except Exception as e:
            self.logger.error(f"Error reading root manifest: {str(e)}")
            return False, {}
        
        # Validate all files listed in manifest exist
        all_files = []
        
        def collect_files(files_section, base_path=""):
            if isinstance(files_section, dict):
                for key, value in files_section.items():
                    if isinstance(value, str):
                        all_files.append(os.path.join(tab_path, value.lstrip('/')))
                    elif isinstance(value, dict):
                        collect_files(value, base_path)
            elif isinstance(files_section, list):
                for item in files_section:
                    if isinstance(item, str):
                        all_files.append(os.path.join(tab_path, item.lstrip('/')))
        
        collect_files(root_manifest.get("files", {}))
        
        # Check file existence
        for file_path in all_files:
            if not os.path.exists(file_path):
                self.logger.error(f"Manifest file not found: {file_path}")
                return False, {}
        
        # Validate component manifests
        components = ["backend", "frontend"]
        component_manifests = {}
        
        for component in components:
            component_index = os.path.join(tab_path, component, "index.json")
            if os.path.exists(component_index):
                if not self.validate_json_schema(component_index, "component_index"):
                    return False, {}
                    
                try:
                    with open(component_index, 'r') as f:
                        component_manifests[component] = json.load(f)
                except Exception as e:
                    self.logger.error(f"Error reading {component} manifest: {str(e)}")
                    return False, {}
        
        # Validate version consistency
        root_version = root_manifest["version"]
        for component, manifest in component_manifests.items():
            if manifest["version"] != root_version:
                self.logger.error(f"Version mismatch: root={root_version}, {component}={manifest['version']}")
                return False, {}
        
        # Validate name consistency
        root_name = root_manifest["name"]
        for component, manifest in component_manifests.items():
            if manifest["name"] != root_name:
                self.logger.error(f"Name mismatch: root={root_name}, {component}={manifest['name']}")
                return False, {}
        
        # CRITICAL: Validate that directory contains ONLY files listed in manifest
        if not self.validate_complete_file_manifest(tab_path, all_files):
            return False, {}

        self.logger.info("Package manifest validation successful")
        return True, {
            "root": root_manifest,
            "components": component_manifests
        }
    
    def check_name_collision(self, tab_name: str, tablets_dir: str = "/var/www/homeserver/src/tablets") -> bool:
        """Check for premium tab name collisions."""
        self.logger.info(f"Checking for name collisions with '{tab_name}'")
        
        # Check existing premium tabs
        if os.path.exists(tablets_dir):
            existing_tabs = [d for d in os.listdir(tablets_dir) 
                           if os.path.isdir(os.path.join(tablets_dir, d))]
            
            if tab_name in existing_tabs:
                self.logger.error(f"Tab name collision detected: '{tab_name}' already exists")
                return False
        
        self.logger.info("No name collisions detected")
        return True
    
    def validate_complete_file_manifest(self, tab_path: str, manifest_files: List[str]) -> bool:
        """Validate that directory contains ONLY files listed in manifest (no extras).
        
        This is a critical security check to ensure no undeclared files exist
        that could bypass validation and pose security risks.
        
        Special handling for __pycache__ files which indicate an already installed tab.
        """
        self.logger.info(f"Validating complete file manifest for {tab_path}")
        
        # Helper: determine if a path is git-related and should be ignored for manifest strictness
        def _is_git_related(path: str) -> bool:
            try:
                p = os.path.abspath(path)
                parts = p.split(os.sep)
                # Ignore .git directory and its contents, and common git dotfiles
                git_dotfiles = {'.gitignore', '.gitattributes', '.gitmodules'}
                if any(part == '.git' or part.startswith('.git') for part in parts):
                    return True
                basename = os.path.basename(p)
                if basename in git_dotfiles:
                    return True
                return False
            except Exception:
                return False
        
        # Get all actual files in the directory
        actual_files = []
        pycache_files = []
        
        try:
            for root, dirs, files in os.walk(tab_path):
                # Skip hidden directories (starting with .)
                # Allow .git specifically to exist but do not traverse into it
                dirs[:] = [d for d in dirs if not d.startswith('.') or d == '.git']
                
                for file in files:
                    # Skip hidden files
                    if file.startswith('.'):
                        continue
                    
                    # Skip ONLY the root index.json, not all index.json files
                    file_path = os.path.join(root, file)
                    if file == "index.json" and root == tab_path:
                        continue  # Skip root index.json only
                    
                    # Separate __pycache__ files for special handling
                    if "__pycache__" in file_path:
                        pycache_files.append(file_path)
                    else:
                        actual_files.append(file_path)
        
        except Exception as e:
            self.logger.error(f"Error scanning directory {tab_path}: {str(e)}")
            return False
        
        # Check for __pycache__ files first - indicates already installed tab
        if pycache_files:
            tab_name = os.path.basename(tab_path)
            self.logger.error(f"TAB ALREADY INSTALLED: Premium tab '{tab_name}' is already installed")
            self.logger.error(f"Found {len(pycache_files)} __pycache__ files indicating active installation:")
            
            tab_path_abs = os.path.abspath(tab_path)
            for pycache_file in sorted(pycache_files):
                relative_path = os.path.relpath(pycache_file, tab_path_abs)
                self.logger.error(f"  - {relative_path}")
            
            self.logger.error(f"To reinstall this tab, first uninstall it using:")
            self.logger.error(f"  sudo python3 installer_refactored.py uninstall {tab_name}")
            return False
        
        # Normalize all paths to absolute paths for comparison
        tab_path_abs = os.path.abspath(tab_path)
        manifest_files_abs = set(os.path.abspath(f) for f in manifest_files)
        actual_files_abs = set(os.path.abspath(f) for f in actual_files)
        
        # Remove git-related entries from both sets to allow leniency for git metadata
        manifest_files_abs = {f for f in manifest_files_abs if not _is_git_related(f)}
        actual_files_abs = {f for f in actual_files_abs if not _is_git_related(f)}
        
        # Find extra files not in manifest
        extra_files = actual_files_abs - manifest_files_abs
        
        if extra_files:
            self.logger.error(f"SECURITY VIOLATION: Extra files found not declared in manifest:")
            for extra_file in sorted(extra_files):
                relative_path = os.path.relpath(extra_file, tab_path_abs)
                self.logger.error(f"  - {relative_path}")
            
            self.logger.error("All files in premium tab must be explicitly declared in root index.json")
            return False
        
        # Find missing files declared in manifest but not present
        missing_files = manifest_files_abs - actual_files_abs
        
        if missing_files:
            self.logger.error(f"Missing files declared in manifest but not found:")
            for missing_file in sorted(missing_files):
                relative_path = os.path.relpath(missing_file, tab_path_abs)
                self.logger.error(f"  - {missing_file}")
            return False
        
        # Additional security checks
        if not self.validate_file_security(actual_files):
            return False
        
        self.logger.info(f"Complete file manifest validation passed: {len(actual_files)} files verified")
        return True
    
    def validate_file_security(self, file_paths: List[str]) -> bool:
        """Perform additional security validation on files."""
        suspicious_extensions = {
            '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.vbe', 
            '.js', '.jse', '.wsf', '.wsh', '.msi', '.msp', '.hta', '.cpl',
            '.jar', '.app', '.deb', '.rpm', '.dmg', '.pkg', '.run'
        }
        
        dangerous_names = {
            'passwd', 'shadow', 'sudoers', 'hosts', 'crontab', 'authorized_keys',
            'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', '.ssh', '.gnupg'
        }
        
        for file_path in file_paths:
            filename = os.path.basename(file_path)
            file_ext = os.path.splitext(filename)[1].lower()
            
            # Check for suspicious extensions
            if file_ext in suspicious_extensions:
                self.logger.warning(f"Suspicious file extension detected: {file_path}")
                # Note: We warn but don't fail - some legitimate files might have these extensions
            
            # Check for dangerous filenames
            if filename.lower() in dangerous_names:
                self.logger.error(f"Dangerous filename detected: {file_path}")
                return False
            
            # Check for executable permissions on non-script files
            if os.path.exists(file_path):
                file_stat = os.stat(file_path)
                if file_stat.st_mode & 0o111:  # Has execute permission
                    if not file_ext in {'.py', '.sh', '.pl', '.rb'}:
                        self.logger.warning(f"Executable file with unusual extension: {file_path}")
        
        return True
    
    def validate_config_with_factory_fallback(self, config_path: Optional[str] = None, 
                                            factory_fallback_script: str = "/usr/local/sbin/factoryFallback.sh",
                                            homeserver_config_path: str = "/var/www/homeserver/src/config/homeserver.json") -> bool:
        """Validate configuration using factoryFallback.sh."""
        try:
            if config_path:
                # Temporarily move current config and test the new one
                temp_backup = f"{homeserver_config_path}.installer_temp"
                if os.path.exists(homeserver_config_path):
                    import shutil
                    shutil.copy2(homeserver_config_path, temp_backup)
                import shutil
                shutil.copy2(config_path, homeserver_config_path)
                
                try:
                    result = subprocess.run([factory_fallback_script], 
                                          capture_output=True, text=True, check=True)
                    valid = not result.stdout.strip().endswith('.factory')
                finally:
                    # Restore original config
                    if os.path.exists(temp_backup):
                        shutil.move(temp_backup, homeserver_config_path)
                    elif os.path.exists(homeserver_config_path):
                        os.remove(homeserver_config_path)
                
                return valid
            else:
                # Validate current config
                result = subprocess.run([factory_fallback_script], 
                                      capture_output=True, text=True, check=True)
                return not result.stdout.strip().endswith('.factory')
                
        except Exception as e:
            self.logger.error(f"Config validation failed: {str(e)}")
            return False
    
    def validate_requirements_file(self, requirements_file: str) -> Tuple[bool, List[str]]:
        """Validate Python requirements file format and return package list."""
        if not os.path.exists(requirements_file):
            return True, []  # No requirements is valid
        
        if os.path.getsize(requirements_file) == 0:
            return True, []  # Empty file is valid
        
        try:
            with open(requirements_file, 'r') as f:
                lines = f.readlines()
            
            packages = []
            for line_num, line in enumerate(lines, 1):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                # Basic validation of requirement format
                if not re.match(r'^[a-zA-Z0-9_-]+([<>=!]+[0-9.]+)?$', line):
                    self.logger.error(f"Invalid requirement format at line {line_num}: {line}")
                    return False, []
                
                # Extract package name
                package_name = re.split(r'[<>=!]', line)[0]
                packages.append(package_name)
            
            return True, packages
            
        except Exception as e:
            self.logger.error(f"Error validating requirements file: {str(e)}")
            return False, []
    
    def validate_package_patch(self, patch_file: str) -> Tuple[bool, Dict[str, Any]]:
        """Validate NPM package patch file."""
        if not os.path.exists(patch_file):
            return True, {}  # No patch is valid
        
        try:
            with open(patch_file, 'r') as f:
                patch_data = json.load(f)
            
            if not patch_data:  # Empty patch is valid
                return True, {}
            
            # Validate structure
            valid_sections = ["dependencies", "devDependencies", "peerDependencies"]
            for section in patch_data:
                if section not in valid_sections:
                    self.logger.error(f"Invalid package.json section: {section}")
                    return False, {}
                
                if not isinstance(patch_data[section], dict):
                    self.logger.error(f"Section {section} must be an object")
                    return False, {}
                
                # Validate package names and versions
                for name, version in patch_data[section].items():
                    if not re.match(r'^[a-zA-Z0-9@/_-]+$', name):
                        self.logger.error(f"Invalid package name: {name}")
                        return False, {}
                    
                    if not re.match(r'^[\^~]?\d+\.\d+\.\d+', version):
                        self.logger.error(f"Invalid version format for {name}: {version}")
                        return False, {}
            
            return True, patch_data
            
        except json.JSONDecodeError as e:
            self.logger.error(f"Invalid JSON in package patch: {str(e)}")
            return False, {}
        except Exception as e:
            self.logger.error(f"Error validating package patch: {str(e)}")
            return False, {}
    
    def validate_config_patch(self, patch_file: str) -> Tuple[bool, Dict[str, Any]]:
        """Validate configuration patch file."""
        if not os.path.exists(patch_file):
            return True, {}  # No patch is valid
        
        try:
            with open(patch_file, 'r') as f:
                patch_data = json.load(f)
            
            if not patch_data:  # Empty patch is valid
                return True, {}
            
            # Basic structure validation - config patches can be quite flexible
            # so we mainly check that it's valid JSON and doesn't contain dangerous keys
            
            dangerous_keys = ["__proto__", "constructor", "prototype"]
            
            def check_dangerous_keys(obj, path=""):
                if isinstance(obj, dict):
                    for key, value in obj.items():
                        if key in dangerous_keys:
                            self.logger.error(f"Dangerous key found in config patch: {path}.{key}")
                            return False
                        if not check_dangerous_keys(value, f"{path}.{key}" if path else key):
                            return False
                elif isinstance(obj, list):
                    for i, item in enumerate(obj):
                        if not check_dangerous_keys(item, f"{path}[{i}]"):
                            return False
                return True
            
            if not check_dangerous_keys(patch_data):
                return False, {}
            
            return True, patch_data
            
        except json.JSONDecodeError as e:
            self.logger.error(f"Invalid JSON in config patch: {str(e)}")
            return False, {}
        except Exception as e:
            self.logger.error(f"Error validating config patch: {str(e)}")
            return False, {}
    
    def validate_permissions_file(self, permissions_file: str) -> bool:
        """Validate sudoers permissions file."""
        if not os.path.exists(permissions_file):
            return True  # No permissions file is valid
        
        try:
            # Basic syntax check - look for common sudoers patterns
            with open(permissions_file, 'r') as f:
                content = f.read()
            
            # Check for basic sudoers syntax
            lines = content.strip().split('\n')
            for line_num, line in enumerate(lines, 1):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                # Basic sudoers line validation
                if not re.match(r'^[a-zA-Z0-9_%-]+\s+[A-Z_]+\s*=.*$', line):
                    self.logger.warning(f"Potentially invalid sudoers syntax at line {line_num}: {line}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error validating permissions file: {str(e)}")
            return False
    
    def validate_system_dependencies(self, dependencies_file: str) -> Tuple[bool, Dict[str, Any]]:
        """Validate system dependencies file and return parsed data.
        
        Note: System dependencies use minimum version requirements (>=) rather than exact
        version matching. This allows newer versions to satisfy dependencies, which is
        appropriate for system packages that are generally backward compatible and
        receive security updates.
        """
        self.logger.info(f"Validating system dependencies: {dependencies_file}")
        
        if not os.path.exists(dependencies_file):
            self.logger.info("No system dependencies file found")
            return True, {}  # No dependencies is valid
        
        # Validate JSON schema
        if not self.validate_json_schema(dependencies_file, "dependencies"):
            return False, {}
        
        try:
            with open(dependencies_file, 'r') as f:
                dependencies_data = json.load(f)
            
            self.logger.info("System dependencies validation successful")
            return True, dependencies_data
            
        except Exception as e:
            self.logger.error(f"Error reading system dependencies: {str(e)}")
            return False, {} 