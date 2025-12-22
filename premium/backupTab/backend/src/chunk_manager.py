#!/usr/bin/env python3
"""
HOMESERVER Chunk Manager
Copyright (C) 2024 HOMESERVER LLC

Content-Defined Chunking (CDC) implementation using Rabin fingerprinting
for incremental backup system.
"""

import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional
from .utils.encryption import EncryptionManager
from .utils.logger import get_logger


class ChunkManager:
    """Manages file chunking using Content-Defined Chunking (CDC) with Rabin fingerprinting."""
    
    def __init__(self, target_chunk_size_mb: int = 50, min_chunk_size_mb: int = 25, max_chunk_size_mb: int = 75):
        """
        Initialize ChunkManager.
        
        Args:
            target_chunk_size_mb: Target chunk size in MB (default: 50MB)
            min_chunk_size_mb: Minimum chunk size in MB (default: 25MB)
            max_chunk_size_mb: Maximum chunk size in MB (default: 75MB)
        """
        self.logger = get_logger()
        self.target_chunk_size = target_chunk_size_mb * 1024 * 1024  # Convert to bytes
        self.min_chunk_size = min_chunk_size_mb * 1024 * 1024
        self.max_chunk_size = max_chunk_size_mb * 1024 * 1024
        self.encryption_manager = EncryptionManager()
        
        # Rabin fingerprinting parameters
        self.window_size = 48  # Rolling hash window size
        self.mod = 2**32
        self.base = 256
    
    def chunk_file_with_cdc(self, file_path: Path) -> List[Dict[str, Any]]:
        """
        Chunk file using content-defined chunking with Rabin fingerprinting.
        
        Args:
            file_path: Path to file to chunk
            
        Returns:
            List of chunk dictionaries with 'data', 'hash', 'size', 'offset'
        """
        chunks = []
        chunk_data = bytearray()
        window = bytearray(self.window_size)
        hash_value = 0
        file_offset = 0
        
        self.logger.info(f"Chunking file: {file_path} (target: {self.target_chunk_size / (1024*1024):.1f}MB)")
        
        try:
            with open(file_path, 'rb') as f:
                while True:
                    byte = f.read(1)
                    if not byte:
                        # Handle remaining data
                        if len(chunk_data) > 0:
                            chunk_hash = self._calculate_chunk_hash(chunk_data)
                            chunks.append({
                                'data': bytes(chunk_data),
                                'hash': chunk_hash,
                                'size': len(chunk_data),
                                'offset': file_offset - len(chunk_data)
                            })
                        break
                    
                    chunk_data.append(byte[0])
                    file_offset += 1
                    
                    # Update rolling hash (Rabin fingerprint)
                    if len(window) < self.window_size:
                        window.append(byte[0])
                        hash_value = (hash_value * self.base + byte[0]) % self.mod
                    else:
                        # Remove oldest byte, add new byte
                        old_byte = window.pop(0)
                        window.append(byte[0])
                        # Update hash: subtract old contribution, add new
                        hash_value = ((hash_value - old_byte * (self.base ** (self.window_size - 1))) * self.base + byte[0]) % self.mod
                    
                    # Break chunk if:
                    # 1. Hit minimum size AND hash matches break condition (modulo), OR
                    # 2. Hit maximum chunk size (safety limit)
                    should_break = False
                    
                    if len(chunk_data) >= self.min_chunk_size:
                        # Break when hash % break_interval == 0
                        # Adjust break_interval to control average chunk size
                        break_interval = max(1, self.target_chunk_size // 1024)  # ~50KB intervals for 50MB target
                        if hash_value % break_interval == 0:
                            should_break = True
                    
                    if len(chunk_data) >= self.max_chunk_size:
                        should_break = True
                    
                    if should_break:
                        chunk_hash = self._calculate_chunk_hash(chunk_data)
                        chunks.append({
                            'data': bytes(chunk_data),
                            'hash': chunk_hash,
                            'size': len(chunk_data),
                            'offset': file_offset - len(chunk_data)
                        })
                        chunk_data = bytearray()
                        window = bytearray(self.window_size)
                        hash_value = 0
            
            self.logger.info(f"File chunked into {len(chunks)} chunks (total: {sum(c['size'] for c in chunks) / (1024*1024):.2f}MB)")
            return chunks
            
        except Exception as e:
            self.logger.error(f"Failed to chunk file {file_path}: {e}")
            import traceback
            self.logger.error(f"Traceback: {traceback.format_exc()}")
            raise
    
    def _calculate_chunk_hash(self, data: bytes) -> str:
        """
        Calculate SHA256 hash of chunk data.
        
        Args:
            data: Chunk data
            
        Returns:
            Hex digest of SHA256 hash
        """
        return hashlib.sha256(data).hexdigest()
    
    def encrypt_chunk(self, chunk_data: bytes) -> bytes:
        """
        Encrypt chunk data using EncryptionManager.
        
        Args:
            chunk_data: Raw chunk data
            
        Returns:
            Encrypted chunk data
        """
        return self.encryption_manager.encrypt_chunk_data(chunk_data)
    
    def decrypt_chunk(self, encrypted_data: bytes) -> bytes:
        """
        Decrypt chunk data using EncryptionManager.
        
        Args:
            encrypted_data: Encrypted chunk data
            
        Returns:
            Decrypted chunk data
        """
        return self.encryption_manager.decrypt_chunk_data(encrypted_data)
    
    def decrypt_chunk_file(self, file_path: Path) -> bytes:
        """
        Decrypt chunk file from disk.
        
        Args:
            file_path: Path to encrypted chunk file
            
        Returns:
            Decrypted chunk data
        """
        return self.encryption_manager.decrypt_chunk_file(file_path)