"""
Google Cloud Storage Provider
Copyright (C) 2024 HOMESERVER LLC

Provider for Google Cloud Storage (GCS) storage.
"""

from google.cloud import storage
from google.oauth2 import service_account
import io
import time
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
from .base import BaseProvider

class GoogleCloudStorageProvider(BaseProvider):
    """Google Cloud Storage provider implementation."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.credentials_file = config.get('credentials_file', 'gcs_credentials.json')
        self.bucket_name = config.get('bucket_name', 'homeserver-backups')
        self.project_id = config.get('project_id')
        self.max_retries = config.get('max_retries', 3)
        self.retry_delay = config.get('retry_delay', 1.0)
        self.timeout = config.get('timeout', 300)
        
        # Initialize GCS client
        self.client = self._get_client()
        self.bucket = None
        if self.client:
            self.bucket = self.client.bucket(self.bucket_name)
    
    def _get_client(self):
        """Get Google Cloud Storage client instance."""
        try:
            if not self.credentials_file or not Path(self.credentials_file).exists():
                print("ERROR: Google Cloud Storage credentials file not found")
                print(f"Expected: {self.credentials_file}")
                print("Please download service account key from Google Cloud Console")
                return None
            
            # Load service account credentials
            credentials = service_account.Credentials.from_service_account_file(
                self.credentials_file,
                scopes=['https://www.googleapis.com/auth/cloud-platform']
            )
            
            # Create storage client
            client = storage.Client(credentials=credentials, project=self.project_id)
            print(f"Initialized Google Cloud Storage client for project: {self.project_id}")
            return client
            
        except Exception as e:
            print(f"ERROR: Failed to initialize Google Cloud Storage client: {e}")
            return None
    
    def _ensure_bucket_exists(self) -> bool:
        """Ensure the backup bucket exists in Google Cloud Storage."""
        if not self.client:
            return False
        
        try:
            # Check if bucket exists
            if self.bucket.exists():
                print(f"Using existing bucket: {self.bucket_name}")
                return True
            
            # Create bucket if it doesn't exist
            print(f"Creating bucket: {self.bucket_name}")
            self.bucket = self.client.create_bucket(self.bucket_name)
            print(f"Successfully created bucket: {self.bucket_name}")
            return True
            
        except Exception as e:
            print(f"ERROR: Failed to ensure bucket exists: {e}")
            return False
    
    def upload(self, file_path: Path, remote_name: str, progress_callback: Optional[Callable] = None) -> bool:
        """Upload file to Google Cloud Storage."""
        if not self.client or not self.bucket:
            print("ERROR: Google Cloud Storage client not initialized")
            return False
        
        # Ensure bucket exists
        if not self._ensure_bucket_exists():
            print("ERROR: Failed to create or access bucket")
            return False
        
        for attempt in range(self.max_retries):
            try:
                if progress_callback:
                    progress_callback(0, file_path.stat().st_size)
                
                # Create blob object
                blob = self.bucket.blob(remote_name)
                
                # Upload file with progress tracking
                def upload_progress(bytes_uploaded):
                    if progress_callback:
                        progress_callback(bytes_uploaded, file_path.stat().st_size)
                
                # Upload the file
                blob.upload_from_filename(str(file_path), callback=upload_progress)
                
                if progress_callback:
                    progress_callback(file_path.stat().st_size, file_path.stat().st_size)
                
                print(f"Successfully uploaded {remote_name} to Google Cloud Storage")
                return True
                
            except Exception as e:
                if attempt < self.max_retries - 1:
                    print(f"Upload attempt {attempt + 1} failed: {e}")
                    time.sleep(self.retry_delay * (2 ** attempt))
                else:
                    print(f"ERROR: Failed to upload {file_path} to Google Cloud Storage after {self.max_retries} attempts: {e}")
                    return False
        
        return False
    
    def download(self, remote_name: str, local_path: Path, progress_callback: Optional[Callable] = None) -> bool:
        """Download file from Google Cloud Storage."""
        if not self.client or not self.bucket:
            print("ERROR: Google Cloud Storage client not initialized")
            return False
        
        for attempt in range(self.max_retries):
            try:
                # Get blob object
                blob = self.bucket.blob(remote_name)
                
                if not blob.exists():
                    print(f"ERROR: File not found in Google Cloud Storage: {remote_name}")
                    return False
                
                # Get file size for progress tracking
                blob.reload()
                file_size = blob.size
                
                if progress_callback:
                    progress_callback(0, file_size)
                
                # Download with progress tracking
                def download_progress(bytes_downloaded):
                    if progress_callback:
                        progress_callback(bytes_downloaded, file_size)
                
                # Download the file
                blob.download_to_filename(str(local_path), callback=download_progress)
                
                if progress_callback:
                    progress_callback(file_size, file_size)
                
                print(f"Successfully downloaded {remote_name} from Google Cloud Storage")
                return True
                
            except Exception as e:
                if attempt < self.max_retries - 1:
                    print(f"Download attempt {attempt + 1} failed: {e}")
                    time.sleep(self.retry_delay * (2 ** attempt))
                else:
                    print(f"ERROR: Failed to download {remote_name} from Google Cloud Storage after {self.max_retries} attempts: {e}")
                    return False
        
        return False
    
    def list_files(self, prefix: str = "", max_files: int = 1000) -> List[Dict[str, Any]]:
        """List files in Google Cloud Storage bucket."""
        if not self.client or not self.bucket:
            print("ERROR: Google Cloud Storage client not initialized")
            return []
        
        files = []
        try:
            # List blobs with prefix filter
            blobs = self.client.list_blobs(
                self.bucket_name,
                prefix=prefix,
                max_results=max_files
            )
            
            for blob in blobs:
                # Convert timezone-aware datetime to timestamp
                mtime = blob.time_created.timestamp() if blob.time_created else 0
                
                files.append({
                    'name': blob.name,
                    'size': blob.size or 0,
                    'mtime': mtime,
                    'id': blob.name,  # Use name as ID for GCS
                    'content_type': blob.content_type,
                    'storage_class': blob.storage_class
                })
                
        except Exception as e:
            print(f"ERROR: Failed to list files in Google Cloud Storage: {e}")
        
        return files
    
    def delete(self, remote_name: str) -> bool:
        """Delete file from Google Cloud Storage."""
        if not self.client or not self.bucket:
            print("ERROR: Google Cloud Storage client not initialized")
            return False
        
        try:
            # Get blob object
            blob = self.bucket.blob(remote_name)
            
            if not blob.exists():
                print(f"WARNING: File not found for deletion: {remote_name}")
                return False
            
            # Delete the blob
            blob.delete()
            print(f"Successfully deleted {remote_name} from Google Cloud Storage")
            return True
            
        except Exception as e:
            print(f"ERROR: Failed to delete {remote_name} from Google Cloud Storage: {e}")
            return False
    
    def test_connection(self) -> bool:
        """Test connection to Google Cloud Storage."""
        if not self.client:
            print("ERROR: Google Cloud Storage client not initialized")
            return False
        
        try:
            # Try to list buckets (this will fail if no access)
            list(self.client.list_buckets(max_results=1))
            print("Google Cloud Storage connection test successful")
            return True
        except Exception as e:
            print(f"ERROR: Google Cloud Storage connection test failed: {e}")
            return False