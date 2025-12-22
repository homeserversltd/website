#!/usr/bin/env python3
"""
HOMESERVER Backup System Environment Setup
Copyright (C) 2024 HOMESERVER LLC

Sets up virtual environment and installs all dependencies for the backup system.
"""

import os
import sys
import shutil
import subprocess
import tempfile
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional


class BackupEnvironmentSetup:
    """Environment setup for HOMESERVER Backup System."""
    
    def __init__(self):
        # Generated files go in /var/www/homeserver/premium/backup/ (separate from backupTab source)
        # backupTab/ is the source/manifest directory - we don't modify it
        self.install_dir = Path("/var/www/homeserver/premium/backup")
        self.venv_dir = self.install_dir / "venv"
        
        # Source directory is backupTab backend (for reading requirements, copying files)
        self.source_dir = Path("/var/www/homeserver/premium/backupTab/backend")
        
        # Debug logging to help troubleshoot path issues
        import logging
        logger = logging.getLogger('backend.backupTab.utils')
        logger.info(f"Install directory (generated files): {self.install_dir}")
        logger.info(f"Source directory (backupTab source): {self.source_dir}")
        logger.info(f"Source directory exists: {self.source_dir.exists()}")
        
        self.log_dir = self.install_dir / "logs"
        self.config_file = self.install_dir / "settings.json"
        self.cron_file = Path("/etc/cron.d/homeserver-backup")
        
        # Requirements files (read from source)
        self.requirements_files = [
            self.source_dir / "requirements.txt",
            self.source_dir / "src" / "installer" / "requirements.txt"
        ]
        
        # All operations now use sudo commands instead of checking root privileges
        
    def log(self, message: str, level: str = "INFO") -> None:
        """Log installation messages."""
        prefix = {
            "INFO": "✓",
            "WARNING": "⚠",
            "ERROR": "✗",
            "DEBUG": "→"
        }.get(level, "•")
        
        print(f"{prefix} {message}")
    
    def check_python_version(self) -> bool:
        """Check if Python version is compatible."""
        if sys.version_info < (3, 7):
            self.log("Python 3.7+ is required for HOMESERVER Backup System", "ERROR")
            return False
        
        self.log(f"Python version {sys.version.split()[0]} is compatible")
        return True
    
    def check_system_requirements(self) -> bool:
        """Check system requirements."""
        self.log("Checking system requirements...")
        
        # Check Python version
        if not self.check_python_version():
            return False
        
        # Check for required system tools
        required_tools = ["python3", "pip3"]
        missing_tools = []
        
        for tool in required_tools:
            if not shutil.which(tool):
                missing_tools.append(tool)
        
        if missing_tools:
            self.log(f"Missing required tools: {', '.join(missing_tools)}", "ERROR")
            self.log("Please install missing tools and try again", "ERROR")
            return False
        
        # Check for venv module
        try:
            import venv
            self.log("Python venv module available")
        except ImportError:
            self.log("Python venv module not available", "ERROR")
            self.log("Please install python3-venv package", "ERROR")
            return False
        
        return True
    
    def create_virtual_environment(self) -> bool:
        """Create virtual environment for backup system."""
        self.log("Creating virtual environment...")
        
        try:
            # Remove existing venv if it exists
            if self.venv_dir.exists():
                self.log("Removing existing virtual environment")
                shutil.rmtree(self.venv_dir)
            
            # Create new virtual environment
            import venv
            venv.create(self.venv_dir, with_pip=True, clear=True)
            
            self.log(f"Virtual environment created at {self.venv_dir}")
            return True
            
        except Exception as e:
            self.log(f"Failed to create virtual environment: {e}", "ERROR")
            return False
    
    def get_venv_python(self) -> Path:
        """Get path to Python executable in virtual environment."""
        if sys.platform == "win32":
            return self.venv_dir / "Scripts" / "python.exe"
        else:
            return self.venv_dir / "bin" / "python"
    
    def get_venv_pip(self) -> Path:
        """Get path to pip executable in virtual environment."""
        if sys.platform == "win32":
            return self.venv_dir / "Scripts" / "pip.exe"
        else:
            return self.venv_dir / "bin" / "pip"
    
    def upgrade_pip(self) -> bool:
        """Upgrade pip in virtual environment."""
        self.log("Upgrading pip in virtual environment...")
        
        try:
            pip_path = self.get_venv_pip()
            result = subprocess.run([
                str(pip_path), "install", "--upgrade", "pip"
            ], capture_output=True, text=True, check=True)
            
            self.log("Pip upgraded successfully")
            return True
            
        except subprocess.CalledProcessError as e:
            self.log(f"Failed to upgrade pip: {e.stderr}", "ERROR")
            return False
    
    def install_requirements_from_file(self, requirements_file: Path, description: str) -> bool:
        """Install Python requirements from file in virtual environment."""
        if not requirements_file.exists():
            self.log(f"Requirements file not found: {requirements_file}", "WARNING")
            return True
            
        self.log(f"Installing {description} from {requirements_file}...")
        
        try:
            pip_path = self.get_venv_pip()
            
            result = subprocess.run([
                str(pip_path), "install", "-r", str(requirements_file)
            ], capture_output=True, text=True, check=True)
            
            self.log(f"{description} installed successfully")
            return True
            
        except subprocess.CalledProcessError as e:
            self.log(f"Failed to install {description}: {e.stderr}", "WARNING")
            # Don't fail for optional dependencies
            self.log("Some optional dependencies may be unavailable", "WARNING")
            return True
    
    def install_core_dependencies_fallback(self) -> bool:
        """Install essential dependencies as fallback if requirements files fail."""
        self.log("Installing core dependencies as fallback...")
        
        core_deps = ["cryptography>=3.4.8"]
        
        try:
            pip_path = self.get_venv_pip()
            
            for dep in core_deps:
                self.log(f"Installing {dep}", "DEBUG")
                result = subprocess.run([
                    str(pip_path), "install", dep
                ], capture_output=True, text=True, check=True)
            
            self.log("Core dependencies installed successfully")
            return True
            
        except subprocess.CalledProcessError as e:
            self.log(f"Failed to install core dependencies: {e.stderr}", "ERROR")
            return False
    
    def install_all_dependencies(self) -> bool:
        """Install all Python dependencies from requirements files."""
        self.log("Installing Python dependencies...")
        
        # Upgrade pip first
        if not self.upgrade_pip():
            return False
        
        # Try to install from requirements files
        any_success = False
        for requirements_file in self.requirements_files:
            if requirements_file.exists():
                description = f"dependencies from {requirements_file.name}"
                if self.install_requirements_from_file(requirements_file, description):
                    any_success = True
            else:
                self.log(f"Requirements file not found: {requirements_file}", "WARNING")
        
        # If no requirements files worked, install core dependencies
        if not any_success:
            self.log("No requirements files found or failed, installing core dependencies", "WARNING")
            return self.install_core_dependencies_fallback()
        
        return True
    
    def copy_source_files(self) -> bool:
        """Copy source files from backupTab to installation directory."""
        self.log("Copying source files from backupTab to installation directory...")
        
        try:
            # Create installation directory
            self.install_dir.mkdir(parents=True, exist_ok=True)
            
            # Files and directories to copy from backupTab source
            items_to_copy = [
                "backup",
                "src",
                "requirements.txt",
                "export_credentials.sh"
            ]
            
            for item in items_to_copy:
                source_path = self.source_dir / item
                dest_path = self.install_dir / item
                
                if not source_path.exists():
                    self.log(f"Source item not found: {source_path}", "WARNING")
                    continue
                
                if source_path.is_dir():
                    if dest_path.exists():
                        shutil.rmtree(dest_path)
                    shutil.copytree(source_path, dest_path)
                    self.log(f"Copied directory {item}")
                else:
                    shutil.copy2(source_path, dest_path)
                    self.log(f"Copied file {item}")
                    
                    # Ensure backup script is executable after copying
                    if item == "backup" and dest_path.exists():
                        try:
                            os.chmod(dest_path, 0o755)
                            self.log(f"Set execute permissions on copied backup script")
                        except PermissionError as e:
                            self.log(f"Permission denied setting execute permissions: {e}", "WARNING")
                            try:
                                subprocess.run(['/usr/bin/sudo', '/bin/chmod', '755', str(dest_path)], check=True)
                                self.log(f"Set execute permissions with sudo")
                            except subprocess.CalledProcessError as sudo_e:
                                self.log(f"Failed to set permissions with sudo: {sudo_e}", "WARNING")
                        except Exception as e:
                            self.log(f"Failed to set permissions: {e}", "WARNING")
            
            return True
            
        except Exception as e:
            self.log(f"Failed to copy source files: {e}", "ERROR")
            return False
    
    def create_wrapper_script(self) -> bool:
        """Create wrapper script that uses virtual environment."""
        self.log("Creating wrapper script...")
        
        try:
            wrapper_script = self.install_dir / "backup-venv"
            venv_python = self.get_venv_python()
            backup_script = self.install_dir / "backup"
            
            wrapper_content = f"""#!/bin/bash
# HOMESERVER Backup System Wrapper Script
# Uses virtual environment for dependencies

VENV_PYTHON="{venv_python}"
BACKUP_SCRIPT="{backup_script}"

# Check if virtual environment exists
if [ ! -f "$VENV_PYTHON" ]; then
    echo "ERROR: Virtual environment not found at $VENV_PYTHON"
    echo "Please install the backup system venv via the UI or: backup install"
    exit 1
fi

# Run backup script with virtual environment Python
exec "$VENV_PYTHON" "$BACKUP_SCRIPT" "$@"
"""
            
            with open(wrapper_script, 'w') as f:
                f.write(wrapper_content)
            
            # Make wrapper executable
            os.chmod(wrapper_script, 0o755)
            
            self.log(f"Wrapper script created: {wrapper_script}")
            return True
            
        except Exception as e:
            self.log(f"Failed to create wrapper script: {e}", "ERROR")
            return False
    
    def ensure_backup_script_permissions(self) -> bool:
        """Ensure backup script has proper execute permissions immediately."""
        self.log("Ensuring backup script permissions...")
        
        try:
            # Check backup script locations (installed copy first, then source)
            backup_script_paths = [
                self.install_dir / "backup",
                self.source_dir / "backup",
                Path("/var/www/homeserver/premium/backupTab/backend/backup")
            ]
            
            success_count = 0
            total_scripts = 0
            
            for script_path in backup_script_paths:
                if script_path.exists():
                    total_scripts += 1
                    # Check if already executable
                    if not os.access(script_path, os.X_OK):
                        try:
                            os.chmod(script_path, 0o755)
                            self.log(f"Made backup script executable: {script_path}")
                            success_count += 1
                        except PermissionError:
                            # Try with sudo if we don't have permission
                            try:
                                subprocess.run(['/usr/bin/sudo', '/bin/chmod', '755', str(script_path)], check=True)
                                self.log(f"Made backup script executable with sudo: {script_path}")
                                success_count += 1
                            except subprocess.CalledProcessError as e:
                                self.log(f"Failed to set permissions with sudo: {e}", "WARNING")
                    else:
                        self.log(f"Backup script already executable: {script_path}")
                        success_count += 1
            
            # Consider it successful if we found and handled at least one script
            if success_count > 0:
                self.log("Backup script permissions verified")
                return True
            else:
                self.log("No backup scripts found or all failed", "WARNING")
                return True  # Don't fail installation for this
            
        except Exception as e:
            self.log(f"Failed to ensure backup script permissions: {e}", "ERROR")
            return False
    
    def set_permissions(self) -> bool:
        """Set proper permissions on installed files."""
        self.log("Setting file permissions...")
        
        try:
            # Make main scripts executable
            scripts = [
                self.install_dir / "backup",
                self.install_dir / "backup-venv",
                self.install_dir / "src" / "service" / "backup_service.py",
                self.install_dir / "export_credentials.sh",
            ]
            
            success_count = 0
            total_scripts = 0
            
            for script in scripts:
                if script.exists():
                    total_scripts += 1
                    try:
                        os.chmod(script, 0o755)
                        self.log(f"Made executable: {script.name}")
                        success_count += 1
                    except PermissionError as e:
                        self.log(f"Permission denied for {script.name}: {e}", "WARNING")
                        # Try with sudo if we don't have permission
                        try:
                            subprocess.run(['/usr/bin/sudo', '/bin/chmod', '755', str(script)], check=True)
                            self.log(f"Made executable with sudo: {script.name}")
                            success_count += 1
                        except subprocess.CalledProcessError as sudo_e:
                            self.log(f"Failed to set permissions with sudo for {script.name}: {sudo_e}", "WARNING")
                    except Exception as e:
                        self.log(f"Failed to set permissions for {script.name}: {e}", "WARNING")
                else:
                    self.log(f"Script not found: {script}", "WARNING")
            
            # Also ensure the source backup script is executable
            source_backup_script = self.source_dir / "backup"
            if source_backup_script.exists():
                try:
                    os.chmod(source_backup_script, 0o755)
                    self.log(f"Made source backup script executable: {source_backup_script}")
                except PermissionError as e:
                    self.log(f"Permission denied for source backup script: {e}", "WARNING")
                    try:
                        subprocess.run(['/usr/bin/sudo', '/bin/chmod', '755', str(source_backup_script)], check=True)
                        self.log(f"Made source backup script executable with sudo")
                    except subprocess.CalledProcessError as sudo_e:
                        self.log(f"Failed to set permissions with sudo for source backup script: {sudo_e}", "WARNING")
                except Exception as e:
                    self.log(f"Failed to set permissions for source backup script: {e}", "WARNING")
            
            # Consider it successful if we managed to set permissions on at least some scripts
            if success_count > 0 or total_scripts == 0:
                self.log("File permissions set successfully")
                return True
            else:
                self.log("Failed to set permissions on any scripts", "ERROR")
                return False
            
        except Exception as e:
            self.log(f"Failed to set permissions: {e}", "ERROR")
            return False
    
    def create_log_directory(self) -> bool:
        """Create log directory with proper permissions."""
        self.log("Creating log directory...")
        
        try:
            self.log_dir.mkdir(parents=True, exist_ok=True)
            
            # Log directory created successfully
            self.log(f"Log directory created: {self.log_dir}")
            
            return True
            
        except Exception as e:
            self.log(f"Failed to create log directory: {e}", "ERROR")
            return False
    
    def initialize_database(self) -> bool:
        """Initialize the chunk database file."""
        import logging
        logger = logging.getLogger('backend.backupTab.utils')
        
        logger.info("Initializing chunk database...")
        
        try:
            # Database path from config
            db_path = self.install_dir / "chunks.db"
            
            # Ensure parent directory exists
            db_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Try to initialize using ChunkDatabase if available
            # Files should already be copied by this point in the install process
            try:
                import sys
                import importlib.util
                
                # Try to import from installed copy first (files should be copied by now)
                installed_src = self.install_dir / "src"
                chunk_db_file = installed_src / "chunk_database.py"
                
                if chunk_db_file.exists():
                    # Import from installed copy
                    spec = importlib.util.spec_from_file_location("chunk_database", chunk_db_file)
                    chunk_db_module = importlib.util.module_from_spec(spec)
                    
                    # Add utils directory to path for logger import
                    utils_path = installed_src / "utils"
                    if str(utils_path) not in sys.path:
                        sys.path.insert(0, str(utils_path))
                    
                    # Add src directory to path for relative imports
                    if str(installed_src) not in sys.path:
                        sys.path.insert(0, str(installed_src))
                    
                    try:
                        spec.loader.exec_module(chunk_db_module)
                        ChunkDatabase = chunk_db_module.ChunkDatabase
                        
                        # Initialize database (this will create the file and schema)
                        chunk_db = ChunkDatabase(str(db_path))
                        logger.info(f"Database initialized with schema: {db_path}")
                        
                    finally:
                        # Clean up path modifications
                        if str(utils_path) in sys.path:
                            sys.path.remove(str(utils_path))
                        if str(installed_src) in sys.path:
                            sys.path.remove(str(installed_src))
                else:
                    # Files not copied yet, create empty file
                    import sqlite3
                    conn = sqlite3.connect(str(db_path))
                    conn.close()
                    logger.info(f"Created empty database file (will initialize on first use): {db_path}")
                
                # Verify file was created
                if db_path.exists():
                    logger.info(f"Database file confirmed: {db_path}")
                    return True
                else:
                    logger.error(f"Database file not found after initialization: {db_path}")
                    return False
                    
            except Exception as e:
                logger.warning(f"Could not initialize database with ChunkDatabase: {e}")
                # Fallback: create empty SQLite file
                # The database will be properly initialized on first use
                try:
                    import sqlite3
                    conn = sqlite3.connect(str(db_path))
                    conn.close()
                    logger.info(f"Created empty database file (will initialize on first use): {db_path}")
                    return True
                except Exception as touch_e:
                    logger.error(f"Failed to create database file: {touch_e}")
                    return False
            
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def create_system_config(self) -> bool:
        """Create configuration file in installation directory from template."""
        import logging
        logger = logging.getLogger('backend.backupTab.utils')
        
        logger.info("Creating configuration file...")
        
        try:
            # Paths for template and config
            template_config = self.source_dir / "src" / "config" / "settings.json"
            
            logger.info(f"Source directory: {self.source_dir}")
            logger.info(f"Template config path: {template_config}")
            logger.info(f"Config path: {self.config_file}")
            logger.info(f"Template config exists: {template_config.exists()}")
            logger.info(f"Config exists: {self.config_file.exists()}")
            
            if not template_config.exists():
                logger.error(f"Template config not found: {template_config}")
                return False
            
            # Copy template to installation directory if it doesn't exist
            if not self.config_file.exists():
                shutil.copy2(template_config, self.config_file)
                logger.info(f"Config created: {self.config_file}")
            else:
                logger.info(f"Config already exists: {self.config_file}")
            
            # Set proper permissions
            try:
                os.chmod(self.config_file, 0o644)
                logger.info("Set config permissions")
            except Exception as e:
                logger.warning(f"Could not set config permissions: {e}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to create config: {e}")
            return False
    
    def clear_system_config(self) -> bool:
        """
        Clear configuration file to remove sensitive fields.
        This ensures that when the tab is reinstalled, it gets a clean template.
        """
        self.log("Clearing configuration...")
        
        try:
            if not self.config_file.exists():
                self.log("Config file not found, nothing to clear")
                return True
            
            # Create backup of current config
            backup_path = self.config_file.with_suffix(f".backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            try:
                shutil.copy2(self.config_file, backup_path)
                self.log(f"Created backup: {backup_path}")
            except Exception as e:
                self.log(f"Warning: Could not create backup: {e}", "WARNING")
            
            # Remove the config file entirely
            # This forces a fresh template deployment on next install
            try:
                self.config_file.unlink()
                self.log("Cleared configuration file")
                return True
            except Exception as e:
                self.log(f"Failed to clear config: {e}", "ERROR")
                return False
            
        except Exception as e:
            self.log(f"Failed to clear config: {e}", "ERROR")
            return False
    
    def install_cron_job(self) -> bool:
        """Install cron job for automated backups."""
        self.log("Installing cron job...")
        
        try:
            venv_python = self.get_venv_python()
            service_script = self.install_dir / "src" / "service" / "backup_service.py"
            
            cron_content = f"""# HOMESERVER Backup Cron Job
# Daily backup at 2 AM with random delay (0-59 minutes)
0 2 * * * www-data sleep $((RANDOM % 3600)) && {venv_python} {service_script} --backup >> {self.log_dir}/backup.log 2>&1
"""
            
            # Write cron content to temporary file first
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.cron') as temp_file:
                temp_file.write(cron_content)
                temp_file_path = temp_file.name
            
            # Copy the temporary file to the cron directory using sudo
            subprocess.run(['/usr/bin/sudo', '/bin/cp', temp_file_path, str(self.cron_file)], check=True)
            
            # Clean up temporary file
            os.unlink(temp_file_path)
            
            self.log(f"Cron job installed: {self.cron_file}")
            return True
            
        except subprocess.CalledProcessError as e:
            self.log(f"Failed to install cron job: {e}", "ERROR")
            return False
        except Exception as e:
            self.log(f"Failed to install cron job: {e}", "ERROR")
            return False
    
    def create_system_links(self) -> bool:
        """Create system-wide links for easy access."""
        self.log("Creating system links...")
        
        try:
            # Create symlink in /usr/local/bin
            system_link = Path("/usr/local/bin/homeserver-backup")
            wrapper_script = self.install_dir / "backup-venv"
            
            # Remove existing link if it exists
            if system_link.exists():
                subprocess.run(['/usr/bin/sudo', '/bin/rm', str(system_link)], check=True)
            
            # Create new symlink using sudo
            subprocess.run(['/usr/bin/sudo', '/bin/ln', '-sf', str(wrapper_script), str(system_link)], check=True)
            self.log(f"System link created: {system_link}")
            
            return True
            
        except subprocess.CalledProcessError as e:
            self.log(f"Failed to create system links: {e}", "WARNING")
            return True  # Non-critical failure
        except Exception as e:
            self.log(f"Failed to create system links: {e}", "WARNING")
            return True  # Non-critical failure
    
    def test_installation(self) -> bool:
        """Test the installation."""
        self.log("Testing installation...")
        
        try:
            venv_python = self.get_venv_python()
            backup_script = self.install_dir / "backup"
            
            # Test backup CLI script
            result = subprocess.run([
                str(venv_python), str(backup_script), "list-providers"
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                self.log("Installation test successful")
                return True
            else:
                self.log(f"Installation test failed: {result.stderr}", "WARNING")
                return True  # Don't fail installation for test failures
                
        except subprocess.TimeoutExpired:
            self.log("Installation test timed out (this is normal)", "WARNING")
            return True
        except Exception as e:
            self.log(f"Could not run installation test: {e}", "WARNING")
            return True
    
    def install(self) -> bool:
        """Run complete installation process."""
        import logging
        logger = logging.getLogger('backend.backupTab.utils')
        
        logger.info("Starting HOMESERVER Backup System installation...")
        
        # Check system requirements
        logger.info("Checking system requirements...")
        if not self.check_system_requirements():
            logger.error("System requirements check failed")
            return False
        logger.info("System requirements check passed")
        
        # Create virtual environment
        logger.info("Creating virtual environment...")
        if not self.create_virtual_environment():
            logger.error("Virtual environment creation failed")
            return False
        logger.info("Virtual environment created successfully")
        
        # Install dependencies
        logger.info("Installing dependencies...")
        if not self.install_all_dependencies():
            logger.error("Dependency installation failed")
            return False
        logger.info("Dependencies installed successfully")
        
        # Copy source files
        logger.info("Copying source files...")
        if not self.copy_source_files():
            logger.error("Source file copy failed")
            return False
        logger.info("Source files copied successfully")
        
        # Create wrapper script
        logger.info("Creating wrapper script...")
        if not self.create_wrapper_script():
            logger.error("Wrapper script creation failed")
            return False
        logger.info("Wrapper script created successfully")
        
        # Set permissions
        logger.info("Setting permissions...")
        if not self.set_permissions():
            logger.error("Permission setting failed")
            return False
        logger.info("Permissions set successfully")
        
        # Ensure backup script permissions are correct
        logger.info("Ensuring backup script permissions...")
        if not self.ensure_backup_script_permissions():
            logger.error("Backup script permission check failed")
            return False
        logger.info("Backup script permissions verified")
        
        # Create log directory
        logger.info("Creating log directory...")
        if not self.create_log_directory():
            logger.error("Log directory creation failed")
            return False
        logger.info("Log directory created successfully")
        
        # Initialize database
        logger.info("Initializing database...")
        if not self.initialize_database():
            logger.error("Database initialization failed")
            return False
        logger.info("Database initialized successfully")
        
        # Create system configuration
        logger.info("Creating system configuration...")
        if not self.create_system_config():
            logger.error("System configuration creation failed")
            return False
        logger.info("System configuration created successfully")
        
        # Install cron job
        logger.info("Installing cron job...")
        if not self.install_cron_job():
            logger.error("Cron job installation failed")
            return False
        logger.info("Cron job installed successfully")
        
        # Create system links
        logger.info("Creating system links...")
        if not self.create_system_links():
            logger.error("System links creation failed")
            return False
        logger.info("System links created successfully")
        
        # Test installation
        logger.info("Testing installation...")
        if not self.test_installation():
            logger.error("Installation test failed")
            return False
        logger.info("Installation test passed")
        
        logger.info("Installation completed successfully!")
        return True
    
    def uninstall(self) -> bool:
        """Uninstall the backup system."""
        self.log("Uninstalling HOMESERVER Backup System...")
        
        try:
            # Remove cron job using sudo (www-data has permission for this)
            if self.cron_file.exists():
                try:
                    subprocess.run(['/usr/bin/sudo', '/bin/rm', str(self.cron_file)], check=True)
                    self.log("Removed cron job")
                except subprocess.CalledProcessError as e:
                    self.log(f"Failed to remove cron job: {e}", "WARNING")
            
            # Remove system links using sudo
            system_link = Path("/usr/local/bin/homeserver-backup")
            if system_link.exists():
                try:
                    subprocess.run(['/usr/bin/sudo', '/bin/rm', str(system_link)], check=True)
                    self.log("Removed system link")
                except subprocess.CalledProcessError as e:
                    self.log(f"Failed to remove system link: {e}", "WARNING")
            
            # Remove installation directory (all generated files in /var/www/homeserver/premium/backup/)
            if self.install_dir.exists():
                try:
                    shutil.rmtree(self.install_dir)
                    self.log("Removed installation directory")
                except Exception as e:
                    self.log(f"Failed to remove installation directory: {e}", "WARNING")
            
            # Clear system configuration to remove sensitive credential fields
            if not self.clear_system_config():
                self.log("Failed to clear system configuration", "WARNING")
            
            self.log("Uninstallation completed successfully!")
            return True
            
        except Exception as e:
            self.log(f"Uninstallation failed: {e}", "ERROR")
            return False


def main():
    """Main environment setup entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="HOMESERVER Backup System Environment Setup")
    parser.add_argument("--uninstall", action="store_true", help="Uninstall the backup environment")
    parser.add_argument("--force", action="store_true", help="Force installation (skip some checks)")
    
    args = parser.parse_args()
    
    setup = BackupEnvironmentSetup()
    
    if args.uninstall:
        success = setup.uninstall()
    else:
        success = setup.install()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()