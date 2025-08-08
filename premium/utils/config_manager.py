#!/usr/bin/env python3
"""
Configuration Management Utility for Premium Tab Installer

Handles configuration patches, validation, and service management.
Provides atomic configuration operations with rollback capabilities.
"""

import os
import json
import subprocess
import shutil
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime


class ConfigManager:
    """Manages configuration operations for premium tab installation."""
    
    def __init__(self, logger, 
                 homeserver_config_path: str = "/var/www/homeserver/src/config/homeserver.json",
                 factory_fallback_script: str = "/usr/local/sbin/factoryFallback.sh"):
        self.logger = logger
        self.homeserver_config_path = homeserver_config_path
        self.factory_fallback_script = factory_fallback_script
        self.config_backup: Optional[str] = None
    
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
    
    def create_backup(self, file_path: str) -> Optional[str]:
        """Create a backup of a file and return backup path."""
        if not os.path.exists(file_path):
            return None
            
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
            # Restore proper permissions after backup restoration
            self._restore_config_permissions(target_path)
            return True
        except Exception as e:
            self.logger.error(f"Failed to restore backup: {str(e)}")
            return False
    
    def _restore_config_permissions(self, config_path: Optional[str] = None) -> bool:
        """
        Restore proper permissions on config file after modification.
        
        CRITICAL: Premium installer runs as root but must restore www-data ownership
        to prevent permission denied errors on config update endpoints.
        """
        target_path = config_path or self.homeserver_config_path
        
        try:
            # Set ownership to www-data:www-data
            self._run_command(['chown', 'www-data:www-data', target_path])
            # Set permissions to 664 (rw-rw-r--)
            self._run_command(['chmod', '664', target_path])
            self.logger.debug(f"Restored config permissions: {target_path} -> www-data:www-data 664")
            return True
        except Exception as e:
            self.logger.error(f"Failed to restore config permissions for {target_path}: {str(e)}")
            return False
    
    def validate_config_with_factory_fallback(self, config_path: Optional[str] = None) -> bool:
        """Validate configuration using factoryFallback.sh."""
        try:
            if config_path:
                # Temporarily move current config and test the new one
                temp_backup = f"{self.homeserver_config_path}.installer_temp"
                if os.path.exists(self.homeserver_config_path):
                    shutil.copy2(self.homeserver_config_path, temp_backup)
                shutil.copy2(config_path, self.homeserver_config_path)
                
                try:
                    result = self._run_command([self.factory_fallback_script])
                    valid = not result.stdout.strip().endswith('.factory')
                finally:
                    # Restore original config
                    if os.path.exists(temp_backup):
                        shutil.move(temp_backup, self.homeserver_config_path)
                    elif os.path.exists(self.homeserver_config_path):
                        os.remove(self.homeserver_config_path)
                
                return valid
            else:
                # Validate current config
                result = self._run_command([self.factory_fallback_script])
                return not result.stdout.strip().endswith('.factory')
                
        except Exception as e:
            self.logger.error(f"Config validation failed: {str(e)}")
            return False
    
    def deep_merge(self, target: dict, source: dict) -> None:
        """Deep merge source dict into target dict."""
        for key, value in source.items():
            if key in target and isinstance(target[key], dict) and isinstance(value, dict):
                # Special handling for tabs object to preserve starred position
                if key == "tabs":
                    self.deep_merge_tabs(target[key], value)
                else:
                    self.deep_merge(target[key], value)
            else:
                target[key] = value
    
    def deep_merge_tabs(self, target_tabs: dict, source_tabs: dict) -> None:
        """Deep merge tabs while preserving 'starred' at the end."""
        # Extract starred value if it exists
        starred_value = target_tabs.pop("starred", None)
        
        # Perform normal deep merge
        for key, value in source_tabs.items():
            if key in target_tabs and isinstance(target_tabs[key], dict) and isinstance(value, dict):
                self.deep_merge(target_tabs[key], value)
            else:
                target_tabs[key] = value
        
        # Restore starred at the end if it existed
        if starred_value is not None:
            target_tabs["starred"] = starred_value
    
    def apply_config_patch(self, patch_file: str) -> bool:
        """Apply configuration patch."""
        if not os.path.exists(patch_file):
            self.logger.info("No config patch to apply")
            return True
        
        try:
            with open(patch_file, 'r') as f:
                patch_data = json.load(f)
            
            if not patch_data:  # Empty patch
                self.logger.info("Empty config patch, skipping")
                return True
            
            # Create backup
            self.config_backup = self.create_backup(self.homeserver_config_path)
            
            # Read current config
            with open(self.homeserver_config_path, 'r') as f:
                config_data = json.load(f)
            
            # Apply patch (deep merge)
            self.deep_merge(config_data, patch_data)
            
            # Write temporary config for validation
            temp_config = f"{self.homeserver_config_path}.temp"
            with open(temp_config, 'w') as f:
                json.dump(config_data, f, indent=2)
            
            # Validate with factoryFallback
            if not self.validate_config_with_factory_fallback(temp_config):
                os.remove(temp_config)
                self.logger.error("Config patch validation failed")
                return False
            
            # Apply the validated config
            shutil.move(temp_config, self.homeserver_config_path)
            
            # CRITICAL: Restore proper permissions after config modification
            if not self._restore_config_permissions():
                self.logger.error("Failed to restore config permissions after patch application")
                return False
            
            self.logger.info("Config patch applied successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to apply config patch: {str(e)}")
            return False
    
    def rollback_config(self) -> bool:
        """Rollback configuration changes."""
        if self.config_backup:
            success = self.restore_backup(self.config_backup, self.homeserver_config_path)
            if success:
                self.logger.info("Configuration rollback completed")
                self.config_backup = None
            return success
        return True
    
    def validate_config_syntax(self, config_path: Optional[str] = None) -> bool:
        """Validate configuration file JSON syntax."""
        target_path = config_path or self.homeserver_config_path
        
        try:
            with open(target_path, 'r') as f:
                json.load(f)
            return True
        except json.JSONDecodeError as e:
            self.logger.error(f"Invalid JSON syntax in {target_path}: {str(e)}")
            return False
        except Exception as e:
            self.logger.error(f"Error validating config syntax: {str(e)}")
            return False
    
    def get_config_value(self, key_path: str, default: Any = None) -> Any:
        """Get a value from the configuration using dot notation."""
        try:
            with open(self.homeserver_config_path, 'r') as f:
                config = json.load(f)
            
            keys = key_path.split('.')
            value = config
            
            for key in keys:
                if isinstance(value, dict) and key in value:
                    value = value[key]
                else:
                    return default
            
            return value
            
        except Exception as e:
            self.logger.error(f"Error getting config value for {key_path}: {str(e)}")
            return default
    
    def set_config_value(self, key_path: str, value: Any) -> bool:
        """Set a value in the configuration using dot notation."""
        try:
            # Create backup first
            if not self.config_backup:
                self.config_backup = self.create_backup(self.homeserver_config_path)
            
            with open(self.homeserver_config_path, 'r') as f:
                config = json.load(f)
            
            keys = key_path.split('.')
            current = config
            
            # Navigate to the parent of the target key
            for key in keys[:-1]:
                if key not in current:
                    current[key] = {}
                current = current[key]
            
            # Set the value
            current[keys[-1]] = value
            
            # Write the updated config
            with open(self.homeserver_config_path, 'w') as f:
                json.dump(config, f, indent=2)
            
            # CRITICAL: Restore proper permissions after config modification
            if not self._restore_config_permissions():
                self.logger.error("Failed to restore config permissions after setting value")
                return False
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error setting config value for {key_path}: {str(e)}")
            return False
    
    def revert_config_patch(self, patch_file: str) -> bool:
        """Revert a configuration patch by removing the keys it added."""
        if not os.path.exists(patch_file):
            self.logger.info("No config patch to revert")
            return True
        
        try:
            with open(patch_file, 'r') as f:
                patch_data = json.load(f)
            
            if not patch_data:  # Empty patch
                self.logger.info("Empty config patch, nothing to revert")
                return True
            
            # Create backup
            if not self.config_backup:
                self.config_backup = self.create_backup(self.homeserver_config_path)
            
            # Read current config
            with open(self.homeserver_config_path, 'r') as f:
                config_data = json.load(f)
            
            # Remove the keys that were added by the patch
            modified = self._remove_patch_keys(config_data, patch_data)
            
            if not modified:
                self.logger.info("No configuration changes to revert")
                return True
            
            # Write temporary config for validation
            temp_config = f"{self.homeserver_config_path}.temp"
            with open(temp_config, 'w') as f:
                json.dump(config_data, f, indent=2)
            
            # Validate with factoryFallback
            if not self.validate_config_with_factory_fallback(temp_config):
                os.remove(temp_config)
                self.logger.error("Config patch revert validation failed")
                return False
            
            # Apply the validated config
            shutil.move(temp_config, self.homeserver_config_path)
            
            # CRITICAL: Restore proper permissions after config modification
            if not self._restore_config_permissions():
                self.logger.error("Failed to restore config permissions after patch revert")
                return False
            
            self.logger.info("Config patch reverted successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to revert config patch: {str(e)}")
            return False
    
    def _remove_patch_keys(self, config: dict, patch: dict, path: str = "") -> bool:
        """Recursively remove keys from config that were added by patch."""
        modified = False
        
        for key, value in patch.items():
            current_path = f"{path}.{key}" if path else key
            
            if key in config:
                if isinstance(value, dict) and isinstance(config[key], dict):
                    # Special handling for tab sections - if we're removing a complete tab,
                    # remove the entire tab section regardless of minor differences
                    if path == "tabs" and self._is_complete_tab_removal(value):
                        del config[key]
                        modified = True
                        self.logger.debug(f"Removed complete tab section: {current_path}")
                        continue
                    
                    # Recursively remove nested keys
                    nested_modified = self._remove_patch_keys(config[key], value, current_path)
                    
                    # If the nested dict is now empty, remove it
                    if nested_modified and not config[key]:
                        del config[key]
                        modified = True
                        self.logger.debug(f"Removed empty config section: {current_path}")
                    elif nested_modified:
                        modified = True
                else:
                    # Remove the key if it matches the patch value
                    if config[key] == value:
                        del config[key]
                        modified = True
                        self.logger.debug(f"Removed config key: {current_path}")
                    else:
                        self.logger.warning(f"Config value mismatch for {current_path}, not removing")
        
        return modified
    
    def _is_complete_tab_removal(self, tab_config: dict) -> bool:
        """Check if this appears to be a complete tab configuration for removal."""
        # A complete tab typically has config, visibility, and data sections
        expected_sections = {"config", "visibility", "data"}
        provided_sections = set(tab_config.keys())
        
        # If the patch contains the main tab structure sections, treat it as a complete tab removal
        return bool(expected_sections.intersection(provided_sections))


class ServiceManager:
    """Manages system services for premium tab installation."""
    
    def __init__(self, logger):
        self.logger = logger
        self.service_states: Dict[str, str] = {}
    
    def _run_command(self, cmd: List[str], check: bool = True, capture_output: bool = True) -> subprocess.CompletedProcess:
        """Run a command with logging."""
        cmd_str = ' '.join(cmd)
        self.logger.debug(f"Running command: {cmd_str}")
        try:
            result = subprocess.run(cmd, check=check, capture_output=capture_output, text=True)
            if result.stdout:
                self.logger.debug(f"Command output: {result.stdout.strip()}")
            return result
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Command failed: {cmd_str}")
            self.logger.error(f"Error: {e.stderr if e.stderr else str(e)}")
            raise
    
    def get_service_status(self, service_name: str) -> str:
        """Get the status of a systemd service."""
        try:
            result = self._run_command(["systemctl", "is-active", service_name])
            return result.stdout.strip()
        except Exception:
            return "unknown"
    
    def restart_service(self, service_name: str) -> bool:
        """Restart a systemd service."""
        try:
            # Store current state for rollback
            self.service_states[service_name] = self.get_service_status(service_name)
            
            self.logger.info(f"Restarting {service_name} service")
            self._run_command(["systemctl", "restart", service_name])
            
            # Verify service is running
            status = self.get_service_status(service_name)
            if status != "active":
                self.logger.error(f"{service_name} service failed to start (status: {status})")
                return False
            
            self.logger.info(f"{service_name} service restarted successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to restart {service_name} service: {str(e)}")
            return False
    
    def stop_service(self, service_name: str) -> bool:
        """Stop a systemd service."""
        try:
            # Store current state for rollback
            self.service_states[service_name] = self.get_service_status(service_name)
            
            self.logger.info(f"Stopping {service_name} service")
            self._run_command(["systemctl", "stop", service_name])
            
            self.logger.info(f"{service_name} service stopped successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to stop {service_name} service: {str(e)}")
            return False
    
    def start_service(self, service_name: str) -> bool:
        """Start a systemd service."""
        try:
            self.logger.info(f"Starting {service_name} service")
            self._run_command(["systemctl", "start", service_name])
            
            # Verify service is running
            status = self.get_service_status(service_name)
            if status != "active":
                self.logger.error(f"{service_name} service failed to start (status: {status})")
                return False
            
            self.logger.info(f"{service_name} service started successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to start {service_name} service: {str(e)}")
            return False
    
    def reload_service(self, service_name: str) -> bool:
        """Reload a systemd service."""
        try:
            self.logger.info(f"Reloading {service_name} service")
            self._run_command(["systemctl", "reload", service_name])
            
            self.logger.info(f"{service_name} service reloaded successfully")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to reload {service_name} service: {str(e)}")
            return False
    
    def restart_homeserver_services(self) -> bool:
        """Restart all homeserver-related services."""
        services = ["gunicorn.service"]
        
        for service in services:
            if not self.restart_service(service):
                return False
        
        return True
    
    def rollback_service_states(self) -> None:
        """Rollback services to their previous states."""
        self.logger.info("Rolling back service states")
        
        for service_name, previous_state in self.service_states.items():
            try:
                current_state = self.get_service_status(service_name)
                
                if previous_state == "active" and current_state != "active":
                    self.start_service(service_name)
                elif previous_state != "active" and current_state == "active":
                    self.stop_service(service_name)
                    
            except Exception as e:
                self.logger.error(f"Error rolling back {service_name} service: {str(e)}")
        
        # Clear service states
        self.service_states.clear()


class BuildManager:
    """Manages frontend build operations.

    Adds a dedicated build log at /var/log/homeserver/premium_installation.log
    to capture all builder-related output (npm install/build, clean, etc.).
    """
    
    def __init__(self, logger, build_dir: str = "/var/www/homeserver",
                 build_log_path: str = "/var/log/homeserver/premium_installation.log"):
        self.logger = logger
        self.build_dir = build_dir
        self.build_log_path = build_log_path
        # Ensure log directory exists and touch the log file before any writes
        try:
            os.makedirs(os.path.dirname(self.build_log_path), exist_ok=True)
            with open(self.build_log_path, 'a'):
                pass
        except Exception as e:
            # Do not fail the installer if log file can't be created; just warn
            self.logger.warning(f"Unable to initialize build log '{self.build_log_path}': {str(e)}")
    
    def _append_to_build_log(self, content: str) -> None:
        """Append text to the dedicated build log, prefixing with a timestamp."""
        try:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            with open(self.build_log_path, 'a', encoding='utf-8') as f:
                f.write(f"[{timestamp}] {content}\n")
        except Exception as e:
            # Non-fatal; emit to main logger
            self.logger.warning(f"Failed writing to build log '{self.build_log_path}': {str(e)}")
    
    def _run_command(self, cmd: List[str], check: bool = True, capture_output: bool = True, cwd: str = None) -> subprocess.CompletedProcess:
        """Run a command with logging and append all output to the build log."""
        cmd_str = ' '.join(cmd)
        run_dir = cwd if cwd else os.getcwd()
        if cwd:
            self.logger.debug(f"Running command in {cwd}: {cmd_str}")
        else:
            self.logger.debug(f"Running command: {cmd_str}")
        # Emit command line to build log first
        self._append_to_build_log(f"$ (cwd={run_dir}) {cmd_str}")
        try:
            result = subprocess.run(cmd, check=check, capture_output=capture_output, text=True, cwd=cwd)
            if result.stdout:
                self.logger.debug(f"Command output: {result.stdout.strip()}")
            # Append captured output to build log
            stdout_txt = (result.stdout or '').rstrip()
            stderr_txt = (result.stderr or '').rstrip()
            if stdout_txt:
                self._append_to_build_log(stdout_txt)
            if stderr_txt:
                self._append_to_build_log(f"[stderr] {stderr_txt}")
            return result
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Command failed: {cmd_str}")
            self.logger.error(f"Error: {e.stderr if e.stderr else str(e)}")
            # Append failure details to build log as well
            if getattr(e, 'stdout', None):
                self._append_to_build_log((e.stdout or '').rstrip())
            if getattr(e, 'stderr', None):
                self._append_to_build_log(f"[stderr] {(e.stderr or '').rstrip()}")
            raise
    
    def rebuild_frontend(self) -> bool:
        """Rebuild the frontend."""
        try:
            self.logger.info("Building frontend")
            self._append_to_build_log("=== Frontend build start ===")
            result = self._run_command(["npm", "run", "build"], cwd=self.build_dir)
            self.logger.info("Frontend build completed")
            self._append_to_build_log("=== Frontend build completed successfully ===")
            return True
        except subprocess.CalledProcessError as e:
            self.logger.error(f"Frontend build failed with exit code {e.returncode}")
            if e.stdout:
                self.logger.error(f"Build stdout: {e.stdout}")
            if e.stderr:
                self.logger.error(f"Build stderr: {e.stderr}")
            self._append_to_build_log(f"=== Frontend build failed (exit={e.returncode}) ===")
            return False
        except Exception as e:
            self.logger.error(f"Frontend build failed: {str(e)}")
            self._append_to_build_log(f"=== Frontend build failed: {str(e)} ===")
            return False
    
    def install_npm_dependencies(self) -> bool:
        """Install NPM dependencies."""
        try:
            self.logger.info("Installing NPM dependencies")
            self._append_to_build_log("=== NPM install start ===")
            self._run_command(["npm", "install"], cwd=self.build_dir)
            self.logger.info("NPM dependencies installed")
            self._append_to_build_log("=== NPM install completed successfully ===")
            return True
        except Exception as e:
            self.logger.error(f"Failed to install NPM dependencies: {str(e)}")
            self._append_to_build_log(f"=== NPM install failed: {str(e)} ===")
            return False
    
    def clean_build(self) -> bool:
        """Clean build artifacts."""
        try:
            self.logger.info("Cleaning build artifacts")
            build_path = os.path.join(self.build_dir, "build")
            if os.path.exists(build_path):
                self._append_to_build_log(f"Removing build directory: {build_path}")
                shutil.rmtree(build_path)
            self.logger.info("Build artifacts cleaned")
            self._append_to_build_log("Build artifacts cleaned")
            return True
        except Exception as e:
            self.logger.error(f"Failed to clean build artifacts: {str(e)}")
            self._append_to_build_log(f"Failed to clean build artifacts: {str(e)}")
            return False 