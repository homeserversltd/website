"""
Local Provider
Copyright (C) 2024 HOMESERVER LLC

Provider for local file system storage.
"""

import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
import logging
import os
import subprocess
from .base import BaseProvider

class LocalProvider(BaseProvider):
    """Local file system provider."""

    def _is_external_mount(self, path: Path) -> bool:
        """Check if path is on an external mount (not root filesystem)."""
        try:
            # Resolve the path to absolute and walk up to find mount point
            # findmnt may fail on subdirectories, so we walk up the tree
            current_path = path.resolve() if path.exists() else Path(str(path))
            
            # Try findmnt on the path first
            result = subprocess.run(['findmnt', '-n', '-o', 'SOURCE,TARGET', str(current_path)],
                                  capture_output=True, text=True, timeout=10)

            # If that fails, walk up the directory tree to find the mount point
            if result.returncode != 0:
                # Walk up until we find a mount point or reach root
                check_path = current_path
                while check_path != check_path.parent and check_path != Path('/'):
                    check_path = check_path.parent
                    result = subprocess.run(['findmnt', '-n', '-o', 'SOURCE,TARGET', str(check_path)],
                                          capture_output=True, text=True, timeout=10)
                    if result.returncode == 0 and result.stdout.strip():
                        break
                
                if result.returncode != 0:
                    self.logger.warning(f"Could not determine mount for {path} (tried up to {check_path})")
                    return False

            output = result.stdout.strip()
            if not output:
                self.logger.warning(f"No mount information returned for {path}")
                return False

            # findmnt returns: SOURCE TARGET (e.g., "/dev/mapper/sdc_crypt /mnt/nas")
            lines = output.split('\n')
            for line in lines:
                parts = line.split()
                if len(parts) >= 2:
                    mount_source, mount_target = parts[0], parts[1]
                    
                    # If mount target is / or root filesystem, this is not external
                    if mount_target == '/':
                        self.logger.warning(f"Path {path} is on root filesystem mount: {mount_source} -> {mount_target}")
                        return False
                    
                    # Treat system drive (/dev/sda*) as non-external
                    if mount_source.startswith('/dev/sda'):
                        self.logger.warning(f"Path {path} is on system drive mount: {mount_source} -> {mount_target}")
                        return False
                    
                    # Found valid external mount
                    self.logger.info(f"Path {path} verified on external mount: {mount_source} -> {mount_target}")
                    return True

            # If we get here, no valid mount was found
            self.logger.warning(f"Could not determine if {path} is on external mount")
            return False

        except Exception as e:
            self.logger.error(f"Error checking mount for {path}: {e}")
            return False

    def _validate_backup_target(self, path: Path, required_space_gb: float = 10.0) -> bool:
        """Validate that backup target is suitable: external mount with sufficient space."""
        # Check if path is on external mount
        if not self._is_external_mount(path):
            raise ValueError(f"Backup target {path} must be on an external mounted drive, not the root filesystem")

        # Check available space
        try:
            statvfs = os.statvfs(path)
            # Use f_bavail (available to non-root) for compatibility with older Python versions
            # f_bavail is available in Python 2.7+, f_available is Python 3.3+
            free_bytes = statvfs.f_frsize * statvfs.f_bavail
            free_gb = free_bytes / (1024**3)

            if free_gb < required_space_gb:
                raise ValueError(f"Insufficient space on {path}: {free_gb:.1f}GB free, need {required_space_gb}GB")

            self.logger.info(f"Backup target validation passed: {path} has {free_gb:.1f}GB free")
            return True

        except Exception as e:
            raise ValueError(f"Could not validate backup target {path}: {e}")

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.logger = logging.getLogger('backend.backupTab.utils')

        # Configuration - support both 'container' and 'path' for compatibility
        # NOTE: Path MUST be on an external mounted drive, not root filesystem!
        self.container = config.get('container') or config.get('path', '/mnt/external-drive/backups/homeserver')
        self.base_path = Path(self.container)

        # Validate that backup target is on external mount with sufficient space
        try:
            self._validate_backup_target(self.base_path.parent, required_space_gb=10.0)
        except ValueError as e:
            self.logger.error(f"Backup target validation failed: {e}")
            raise

        # Ensure base path exists
        self.base_path.mkdir(parents=True, exist_ok=True)

        self.logger.info(f"Local provider initialized with validated base path: {self.base_path}")
    
    def upload(self, file_path: Path, remote_name: str, progress_callback: Optional[Callable] = None) -> bool:
        """Upload file to local storage."""
        try:
            if not file_path.exists():
                self.logger.error(f"Source file not found: {file_path}")
                return False
            
            # Create destination path
            dest_path = self.base_path / remote_name
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Copy file
            if progress_callback:
                progress_callback(0, file_path.stat().st_size)
            
            shutil.copy2(file_path, dest_path)
            
            if progress_callback:
                progress_callback(file_path.stat().st_size, file_path.stat().st_size)
            
            self.logger.info(f"Successfully uploaded {file_path} to {dest_path}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to upload {file_path}: {e}")
            return False
    
    def download(self, remote_name: str, local_path: Path, progress_callback: Optional[Callable] = None) -> bool:
        """Download file from local storage."""
        try:
            source_path = self.base_path / remote_name
            
            if not source_path.exists():
                self.logger.error(f"File not found: {source_path}")
                return False
            
            # Ensure local directory exists
            local_path.parent.mkdir(parents=True, exist_ok=True)
            
            if progress_callback:
                progress_callback(0, source_path.stat().st_size)
            
            shutil.copy2(source_path, local_path)
            
            if progress_callback:
                progress_callback(source_path.stat().st_size, source_path.stat().st_size)
            
            self.logger.info(f"Successfully downloaded {source_path} to {local_path}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to download {remote_name}: {e}")
            return False
    
    def list_files(self, prefix: str = "", max_files: int = 1000) -> List[Dict[str, Any]]:
        """List files in local storage."""
        files = []
        
        try:
            for file_path in self.base_path.rglob('*'):
                if file_path.is_file():
                    # Apply prefix filtering
                    relative_path = file_path.relative_to(self.base_path)
                    if prefix and not str(relative_path).startswith(prefix):
                        continue
                    
                    # Apply max_files limit
                    if len(files) >= max_files:
                        break
                    
                    stat = file_path.stat()
                    files.append({
                        'name': str(relative_path),
                        'size': stat.st_size,
                        'mtime': stat.st_mtime,
                        'path': str(file_path)
                    })
            
            self.logger.info(f"Found {len(files)} files in local storage")
            
        except Exception as e:
            self.logger.error(f"Error listing files: {e}")
        
        return files
    
    def delete(self, remote_name: str) -> bool:
        """Delete file from local storage."""
        try:
            file_path = self.base_path / remote_name
            
            if not file_path.exists():
                self.logger.warning(f"File not found for deletion: {file_path}")
                return False
            
            file_path.unlink()
            self.logger.info(f"Successfully deleted {file_path}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to delete {remote_name}: {e}")
            return False
    
    def test_connection(self) -> bool:
        """Test connection to local storage."""
        try:
            # Test if we can read and write to the base path
            test_file = self.base_path / '.test_connection'
            
            # Test write
            test_file.write_text('test')
            
            # Test read
            content = test_file.read_text()
            if content != 'test':
                return False
            
            # Clean up
            test_file.unlink()
            
            self.logger.info("Local storage connection test successful")
            return True
            
        except Exception as e:
            self.logger.error(f"Local storage connection test failed: {e}")
            return False
    
    def get_storage_info(self) -> Dict[str, Any]:
        """Get storage information."""
        try:
            # Get disk usage
            statvfs = os.statvfs(self.base_path)
            
            # Calculate sizes
            total_bytes = statvfs.f_frsize * statvfs.f_blocks
            # Use f_bavail (available to non-root) for compatibility with older Python versions
            free_bytes = statvfs.f_frsize * statvfs.f_bavail
            used_bytes = total_bytes - free_bytes
            
            return {
                'total_bytes': total_bytes,
                'used_bytes': used_bytes,
                'free_bytes': free_bytes,
                'total_gb': round(total_bytes / (1024**3), 2),
                'used_gb': round(used_bytes / (1024**3), 2),
                'free_gb': round(free_bytes / (1024**3), 2),
                'usage_percent': round((used_bytes / total_bytes) * 100, 2)
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get storage info: {e}")
            return {}
    
    def create_backup(self, backup_items: List[str], timestamp: str) -> Optional[Path]:
        """Create a compressed backup tarball of the specified items (no encryption)."""
        try:
            backup_name = "homeserver_backup_latest.tar.gz"
            backup_path = self.base_path / backup_name

            # Ensure base path exists
            self.base_path.mkdir(parents=True, exist_ok=True)

            # Re-validate backup target before creating large backup
            try:
                # Estimate backup size (rough calculation)
                estimated_size_gb = 0
                for item in backup_items:
                    item_path = Path(item)
                    if item_path.exists():
                        if item_path.is_file():
                            estimated_size_gb += item_path.stat().st_size / (1024**3)
                        else:
                            # For directories, estimate based on du
                            try:
                                result = subprocess.run(['du', '-sb', str(item_path)],
                                                      capture_output=True, text=True, timeout=30)
                                if result.returncode == 0:
                                    size_bytes = int(result.stdout.split()[0])
                                    estimated_size_gb += size_bytes / (1024**3)
                            except:
                                # Fallback: assume 1GB per directory
                                estimated_size_gb += 1.0

                # Add 20% overhead for compression artifacts
                required_space_gb = max(estimated_size_gb * 1.2, 2.0)  # Minimum 2GB

                self._validate_backup_target(self.base_path.parent, required_space_gb=required_space_gb)
                self.logger.info(f"Estimated backup size: {estimated_size_gb:.1f}GB, requiring {required_space_gb:.1f}GB space")

            except ValueError as e:
                self.logger.error(f"Backup target validation failed before backup creation: {e}")
                return None

            # Create compressed tarball (no encryption - handled by main script)
            import tarfile
            with tarfile.open(backup_path, "w:gz", compresslevel=6) as tar:
                for item in backup_items:
                    item_path = Path(item)
                    if item_path.exists():
                        tar.add(item, arcname=item_path.name)
                        self.logger.info(f"Added to backup: {item}")
                    else:
                        self.logger.warning(f"Item not found: {item}")

            self.logger.info(f"Created local backup: {backup_path}")
            return backup_path

        except Exception as e:
            self.logger.error(f"Failed to create backup: {e}")
            return None

    def get_provider_status(self) -> Dict[str, Any]:
        """Get comprehensive provider status information."""
        storage_info = self.get_storage_info()
        
        return {
            'name': self.name,
            'base_path': str(self.base_path),
            'path_exists': self.base_path.exists(),
            'path_writable': os.access(self.base_path, os.W_OK),
            'storage_info': storage_info,
            'connection_test': self.test_connection()
        }