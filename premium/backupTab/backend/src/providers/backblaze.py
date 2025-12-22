"""
Backblaze B2 Provider
Copyright (C) 2024 HOMESERVER LLC

Provider for Backblaze B2 storage with enhanced features for enterprise backup.
Integrated with keyman credential management system.
"""

import b2sdk
from b2sdk.v1 import InMemoryAccountInfo, B2Api
from b2sdk.v1.exception import B2Error, B2ConnectionError, B2RequestTimeout, B2SimpleError
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
import time
import logging
import hashlib
import hmac
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import os
from .base import BaseProvider
from ..utils.keyman_integration import KeymanIntegration

class BackblazeProvider(BaseProvider):
    """Backblaze B2 provider with enhanced enterprise features and keyman integration."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.logger = logging.getLogger('backend.backupTab.utils')
        self.keyman = KeymanIntegration()
        
        # Check if keyman credentials are available
        self.logger.info("=== BACKBLAZE PROVIDER INITIALIZATION ===")
        self.logger.info(f"Checking if keyman service 'backblaze' is configured...")
        self.keyman_configured = self.keyman.service_configured('backblaze')
        self.logger.info(f"Keyman configured result: {self.keyman_configured}")
        
        if not self.keyman_configured:
            self.logger.error("Backblaze provider requires keyman credentials. Use CLI to set credentials:")
            self.logger.error("  ./backup set-credentials backblaze --username <application_key_id> --password <application_key>")
            self.application_key_id = None
            self.application_key = None
            self.logger.error("Backblaze provider initialization FAILED - no keyman credentials")
        else:
            # Load credentials from keyman
            self.logger.info("Attempting to load credentials from keyman system...")
            credentials = self.keyman.get_service_credentials('backblaze')
            self.logger.info(f"Keyman credentials result: {bool(credentials)} (not showing actual values)")
            
            if credentials:
                self.application_key_id = credentials.get('username')
                self.application_key = credentials.get('password')
                self.logger.info(f"Successfully loaded Backblaze credentials - key_id length: {len(self.application_key_id) if self.application_key_id else 0}, key length: {len(self.application_key) if self.application_key else 0}")
                self.logger.info("Loaded Backblaze credentials from keyman system")
            else:
                self.logger.error("Failed to load credentials from keyman system")
                self.logger.error("This means keyman.get_service_credentials('backblaze') returned None")
                self.application_key_id = None
                self.application_key = None
        
        # Try both 'bucket' and 'container' fields for backwards compatibility
        self.bucket_name = config.get('bucket') or config.get('container', 'homeserver-backups')
        self.logger.info(f"Using bucket name: {self.bucket_name}")
        self.logger.info(f"Config had bucket field: {bool(config.get('bucket'))}")
        self.logger.info(f"Config had container field: {bool(config.get('container'))}")
        self.region = config.get('region', 'us-west-000')  # Default B2 region
        
        # Retry configuration
        self.max_retries = config.get('max_retries', 3)
        self.retry_delay = config.get('retry_delay', 1.0)
        self.timeout = config.get('timeout', 300)  # 5 minutes default
        
        # Bandwidth control
        self.max_bandwidth = config.get('max_bandwidth', None)  # bytes per second
        self.upload_chunk_size = config.get('upload_chunk_size', 100 * 1024 * 1024)  # 100MB
        self._last_transfer_time = 0
        self._bytes_transferred = 0
        
        # Encryption configuration
        self.encryption_enabled = config.get('encryption_enabled', False)
        self.encryption_key = config.get('encryption_key', None)
        self.encryption_salt = config.get('encryption_salt', None)
        self._fernet = None
        
        # Initialize encryption if enabled
        if self.encryption_enabled:
            self._initialize_encryption()
        
        # Connection pooling
        self.connection_pool_size = config.get('connection_pool_size', 5)
        self._connection_pool = []
        self._pool_lock = None
        
        # Validate configuration
        if not self._validate_config():
            self.b2_api = None
            self.bucket = None
            return
        
        # Initialize B2 API with retry logic
        self._initialize_api()
    
    def _validate_config(self) -> bool:
        """Validate Backblaze configuration."""
        self.logger.info("=== BACKBLAZE CONFIG VALIDATION ===")
        self.logger.info(f"application_key_id present: {bool(self.application_key_id)}")
        self.logger.info(f"application_key present: {bool(self.application_key)}")
        self.logger.info(f"bucket_name present: {bool(self.bucket_name)}")
        
        if not self.application_key_id:
            self.logger.error("Missing application_key_id in Backblaze configuration")
            self.logger.error("This is likely why B2 API initialization is failing")
            return False
        
        if not self.application_key:
            self.logger.error("Missing application_key in Backblaze configuration")
            self.logger.error("This is likely why B2 API initialization is failing")
            return False
        
        if not self.bucket_name:
            self.logger.error("Missing bucket name in Backblaze configuration")
            return False
        
        self.logger.info(f"Backblaze configuration validated for bucket: {self.bucket_name}")
        self.logger.info("All required credentials are present")
        return True
    
    def _initialize_api(self) -> None:
        """Initialize B2 API with retry logic."""
        for attempt in range(self.max_retries):
            try:
                info = InMemoryAccountInfo()
                self.b2_api = B2Api(info)
                self.b2_api.authorize_account(
                    "production",
                    self.application_key_id,
                    self.application_key
                )
                self.bucket = self.b2_api.get_bucket_by_name(self.bucket_name)
                self.logger.info(f"Successfully initialized B2 API (attempt {attempt + 1})")
                return
            except B2ConnectionError as e:
                self.logger.warning(f"B2 connection error (attempt {attempt + 1}/{self.max_retries}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))  # Exponential backoff
                else:
                    self.logger.error("Failed to initialize B2 API after all retries")
                    self.b2_api = None
                    self.bucket = None
            except B2Error as e:
                self.logger.error(f"B2 API initialization failed: {e}")
                self.b2_api = None
                self.bucket = None
                return
            except Exception as e:
                self.logger.error(f"Unexpected error initializing B2 API: {e}")
                self.b2_api = None
                self.bucket = None
                return
    
    def upload(self, file_path: Path, remote_name: str, progress_callback: Optional[Callable] = None) -> bool:
        """Upload file to Backblaze B2 with retry logic and progress tracking."""
        # Convert to Path if it's a string
        if isinstance(file_path, str):
            file_path = Path(file_path)
        
        if not self.b2_api or not self.bucket:
            error_msg = f"B2 API not initialized - b2_api={self.b2_api}, bucket={self.bucket}"
            self.logger.error(error_msg)
            return False
        
        if not file_path.exists():
            error_msg = f"File not found: {file_path}"
            self.logger.error(error_msg)
            return False
        
        file_size = file_path.stat().st_size
        self.logger.info(f"Starting upload of {file_path} ({file_size} bytes) to {remote_name}")
        
        # Use multipart upload for large files
        if file_size > self.upload_chunk_size:
            return self._upload_large_file(file_path, remote_name, progress_callback)
        
        # Standard upload for smaller files
        return self._upload_with_retry(file_path, remote_name, progress_callback)
    
    def _upload_with_retry(self, file_path: Path, remote_name: str, progress_callback: Optional[Callable] = None) -> bool:
        """Upload file with retry logic."""
        for attempt in range(self.max_retries):
            try:
                # Set up progress tracking if callback provided
                if progress_callback:
                    progress_callback(0, file_path.stat().st_size)
                
                self.bucket.upload_local_file(
                    str(file_path),
                    remote_name
                )
                
                if progress_callback:
                    progress_callback(file_path.stat().st_size, file_path.stat().st_size)
                
                self.logger.info(f"Successfully uploaded {file_path} to {remote_name}")
                return True
                
            except B2ConnectionError as e:
                self.logger.warning(f"Connection error during upload (attempt {attempt + 1}/{self.max_retries}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))
                else:
                    self.logger.error(f"Failed to upload {file_path} after all retries")
                    return False
                    
            except B2RequestTimeout as e:
                self.logger.warning(f"Request timeout during upload (attempt {attempt + 1}/{self.max_retries}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))
                else:
                    self.logger.error(f"Upload timeout for {file_path} after all retries")
                    return False
                    
            except B2SimpleError as e:
                self.logger.error(f"B2 API error during upload: {e}")
                return False
                
            except Exception as e:
                self.logger.error(f"Unexpected error during upload: {e}")
                return False
        
        return False
    
    def _upload_large_file(self, file_path: Path, remote_name: str, progress_callback: Optional[Callable] = None) -> bool:
        """Upload large file using multipart upload."""
        try:
            file_size = file_path.stat().st_size
            self.logger.info(f"Using multipart upload for large file: {file_size} bytes")
            
            # B2 SDK handles multipart uploads automatically for large files
            # We just need to ensure proper progress tracking
            if progress_callback:
                progress_callback(0, file_size)
            
            self.bucket.upload_local_file(
                str(file_path),
                remote_name
            )
            
            if progress_callback:
                progress_callback(file_size, file_size)
            
            self.logger.info(f"Successfully uploaded large file {file_path} to {remote_name}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to upload large file {file_path}: {e}")
            return False
    
    def download(self, remote_name: str, local_path: Path, progress_callback: Optional[Callable] = None) -> bool:
        """Download file from Backblaze B2 with retry logic and progress tracking."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return False
        
        # Ensure local directory exists
        local_path.parent.mkdir(parents=True, exist_ok=True)
        
        for attempt in range(self.max_retries):
            try:
                # Get file info first to check if it exists
                file_info = self.bucket.get_file_info_by_name(remote_name)
                if not file_info:
                    self.logger.error(f"File not found in B2: {remote_name}")
                    return False
                
                file_size = file_info.size
                self.logger.info(f"Starting download of {remote_name} ({file_size} bytes)")
                
                if progress_callback:
                    progress_callback(0, file_size)
                
                download_dest = b2sdk.v1.DownloadDestLocalFile(str(local_path))
                self.bucket.download_file_by_name(remote_name, download_dest)
                
                if progress_callback:
                    progress_callback(file_size, file_size)
                
                self.logger.info(f"Successfully downloaded {remote_name} to {local_path}")
                return True
                
            except B2ConnectionError as e:
                self.logger.warning(f"Connection error during download (attempt {attempt + 1}/{self.max_retries}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))
                else:
                    self.logger.error(f"Failed to download {remote_name} after all retries")
                    return False
                    
            except B2RequestTimeout as e:
                self.logger.warning(f"Request timeout during download (attempt {attempt + 1}/{self.max_retries}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))
                else:
                    self.logger.error(f"Download timeout for {remote_name} after all retries")
                    return False
                    
            except B2SimpleError as e:
                self.logger.error(f"B2 API error during download: {e}")
                return False
                
            except Exception as e:
                self.logger.error(f"Unexpected error during download: {e}")
                return False
        
        return False
    
    def list_files(self, prefix: str = "", max_files: int = 1000) -> List[Dict[str, Any]]:
        """List files in Backblaze B2 bucket with filtering and pagination."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return []
        
        files = []
        try:
            self.logger.info(f"Listing files with prefix '{prefix}' (max: {max_files})")
            
            # B2 SDK ls() method doesn't take parameters directly
            # We'll filter the results after getting them
            for file_info in self.bucket.ls():
                # Debug: check what type of object we're getting
                self.logger.debug(f"File info type: {type(file_info)}, content: {file_info}")
                
                # Handle different return types from B2 SDK
                if isinstance(file_info, tuple):
                    # If it's a tuple, we need to extract the file object
                    file_obj = file_info[0] if len(file_info) > 0 else None
                    if not file_obj:
                        continue
                else:
                    file_obj = file_info
                
                # Apply prefix filtering
                if prefix and not file_obj.file_name.startswith(prefix):
                    continue
                
                # Apply max_files limit
                if len(files) >= max_files:
                    break
                
                files.append({
                    'name': file_obj.file_name,
                    'size': file_obj.size,
                    'mtime': file_obj.upload_timestamp / 1000,  # Convert to seconds
                    'id': file_obj.id_,
                    'content_type': getattr(file_obj, 'content_type', 'application/octet-stream'),
                    'sha1': getattr(file_obj, 'content_sha1', ''),
                    'action': getattr(file_obj, 'action', 'upload'),
                    'bucket_id': getattr(file_obj, 'bucket_id', ''),
                    'upload_timestamp': file_obj.upload_timestamp
                })
            
            self.logger.info(f"Found {len(files)} files in bucket")
            
        except B2ConnectionError as e:
            self.logger.error(f"Connection error listing files: {e}")
        except B2Error as e:
            self.logger.error(f"B2 API error listing files: {e}")
        except Exception as e:
            self.logger.error(f"Unexpected error listing files: {e}")
        
        return files
    
    def delete(self, remote_name: str) -> bool:
        """Delete file from Backblaze B2 with retry logic."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return False
        
        for attempt in range(self.max_retries):
            try:
                file_info = self.bucket.get_file_info_by_name(remote_name)
                if not file_info:
                    self.logger.warning(f"File not found for deletion: {remote_name}")
                    return False
                
                self.bucket.delete_file_version(file_info.id_, file_info.file_name)
                self.logger.info(f"Successfully deleted {remote_name} from B2")
                return True
                
            except B2ConnectionError as e:
                self.logger.warning(f"Connection error during deletion (attempt {attempt + 1}/{self.max_retries}): {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (2 ** attempt))
                else:
                    self.logger.error(f"Failed to delete {remote_name} after all retries")
                    return False
                    
            except B2Error as e:
                self.logger.error(f"B2 API error during deletion: {e}")
                return False
                
            except Exception as e:
                self.logger.error(f"Unexpected error during deletion: {e}")
                return False
        
        return False
    
    def test_connection(self) -> bool:
        """Test connection to Backblaze B2 with comprehensive validation."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return False
        
        try:
            # Test basic connectivity by listing files
            # Note: This will list all files, but for an empty bucket it's safe
            files = list(self.bucket.ls())
            
            # Test successful - we can list files from the bucket
            self.logger.info(f"Connection test successful. Bucket: {self.bucket.name}, Files found: {len(files)}")
            
            return True
            
        except B2ConnectionError as e:
            self.logger.error(f"B2 connection test failed - network error: {e}")
            return False
        except B2SimpleError as e:
            self.logger.error(f"B2 connection test failed - API error: {e}")
            return False
        except Exception as e:
            self.logger.error(f"B2 connection test failed - unexpected error: {e}")
            return False
    
    def get_bucket_info(self) -> Optional[Dict[str, Any]]:
        """Get detailed bucket information."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return None
        
        try:
            bucket_info = self.bucket.get_bucket_info()
            return {
                'name': bucket_info.name,
                'id': bucket_info.id_,
                'type': bucket_info.bucket_type,
                'lifecycle_rules': getattr(bucket_info, 'lifecycle_rules', []),
                'cors_rules': getattr(bucket_info, 'cors_rules', []),
                'replication': getattr(bucket_info, 'replication', None),
                'default_server_side_encryption': getattr(bucket_info, 'default_server_side_encryption', None)
            }
        except Exception as e:
            self.logger.error(f"Failed to get bucket info: {e}")
            return None
    
    def get_account_info(self) -> Optional[Dict[str, Any]]:
        """Get account information and usage statistics."""
        if not self.b2_api:
            self.logger.error("B2 API not initialized")
            return None
        
        try:
            account_info = self.b2_api.get_account_info()
            return {
                'account_id': account_info.account_id,
                'account_name': account_info.account_name,
                'allowed': {
                    'bucket_id': account_info.allowed.bucket_id,
                    'bucket_name': account_info.allowed.bucket_name,
                    'capabilities': account_info.allowed.capabilities,
                    'name_prefix': account_info.allowed.name_prefix
                }
            }
        except Exception as e:
            self.logger.error(f"Failed to get account info: {e}")
            return None
    
    def get_storage_usage(self) -> Optional[Dict[str, Any]]:
        """Get storage usage statistics."""
        if not self.b2_api:
            self.logger.error("B2 API not initialized")
            return None
        
        try:
            # This would require additional B2 API calls to get usage stats
            # For now, we'll return basic info
            files = self.list_files()
            total_size = sum(file_info.get('size', 0) for file_info in files)
            file_count = len(files)
            
            return {
                'total_files': file_count,
                'total_size_bytes': total_size,
                'total_size_mb': round(total_size / (1024 * 1024), 2),
                'total_size_gb': round(total_size / (1024 * 1024 * 1024), 2)
            }
        except Exception as e:
            self.logger.error(f"Failed to get storage usage: {e}")
            return None
    
    def set_file_metadata(self, remote_name: str, metadata: Dict[str, str]) -> bool:
        """Set custom metadata for a file."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return False
        
        try:
            file_info = self.bucket.get_file_info_by_name(remote_name)
            if not file_info:
                self.logger.error(f"File not found: {remote_name}")
                return False
            
            # Note: B2 doesn't support updating metadata after upload
            # This would require re-uploading the file with new metadata
            self.logger.warning("B2 doesn't support updating file metadata after upload")
            return False
            
        except Exception as e:
            self.logger.error(f"Failed to set metadata for {remote_name}: {e}")
            return False
    
    def get_file_metadata(self, remote_name: str) -> Optional[Dict[str, Any]]:
        """Get file metadata."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return None
        
        try:
            file_info = self.bucket.get_file_info_by_name(remote_name)
            if not file_info:
                self.logger.error(f"File not found: {remote_name}")
                return None
            
            return {
                'name': file_info.file_name,
                'size': file_info.size,
                'content_type': getattr(file_info, 'content_type', 'application/octet-stream'),
                'sha1': getattr(file_info, 'content_sha1', ''),
                'upload_timestamp': file_info.upload_timestamp,
                'action': getattr(file_info, 'action', 'upload'),
                'bucket_id': getattr(file_info, 'bucket_id', ''),
                'id': file_info.id_
            }
        except Exception as e:
            self.logger.error(f"Failed to get metadata for {remote_name}: {e}")
            return None
    
    def _throttle_bandwidth(self, bytes_transferred: int) -> None:
        """Throttle bandwidth to respect rate limits."""
        if not self.max_bandwidth:
            return
        
        current_time = time.time()
        
        # Reset counters if more than 1 second has passed
        if current_time - self._last_transfer_time >= 1.0:
            self._bytes_transferred = 0
            self._last_transfer_time = current_time
        
        self._bytes_transferred += bytes_transferred
        
        # Calculate how long we should wait to respect bandwidth limit
        if self._bytes_transferred > self.max_bandwidth:
            sleep_time = (self._bytes_transferred - self.max_bandwidth) / self.max_bandwidth
            if sleep_time > 0:
                self.logger.debug(f"Throttling bandwidth: sleeping {sleep_time:.2f}s")
                time.sleep(sleep_time)
                self._bytes_transferred = 0
                self._last_transfer_time = time.time()
    
    def set_bandwidth_limit(self, bytes_per_second: Optional[int]) -> None:
        """Set bandwidth limit for transfers."""
        self.max_bandwidth = bytes_per_second
        if bytes_per_second:
            self.logger.info(f"Bandwidth limit set to {bytes_per_second} bytes/second")
        else:
            self.logger.info("Bandwidth limit removed")
    
    def get_bandwidth_usage(self) -> Dict[str, Any]:
        """Get current bandwidth usage statistics."""
        current_time = time.time()
        if current_time - self._last_transfer_time >= 1.0:
            return {
                'current_rate': 0,
                'bytes_transferred': 0,
                'time_window': 0
            }
        
        time_window = current_time - self._last_transfer_time
        current_rate = self._bytes_transferred / time_window if time_window > 0 else 0
        
        return {
            'current_rate': current_rate,
            'bytes_transferred': self._bytes_transferred,
            'time_window': time_window,
            'limit': self.max_bandwidth,
            'utilization': (current_rate / self.max_bandwidth * 100) if self.max_bandwidth else 0
        }
    
    def set_lifecycle_rule(self, rule: Dict[str, Any]) -> bool:
        """Set lifecycle rule for the bucket."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return False
        
        try:
            # Note: This would require B2 API calls to set lifecycle rules
            # B2 doesn't have traditional lifecycle rules like S3, but has different features
            self.logger.warning("B2 lifecycle management requires manual configuration in B2 console")
            return False
        except Exception as e:
            self.logger.error(f"Failed to set lifecycle rule: {e}")
            return False
    
    def get_lifecycle_rules(self) -> List[Dict[str, Any]]:
        """Get current lifecycle rules for the bucket."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return []
        
        try:
            bucket_info = self.bucket.get_bucket_info()
            return getattr(bucket_info, 'lifecycle_rules', [])
        except Exception as e:
            self.logger.error(f"Failed to get lifecycle rules: {e}")
            return []
    
    def archive_file(self, remote_name: str) -> bool:
        """Archive a file (transition to cheaper storage)."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return False
        
        try:
            # B2 doesn't have automatic archiving like S3 Glacier
            # This would require manual intervention or custom logic
            self.logger.warning("B2 doesn't support automatic file archiving")
            return False
        except Exception as e:
            self.logger.error(f"Failed to archive file {remote_name}: {e}")
            return False
    
    def restore_file(self, remote_name: str, days: int = 1) -> bool:
        """Restore an archived file."""
        if not self.b2_api or not self.bucket:
            self.logger.error("B2 API not initialized")
            return False
        
        try:
            # B2 doesn't have restore process like S3 Glacier
            # Files are immediately available
            self.logger.info(f"File {remote_name} is immediately available (no restore needed)")
            return True
        except Exception as e:
            self.logger.error(f"Failed to restore file {remote_name}: {e}")
            return False
    
    def _initialize_encryption(self) -> None:
        """Initialize encryption with the provided key."""
        try:
            if not self.encryption_key:
                # Generate a new key if none provided
                self.encryption_key = Fernet.generate_key()
                self.logger.warning("No encryption key provided, generated new key")
            
            if not self.encryption_salt:
                # Generate a new salt if none provided
                self.encryption_salt = os.urandom(16)
                self.logger.warning("No encryption salt provided, generated new salt")
            
            # Derive key from password and salt
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=self.encryption_salt,
                iterations=100000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(self.encryption_key))
            self._fernet = Fernet(key)
            
            self.logger.info("Client-side encryption initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize encryption: {e}")
            self.encryption_enabled = False
            self._fernet = None
    
    def _encrypt_data(self, data: bytes) -> bytes:
        """Encrypt data using Fernet encryption."""
        if not self._fernet:
            return data
        
        try:
            return self._fernet.encrypt(data)
        except Exception as e:
            self.logger.error(f"Failed to encrypt data: {e}")
            raise
    
    def _decrypt_data(self, encrypted_data: bytes) -> bytes:
        """Decrypt data using Fernet encryption."""
        if not self._fernet:
            return encrypted_data
        
        try:
            return self._fernet.decrypt(encrypted_data)
        except Exception as e:
            self.logger.error(f"Failed to decrypt data: {e}")
            raise
    
    def upload_encrypted(self, file_path: Path, remote_name: str, progress_callback: Optional[Callable] = None) -> bool:
        """Upload file with client-side encryption."""
        if not self.encryption_enabled:
            self.logger.warning("Encryption not enabled, using standard upload")
            return self.upload(file_path, remote_name, progress_callback)
        
        if not self._fernet:
            self.logger.error("Encryption not properly initialized")
            return False
        
        try:
            # Read and encrypt file
            with open(file_path, 'rb') as f:
                file_data = f.read()
            
            encrypted_data = self._encrypt_data(file_data)
            
            # Create temporary encrypted file
            temp_file = Path(f"/tmp/{remote_name}.encrypted")
            with open(temp_file, 'wb') as f:
                f.write(encrypted_data)
            
            # Upload encrypted file
            encrypted_remote_name = f"{remote_name}.encrypted"
            success = self.upload(temp_file, encrypted_remote_name, progress_callback)
            
            # Clean up temporary file
            temp_file.unlink(missing_ok=True)
            
            if success:
                self.logger.info(f"Successfully uploaded encrypted file: {remote_name}")
            
            return success
            
        except Exception as e:
            self.logger.error(f"Failed to upload encrypted file {file_path}: {e}")
            return False
    
    def download_encrypted(self, remote_name: str, local_path: Path, progress_callback: Optional[Callable] = None) -> bool:
        """Download and decrypt file."""
        if not self.encryption_enabled:
            self.logger.warning("Encryption not enabled, using standard download")
            return self.download(remote_name, local_path, progress_callback)
        
        if not self._fernet:
            self.logger.error("Encryption not properly initialized")
            return False
        
        try:
            # Download encrypted file
            encrypted_remote_name = f"{remote_name}.encrypted"
            temp_file = Path(f"/tmp/{remote_name}.encrypted")
            
            success = self.download(encrypted_remote_name, temp_file, progress_callback)
            if not success:
                return False
            
            # Decrypt file
            with open(temp_file, 'rb') as f:
                encrypted_data = f.read()
            
            decrypted_data = self._decrypt_data(encrypted_data)
            
            # Write decrypted file
            local_path.parent.mkdir(parents=True, exist_ok=True)
            with open(local_path, 'wb') as f:
                f.write(decrypted_data)
            
            # Clean up temporary file
            temp_file.unlink(missing_ok=True)
            
            self.logger.info(f"Successfully downloaded and decrypted file: {remote_name}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to download encrypted file {remote_name}: {e}")
            return False
    
    def get_encryption_info(self) -> Dict[str, Any]:
        """Get encryption configuration information."""
        return {
            'enabled': self.encryption_enabled,
            'has_key': bool(self.encryption_key),
            'has_salt': bool(self.encryption_salt),
            'fernet_initialized': bool(self._fernet)
        }
    
    def _get_connection_from_pool(self) -> Optional[B2Api]:
        """Get a connection from the pool."""
        if not self._connection_pool:
            return None
        
        try:
            return self._connection_pool.pop()
        except IndexError:
            return None
    
    def _return_connection_to_pool(self, connection: B2Api) -> None:
        """Return a connection to the pool."""
        if len(self._connection_pool) < self.connection_pool_size:
            self._connection_pool.append(connection)
    
    def _create_new_connection(self) -> Optional[B2Api]:
        """Create a new B2 API connection."""
        try:
            info = InMemoryAccountInfo()
            b2_api = B2Api(info)
            b2_api.authorize_account(
                "production",
                self.application_key_id,
                self.application_key
            )
            return b2_api
        except Exception as e:
            self.logger.error(f"Failed to create new B2 connection: {e}")
            return None
    
    def get_connection_pool_status(self) -> Dict[str, Any]:
        """Get connection pool status information."""
        return {
            'pool_size': len(self._connection_pool),
            'max_pool_size': self.connection_pool_size,
            'utilization': (len(self._connection_pool) / self.connection_pool_size * 100) if self.connection_pool_size > 0 else 0
        }
    
    def close_all_connections(self) -> None:
        """Close all connections in the pool."""
        self._connection_pool.clear()
        self.logger.info("All connections closed")
    
    def get_provider_status(self) -> Dict[str, Any]:
        """Get comprehensive provider status information."""
        return {
            'name': self.name,
            'bucket_name': self.bucket_name,
            'region': self.region,
            'api_initialized': bool(self.b2_api),
            'bucket_available': bool(self.bucket),
            'encryption': self.get_encryption_info(),
            'bandwidth': self.get_bandwidth_usage(),
            'connection_pool': self.get_connection_pool_status(),
            'retry_config': {
                'max_retries': self.max_retries,
                'retry_delay': self.retry_delay,
                'timeout': self.timeout
            },
            'keyman_integration': {
                'configured': self.keyman_configured,
                'credentials_available': bool(self.application_key_id and self.application_key)
            }
        }
    
    def is_keyman_configured(self) -> bool:
        """Check if keyman credentials are configured for this provider."""
        return self.keyman_configured
    
    def create_keyman_credentials(self, application_key_id: str, application_key: str) -> bool:
        """Create keyman credentials for this provider."""
        return self.keyman.create_service_credentials('backblaze', application_key_id, application_key)
    
    def update_keyman_credentials(self, new_application_key: str, application_key_id: str = None, old_application_key: str = None) -> bool:
        """Update keyman credentials for this provider."""
        return self.keyman.update_service_credentials('backblaze', new_application_key, application_key_id, old_application_key)
    
    def delete_keyman_credentials(self) -> bool:
        """Delete keyman credentials for this provider."""
        return self.keyman.delete_service_credentials('backblaze')
    
    def refresh_keyman_credentials(self) -> bool:
        """Refresh credentials from keyman system."""
        if not self.keyman_configured:
            return False
        
        credentials = self.keyman.get_service_credentials('backblaze')
        if credentials:
            self.application_key_id = credentials.get('username')
            self.application_key = credentials.get('password')
            self.logger.info("Refreshed credentials from keyman system")
            return True
        else:
            self.logger.error("Failed to refresh credentials from keyman system")
            return False