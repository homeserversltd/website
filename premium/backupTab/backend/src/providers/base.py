"""
Base Provider Class
Copyright (C) 2024 HOMESERVER LLC

Abstract base class for all backup providers.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pathlib import Path

class BaseProvider(ABC):
    """Abstract base class for backup providers."""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.name = self.__class__.__name__.replace('Provider', '').lower()
    
    @abstractmethod
    def upload(self, file_path: Path, remote_name: str) -> bool:
        """Upload file to provider storage."""
        pass
    
    @abstractmethod
    def download(self, remote_name: str, local_path: Path) -> bool:
        """Download file from provider storage."""
        pass
    
    @abstractmethod
    def list_files(self) -> List[Dict[str, Any]]:
        """List files in provider storage."""
        pass
    
    @abstractmethod
    def delete(self, remote_name: str) -> bool:
        """Delete file from provider storage."""
        pass
    
    @abstractmethod
    def test_connection(self) -> bool:
        """Test connection to provider."""
        pass
    
    def get_file_info(self, remote_name: str) -> Optional[Dict[str, Any]]:
        """Get information about a specific file."""
        files = self.list_files()
        for file_info in files:
            if file_info.get('name') == remote_name:
                return file_info
        return None
    
    def exists(self, remote_name: str) -> bool:
        """Check if file exists in provider storage."""
        return self.get_file_info(remote_name) is not None
    
    def get_size(self, remote_name: str) -> Optional[int]:
        """Get file size from provider storage."""
        file_info = self.get_file_info(remote_name)
        return file_info.get('size') if file_info else None