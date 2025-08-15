#!/usr/bin/env python3
"""
File Operations Utility for Premium Tab Installer

Handles all file system operations including symlinks, copies, appends, and backups.
Provides atomic operations with rollback capabilities.
"""

import os
import shutil
import hashlib
import pwd
import grp
import subprocess
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass
from datetime import datetime
import re


@dataclass
class FileOperation:
    """Represents a file operation to be performed during installation."""
    source: str
    target: str
    operation_type: str  # symlink, append, copy, other
    identifier: Optional[str] = None
    marker: Optional[str] = None
    description: str = ""
    backup_path: Optional[str] = None


class FileOperationsManager:
    """Manages file operations with backup and rollback capabilities."""
    
    # Append markers configuration
    APPEND_MARKERS = {
        "PREMIUM TAB BLUEPRINTS": {
            "start": "# === PREMIUM TAB BLUEPRINTS START ===",
            "end": "# === PREMIUM TAB BLUEPRINTS END ===",
            "description": "Premium tab blueprints are dynamically injected here during installation"
        }
    }
    
    def __init__(self, logger):
        self.logger = logger
        self.operations_history: List[FileOperation] = []
        self.created_directories: List[str] = []
    
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
            return True
        except Exception as e:
            self.logger.error(f"Failed to restore backup: {str(e)}")
            return False
    
    def create_directory_structure(self, target_path: str) -> bool:
        """Create directory structure for target path and track created directories."""
        target_dir = os.path.dirname(target_path)
        
        if os.path.exists(target_dir):
            return True
        
        try:
            # Find which directories need to be created
            path_parts = []
            current_path = target_dir
            
            while current_path and not os.path.exists(current_path):
                path_parts.append(current_path)
                current_path = os.path.dirname(current_path)
            
            # Create directories from parent to child
            for dir_path in reversed(path_parts):
                os.makedirs(dir_path, exist_ok=True)
                self.set_permissions(dir_path, "www-data", "www-data", "775")
                self.created_directories.append(dir_path)
                self.logger.debug(f"Created directory: {dir_path}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to create directory structure for {target_path}: {str(e)}")
            return False
    
    def set_permissions(self, path: str, user: str, group: str, mode: str) -> bool:
        """Set file/directory permissions."""
        try:
            # Get user and group IDs
            uid = pwd.getpwnam(user).pw_uid
            gid = grp.getgrnam(group).gr_gid
            
            # Change ownership
            os.chown(path, uid, gid)
            
            # Change permissions
            os.chmod(path, int(mode, 8))
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to set permissions on {path}: {str(e)}")
            return False
    
    def files_identical(self, file1: str, file2: str) -> bool:
        """Check if two files are identical using hash comparison."""
        try:
            with open(file1, 'rb') as f1, open(file2, 'rb') as f2:
                return hashlib.md5(f1.read()).hexdigest() == hashlib.md5(f2.read()).hexdigest()
        except Exception:
            return False
    
    def perform_symlink_operation(self, operation: FileOperation, tab_path: str) -> bool:
        """Perform a symlink operation."""
        source_path = os.path.join(tab_path, operation.source)
        target_path = operation.target
        
        # Create target directory structure if needed
        if not self.create_directory_structure(target_path):
            return False
        
        # Handle existing files at target
        if os.path.exists(target_path):
            if os.path.islink(target_path):
                # Check if it's already the correct symlink
                if os.readlink(target_path) == source_path:
                    self.logger.info(f"Symlink already exists: {target_path}")
                    return True
                else:
                    # Remove broken/incorrect symlink
                    os.remove(target_path)
            else:
                self.logger.error(f"File already exists at target: {target_path}")
                return False
        
        # Create symlink
        try:
            os.symlink(source_path, target_path)
            
            # Set permissions on the symlink itself
            try:
                uid = pwd.getpwnam("www-data").pw_uid
                gid = grp.getgrnam("www-data").gr_gid
                os.lchown(target_path, uid, gid)
            except Exception as perm_e:
                self.logger.warning(f"Could not set symlink permissions on {target_path}: {str(perm_e)}")
            
            self.logger.info(f"Created symlink: {source_path} -> {target_path}")
            self.operations_history.append(operation)
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to create symlink: {str(e)}")
            return False
    
    def perform_append_operation(self, operation: FileOperation, tab_path: str) -> bool:
        """Perform an append operation with markers, respecting indentation context."""
        target_path = operation.target
        
        if not os.path.exists(target_path):
            self.logger.error(f"Target file does not exist: {target_path}")
            return False
        
        # Read current file content
        try:
            with open(target_path, 'r') as f:
                content = f.read()
        except Exception as e:
            self.logger.error(f"Failed to read target file: {str(e)}")
            return False
        
        # Check for existing identifier
        identifier_start = f"# PREMIUM_TAB_IDENTIFIER: {operation.identifier}"
        identifier_end = f"# END_PREMIUM_TAB_IDENTIFIER: {operation.identifier}"
        
        if identifier_start in content:
            self.logger.info(f"Identifier already exists, skipping append: {operation.identifier}")
            return True
        
        # Find marker section
        marker_config = self.APPEND_MARKERS.get(operation.marker)
        if not marker_config:
            self.logger.error(f"Unknown append marker: {operation.marker}")
            return False
        
        start_marker = marker_config["start"]
        end_marker = marker_config["end"]
        
        if start_marker not in content or end_marker not in content:
            self.logger.error(f"Append markers not found in {target_path}")
            return False
        
        # Read source content
        source_path = os.path.join(tab_path, operation.source)
        try:
            with open(source_path, 'r') as f:
                source_content = f.read().strip()
            
            # For backend blueprint registration, dynamically generate correct import path AND registration
            if operation.identifier and "backend" in operation.source:
                tab_name = operation.identifier
                
                # Transform the source content to include both import and registration
                # Generate relative import from the main backend directory
                source_content = f"# {tab_name.title()} Premium Tab Blueprint Registration\nfrom .{tab_name}.routes import bp as {tab_name}_bp\napp.register_blueprint({tab_name}_bp)"
                
        except Exception as e:
            self.logger.error(f"Failed to read source file: {str(e)}")
            return False
        
        # Find the proper indentation context by looking at existing blueprint registrations
        lines = content.split('\n')
        
        # Look for existing blueprint registrations to determine proper indentation
        blueprint_indent = None
        for i, line in enumerate(lines):
            if "app.register_blueprint(" in line:
                blueprint_indent = len(line) - len(line.lstrip())
                break
        
        # If no existing blueprints found, look for the start marker indentation
        if blueprint_indent is None:
            for i, line in enumerate(lines):
                if start_marker in line:
                    blueprint_indent = len(line) - len(line.lstrip())
                    break
        
        # Fallback: use 4-space indentation if nothing else works
        if blueprint_indent is None:
            blueprint_indent = 4
        
        # Apply the detected indentation to source content
        indent_str = ' ' * blueprint_indent
        source_lines = source_content.split('\n')
        indented_source_lines = []
        for line in source_lines:
            if line.strip():  # Only indent non-empty lines
                indented_source_lines.append(indent_str + line)
            else:
                indented_source_lines.append(line)
        
        indented_source_content = '\n'.join(indented_source_lines)
        
        # Prepare append content with identifier (also indented)
        indented_identifier_start = indent_str + identifier_start
        indented_identifier_end = indent_str + identifier_end
        append_content = f"\n{indented_identifier_start}\n{indented_source_content}\n{indented_identifier_end}\n"
        
        # Insert content before end marker
        end_marker_pos = content.find(end_marker)
        new_content = content[:end_marker_pos] + append_content + content[end_marker_pos:]
        
        # Create backup
        operation.backup_path = self.create_backup(target_path)
        
        # Write new content
        try:
            with open(target_path, 'w') as f:
                f.write(new_content)
            
            self.logger.info(f"Appended content to {target_path} with proper indentation ({blueprint_indent} spaces)")
            self.operations_history.append(operation)
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to write appended content: {str(e)}")
            return False
    
    def perform_copy_operation(self, operation: FileOperation, tab_path: str) -> bool:
        """Perform a copy operation."""
        source_path = os.path.join(tab_path, operation.source)
        target_path = operation.target
        
        # Check if file already exists and is identical
        if os.path.exists(target_path):
            if self.files_identical(source_path, target_path):
                self.logger.info(f"Identical file already exists: {target_path}")
                return True
            else:
                self.logger.error(f"Different file exists at target: {target_path}")
                return False
        
        # Create target directory structure if needed
        if not self.create_directory_structure(target_path):
            return False
        
        # Create backup if target exists
        if os.path.exists(target_path):
            operation.backup_path = self.create_backup(target_path)
        
        # Copy file
        try:
            shutil.copy2(source_path, target_path)
            
            # Set permissions for sudoers files
            if target_path.startswith("/etc/sudoers.d"):
                self.set_permissions(target_path, "root", "root", "440")
                # Validate sudoers syntax
                if not self.validate_sudoers_file(target_path):
                    return False
            else:
                self.set_permissions(target_path, "www-data", "www-data", "775")
            
            self.logger.info(f"Copied file: {source_path} -> {target_path}")
            self.operations_history.append(operation)
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to copy file: {str(e)}")
            return False
    
    def validate_sudoers_file(self, file_path: str) -> bool:
        """Validate sudoers file syntax."""
        try:
            result = subprocess.run(["visudo", "-c", "-f", file_path], 
                                  capture_output=True, text=True)
            return result.returncode == 0
        except Exception as e:
            self.logger.error(f"Sudoers validation failed: {str(e)}")
            return False
    
    def rollback_operations(self) -> None:
        """Rollback all file operations."""
        self.logger.info("Rolling back file operations")
        
        # Rollback file operations in reverse order
        for operation in reversed(self.operations_history):
            try:
                if operation.operation_type == "symlink":
                    if os.path.islink(operation.target):
                        os.remove(operation.target)
                        self.logger.debug(f"Removed symlink: {operation.target}")
                        
                elif operation.operation_type == "copy":
                    if operation.backup_path:
                        self.restore_backup(operation.backup_path, operation.target)
                    elif os.path.exists(operation.target):
                        os.remove(operation.target)
                        self.logger.debug(f"Removed copied file: {operation.target}")
                        
                elif operation.operation_type == "append":
                    if operation.backup_path:
                        self.restore_backup(operation.backup_path, operation.target)
                        
            except Exception as e:
                self.logger.error(f"Error during rollback of {operation.target}: {str(e)}")
        
        # Remove created directories in reverse order
        for directory in reversed(self.created_directories):
            try:
                if os.path.exists(directory) and not os.listdir(directory):
                    os.rmdir(directory)
                    self.logger.debug(f"Removed directory: {directory}")
            except Exception as e:
                self.logger.error(f"Error removing directory {directory}: {str(e)}")
        
        # Clear history
        self.operations_history.clear()
        self.created_directories.clear()
    
    def remove_appended_content(self, target_path: str, identifier: str) -> bool:
        """Remove appended content identified by identifier from target file."""
        if not os.path.exists(target_path):
            self.logger.warning(f"Target file does not exist: {target_path}")
            return True  # Already removed
        
        try:
            with open(target_path, 'r') as f:
                content = f.read()
        except Exception as e:
            self.logger.error(f"Failed to read target file: {str(e)}")
            return False
        
        # Find identifier markers
        identifier_start = f"# PREMIUM_TAB_IDENTIFIER: {identifier}"
        identifier_end = f"# END_PREMIUM_TAB_IDENTIFIER: {identifier}"
        
        if identifier_start not in content:
            self.logger.info(f"Identifier not found, content already removed: {identifier}")
            return True
        
        # Create backup
        backup_path = self.create_backup(target_path)
        
        # Find and remove the content between markers
        start_pos = content.find(identifier_start)
        end_pos = content.find(identifier_end)
        
        if start_pos == -1 or end_pos == -1:
            self.logger.error(f"Could not find complete identifier markers for: {identifier}")
            return False
        
        # Find the start of the line containing the start marker
        line_start = content.rfind('\n', 0, start_pos)
        if line_start == -1:
            line_start = 0
        else:
            line_start += 1  # Move past the newline
        
        # Find the end of the line containing the end marker
        line_end = content.find('\n', end_pos + len(identifier_end))
        if line_end == -1:
            line_end = len(content)
        else:
            line_end += 1  # Include the newline
        
        # Remove the content
        new_content = content[:line_start] + content[line_end:]
        
        # Write the modified content
        try:
            with open(target_path, 'w') as f:
                f.write(new_content)
            
            self.logger.info(f"Removed appended content for {identifier} from {target_path}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to write modified content: {str(e)}")
            # Restore backup on failure
            if backup_path:
                self.restore_backup(backup_path, target_path)
            return False
    
    def remove_file_or_symlink(self, target_path: str) -> bool:
        """Remove a file or symlink."""
        if not os.path.exists(target_path) and not os.path.islink(target_path):
            self.logger.info(f"File already removed: {target_path}")
            return True
        
        try:
            if os.path.islink(target_path):
                os.remove(target_path)
                self.logger.info(f"Removed symlink: {target_path}")
            elif os.path.isfile(target_path):
                os.remove(target_path)
                self.logger.info(f"Removed file: {target_path}")
            else:
                self.logger.warning(f"Path is not a file or symlink: {target_path}")
                return False
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to remove {target_path}: {str(e)}")
            return False
    
    def remove_empty_directories(self, directory_path: str) -> bool:
        """Remove empty directories recursively up the tree."""
        try:
            current_dir = directory_path
            
            while current_dir and current_dir != '/':
                if os.path.exists(current_dir) and os.path.isdir(current_dir):
                    try:
                        # Only remove if directory is empty
                        if not os.listdir(current_dir):
                            os.rmdir(current_dir)
                            self.logger.debug(f"Removed empty directory: {current_dir}")
                            current_dir = os.path.dirname(current_dir)
                        else:
                            # Directory not empty, stop here
                            break
                    except OSError:
                        # Directory not empty or permission issue
                        break
                else:
                    break
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error removing empty directories: {str(e)}")
            return False 