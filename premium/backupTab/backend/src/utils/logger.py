#!/usr/bin/env python3
"""
HOMESERVER Backup Logger Utility
Copyright (C) 2024 HOMESERVER LLC

Centralized logging utility for backup operations.
"""

import os
import sys
import logging
import logging.handlers
from pathlib import Path
from typing import Optional, Dict, Any


class BackupLogger:
    """Centralized logger for backup operations."""
    
    _instance: Optional['BackupLogger'] = None
    _logger: Optional[logging.Logger] = None
    
    def __new__(cls) -> 'BackupLogger':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._logger is None:
            self._setup_logger()
    
    def _setup_logger(self) -> None:
        """Setup the backup logger with file and console handlers."""
        self._logger = logging.getLogger('homeserver_backup')
        self._logger.setLevel(logging.DEBUG)
        
        # Prevent duplicate handlers
        if self._logger.handlers:
            return
        
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # Console handler (for CLI operations)
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(formatter)
        self._logger.addHandler(console_handler)
    
    def configure_file_logging(self, log_config: Dict[str, Any]) -> None:
        """Configure file logging based on config."""
        if not log_config.get('enabled', True):
            return
        
        log_file = log_config.get('log_file', '/var/log/homeserver/backup.log')
        log_level = getattr(logging, log_config.get('log_level', 'INFO').upper())
        max_bytes = log_config.get('max_file_size_mb', 10) * 1024 * 1024
        backup_count = log_config.get('backup_count', 5)
        
        # Ensure log directory exists
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        # File handler with rotation
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=max_bytes,
            backupCount=backup_count
        )
        file_handler.setLevel(log_level)
        
        # Use custom formatter if specified
        log_format = log_config.get('format', '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        formatter = logging.Formatter(log_format, datefmt='%Y-%m-%d %H:%M:%S')
        file_handler.setFormatter(formatter)
        
        self._logger.addHandler(file_handler)
    
    def debug(self, message: str) -> None:
        """Log debug message."""
        self._logger.debug(message)
    
    def info(self, message: str) -> None:
        """Log info message."""
        self._logger.info(message)
    
    def warning(self, message: str) -> None:
        """Log warning message."""
        self._logger.warning(message)
    
    def error(self, message: str) -> None:
        """Log error message."""
        self._logger.error(message)
    
    def critical(self, message: str) -> None:
        """Log critical message."""
        self._logger.critical(message)
    
    def exception(self, message: str) -> None:
        """Log exception with traceback."""
        self._logger.exception(message)
    
    def log_backup_start(self, items: list, providers: list) -> None:
        """Log backup operation start."""
        self.info(f"Starting backup operation")
        self.info(f"Backup items: {items}")
        self.info(f"Enabled providers: {providers}")
    
    def log_backup_success(self, backup_path: str, upload_results: dict) -> None:
        """Log successful backup completion."""
        self.info(f"Backup completed successfully: {backup_path}")
        for provider, success in upload_results.items():
            status = "✓" if success else "✗"
            self.info(f"  {status} Upload to {provider}")
    
    def log_backup_failure(self, error: str) -> None:
        """Log backup failure."""
        self.error(f"Backup failed: {error}")
    
    def log_provider_operation(self, provider: str, operation: str, success: bool, details: str = "") -> None:
        """Log provider-specific operation."""
        status = "✓" if success else "✗"
        message = f"{status} {provider} {operation}"
        if details:
            message += f" - {details}"
        
        if success:
            self.info(message)
        else:
            self.error(message)
    
    def log_credential_operation(self, provider: str, operation: str, success: bool) -> None:
        """Log credential management operation."""
        status = "✓" if success else "✗"
        self.info(f"{status} Credential {operation} for {provider}")


def get_logger() -> BackupLogger:
    """Get the singleton backup logger instance."""
    return BackupLogger()