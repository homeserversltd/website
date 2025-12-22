#!/usr/bin/env python3
"""
HOMESERVER Chunk Database
Copyright (C) 2024 HOMESERVER LLC

SQLite database for tracking chunks, backups, and file metadata
for incremental chunked backup system.
"""

import sqlite3
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from .utils.logger import get_logger


class ChunkDatabase:
    """Manages SQLite database for chunk tracking and backup metadata."""
    
    def __init__(self, db_path: str = "/var/www/homeserver/premium/backup/chunks.db"):
        """
        Initialize ChunkDatabase.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.logger = get_logger()
        self.db_path = Path(db_path)
        
        # Ensure directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize database schema
        self._init_database()
    
    def _init_database(self):
        """Initialize database schema if it doesn't exist."""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        try:
            # Create chunks table - Global chunk registry (deduplication)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chunks (
                    chunk_hash TEXT PRIMARY KEY,
                    size INTEGER NOT NULL,
                    encrypted_size INTEGER NOT NULL,
                    remote_path TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    first_seen_backup_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    checksum TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_provider ON chunks(provider)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_created ON chunks(created_at)")
            
            # Create backups table - Backup snapshots metadata
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS backups (
                    backup_id TEXT PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    total_size INTEGER,
                    total_chunks INTEGER,
                    uploaded_bytes INTEGER,
                    reused_chunks INTEGER,
                    status TEXT DEFAULT 'in_progress',
                    provider TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status)")
            
            # Create backup_files table - Files in each backup
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS backup_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    backup_id TEXT NOT NULL,
                    original_path TEXT NOT NULL,
                    file_type TEXT,
                    size INTEGER,
                    file_hash TEXT,
                    mtime TIMESTAMP,
                    chunk_count INTEGER,
                    FOREIGN KEY (backup_id) REFERENCES backups(backup_id)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_backup_files_backup ON backup_files(backup_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_backup_files_path ON backup_files(original_path)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_backup_files_hash ON backup_files(file_hash)")
            
            # Create backup_chunk_mappings table - File → chunk relationships
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS backup_chunk_mappings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    backup_id TEXT NOT NULL,
                    file_id INTEGER NOT NULL,
                    chunk_hash TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    FOREIGN KEY (backup_id) REFERENCES backups(backup_id),
                    FOREIGN KEY (file_id) REFERENCES backup_files(id),
                    FOREIGN KEY (chunk_hash) REFERENCES chunks(chunk_hash),
                    UNIQUE(backup_id, file_id, chunk_index)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mappings_backup_file ON backup_chunk_mappings(backup_id, file_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_mappings_chunk ON backup_chunk_mappings(chunk_hash)")
            
            # Create file_metadata table - Quick change detection cache
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS file_metadata (
                    original_path TEXT PRIMARY KEY,
                    last_backup_id TEXT,
                    last_file_hash TEXT,
                    last_size INTEGER,
                    last_mtime TIMESTAMP,
                    last_chunk_count INTEGER,
                    FOREIGN KEY (last_backup_id) REFERENCES backups(backup_id)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_file_metadata_backup ON file_metadata(last_backup_id)")
            
            conn.commit()
            self.logger.info(f"Database initialized: {self.db_path}")
            
        except Exception as e:
            conn.rollback()
            self.logger.error(f"Failed to initialize database: {e}")
            raise
        finally:
            conn.close()
    
    def create_backup(self, backup_id: str, provider_name: str) -> bool:
        """
        Create a new backup record.
        
        Args:
            backup_id: Unique backup identifier
            provider_name: Provider name used for this backup
            
        Returns:
            True if successful
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO backups (backup_id, provider, status)
                VALUES (?, ?, 'in_progress')
            """, (backup_id, provider_name))
            conn.commit()
            self.logger.info(f"Created backup record: {backup_id}")
            return True
        except Exception as e:
            conn.rollback()
            self.logger.error(f"Failed to create backup record: {e}")
            return False
        finally:
            conn.close()
    
    def store_chunk(self, chunk_hash: str, size: int, encrypted_size: int, 
                   remote_path: str, provider: str, first_seen_backup_id: str) -> bool:
        """
        Store chunk in global registry (deduplication).
        
        Args:
            chunk_hash: SHA256 hash of chunk content
            size: Original chunk size in bytes
            encrypted_size: Size after encryption
            remote_path: Provider storage path
            provider: Provider name
            first_seen_backup_id: First backup that created this chunk
            
        Returns:
            True if successful
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO chunks 
                (chunk_hash, size, encrypted_size, remote_path, provider, first_seen_backup_id)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (chunk_hash, size, encrypted_size, remote_path, provider, first_seen_backup_id))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            self.logger.error(f"Failed to store chunk: {e}")
            return False
        finally:
            conn.close()
    
    def get_chunk_by_hash(self, chunk_hash: str) -> Optional[Dict[str, Any]]:
        """
        Get chunk information by hash.
        
        Args:
            chunk_hash: SHA256 hash of chunk
            
        Returns:
            Chunk dictionary or None if not found
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT * FROM chunks WHERE chunk_hash = ?
            """, (chunk_hash,))
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None
        finally:
            conn.close()
    
    def create_backup_file(self, backup_id: str, original_path: str, size: int,
                          file_hash: str, chunk_count: int, file_type: str = "file",
                          mtime: Optional[datetime] = None) -> Optional[int]:
        """
        Create backup_file record.
        
        Args:
            backup_id: Backup identifier
            original_path: Original file path
            size: File size in bytes
            file_hash: SHA256 hash of entire file
            chunk_count: Number of chunks this file spans
            file_type: Type of file (file, directory)
            mtime: Last modification time
            
        Returns:
            File record ID or None if failed
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO backup_files 
                (backup_id, original_path, file_type, size, file_hash, mtime, chunk_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (backup_id, original_path, file_type, size, file_hash, mtime, chunk_count))
            conn.commit()
            file_id = cursor.lastrowid
            return file_id
        except Exception as e:
            conn.rollback()
            self.logger.error(f"Failed to create backup_file record: {e}")
            return None
        finally:
            conn.close()
    
    def create_chunk_mapping(self, backup_id: str, file_id: int, chunk_hash: str, 
                            chunk_index: int) -> bool:
        """
        Create mapping between file and chunk.
        
        Args:
            backup_id: Backup identifier
            file_id: File record ID
            chunk_hash: Chunk hash
            chunk_index: Order of chunk in file (0, 1, 2, ...)
            
        Returns:
            True if successful
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO backup_chunk_mappings 
                (backup_id, file_id, chunk_hash, chunk_index)
                VALUES (?, ?, ?, ?)
            """, (backup_id, file_id, chunk_hash, chunk_index))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            self.logger.error(f"Failed to create chunk mapping: {e}")
            return False
        finally:
            conn.close()
    
    def get_chunks_for_file(self, original_path: str, backup_id: str) -> List[Dict[str, Any]]:
        """
        Get all chunks for a file in a specific backup.
        
        Args:
            original_path: Original file path
            backup_id: Backup identifier
            
        Returns:
            List of chunk mappings sorted by chunk_index
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT m.chunk_hash, m.chunk_index, c.remote_path, c.provider, c.size, c.encrypted_size
                FROM backup_chunk_mappings m
                JOIN backup_files f ON m.file_id = f.id
                JOIN chunks c ON m.chunk_hash = c.chunk_hash
                WHERE f.original_path = ? AND f.backup_id = ?
                ORDER BY m.chunk_index
            """, (original_path, backup_id))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()
    
    def get_file_metadata(self, original_path: str) -> Optional[Dict[str, Any]]:
        """
        Get file metadata for quick change detection.
        
        Args:
            original_path: Original file path
            
        Returns:
            File metadata dictionary or None if not found
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT * FROM file_metadata WHERE original_path = ?
            """, (original_path,))
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None
        finally:
            conn.close()
    
    def update_file_metadata(self, original_path: str, last_backup_id: str,
                            file_hash: str, size: int, chunk_count: int,
                            mtime: Optional[datetime] = None) -> bool:
        """
        Update file metadata cache.
        
        Args:
            original_path: Original file path
            last_backup_id: Last backup that included this file
            file_hash: SHA256 hash of entire file
            size: File size in bytes
            chunk_count: Number of chunks
            mtime: Last modification time
            
        Returns:
            True if successful
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO file_metadata
                (original_path, last_backup_id, last_file_hash, last_size, last_mtime, last_chunk_count)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (original_path, last_backup_id, file_hash, size, mtime, chunk_count))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            self.logger.error(f"Failed to update file metadata: {e}")
            return False
        finally:
            conn.close()
    
    def get_chunks_for_restore(self, backup_id: str, target_paths: List[str]) -> List[Dict[str, Any]]:
        """
        Get all chunks needed to restore specified paths from a backup.
        
        Args:
            backup_id: Backup identifier
            target_paths: List of paths to restore
            
        Returns:
            List of unique chunks with provider information
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            # Build query with path matching
            placeholders = ','.join(['?' for _ in target_paths])
            cursor.execute(f"""
                SELECT DISTINCT c.chunk_hash, c.remote_path, c.provider, c.size, c.encrypted_size
                FROM backup_chunk_mappings m
                JOIN backup_files f ON m.file_id = f.id
                JOIN chunks c ON m.chunk_hash = c.chunk_hash
                WHERE f.backup_id = ? AND f.original_path IN ({placeholders})
            """, [backup_id] + target_paths)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()
    
    def get_files_for_restore(self, backup_id: str, target_paths: List[str]) -> List[Dict[str, Any]]:
        """
        Get file records for restore operation.
        
        Args:
            backup_id: Backup identifier
            target_paths: List of paths to restore
            
        Returns:
            List of file records
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            placeholders = ','.join(['?' for _ in target_paths])
            cursor.execute(f"""
                SELECT * FROM backup_files
                WHERE backup_id = ? AND original_path IN ({placeholders})
            """, [backup_id] + target_paths)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()
    
    def get_chunk_mappings_for_file(self, backup_id: str, file_id: int) -> List[Dict[str, Any]]:
        """
        Get chunk mappings for a specific file, sorted by index.
        
        Args:
            backup_id: Backup identifier
            file_id: File record ID
            
        Returns:
            List of chunk mappings sorted by chunk_index
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT * FROM backup_chunk_mappings
                WHERE backup_id = ? AND file_id = ?
                ORDER BY chunk_index
            """, (backup_id, file_id))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()
    
    def update_backup(self, backup_id: str, total_chunks: int, uploaded_bytes: int,
                     reused_chunks: int, status: str = 'completed') -> bool:
        """
        Update backup statistics.
        
        Args:
            backup_id: Backup identifier
            total_chunks: Total number of chunks in backup
            uploaded_bytes: Bytes actually uploaded (after dedup)
            reused_chunks: Number of chunks reused from previous backups
            status: Backup status (in_progress, completed, failed)
            
        Returns:
            True if successful
        """
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        try:
            # Calculate total size from chunks
            cursor.execute("""
                SELECT SUM(c.size) FROM backup_chunk_mappings m
                JOIN chunks c ON m.chunk_hash = c.chunk_hash
                WHERE m.backup_id = ?
            """, (backup_id,))
            result = cursor.fetchone()
            total_size = result[0] if result[0] else 0
            
            cursor.execute("""
                UPDATE backups
                SET total_chunks = ?, uploaded_bytes = ?, reused_chunks = ?, 
                    status = ?, total_size = ?
                WHERE backup_id = ?
            """, (total_chunks, uploaded_bytes, reused_chunks, status, total_size, backup_id))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            self.logger.error(f"Failed to update backup: {e}")
            return False
        finally:
            conn.close()
    
    def list_backups(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        List recent backups.
        
        Args:
            limit: Maximum number of backups to return
            
        Returns:
            List of backup records
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT * FROM backups
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()