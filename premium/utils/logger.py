"""
Premium Tab JSON Logger

A dedicated logging system for premium tab operations that organizes logs by categories
with timestamps and preserves logs across different operations.

Categories: install, uninstall, git, validate
"""

import json
import os
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from threading import Lock
from pathlib import Path


class PremiumJSONLogger:
    """JSON logger for premium tab operations with category-based organization."""
    
    VALID_CATEGORIES = {"install", "uninstall", "git", "validate", "batch_install"}
    
    def __init__(self, log_file: str = "/var/log/homeserver/premium_installer.log"):
        self.log_file = log_file
        self.lock = Lock()
        
        # Ensure log directory exists
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        
        # Initialize log structure if file doesn't exist
        self._initialize_log_structure()
    
    def _initialize_log_structure(self) -> None:
        """Initialize the JSON log structure if it doesn't exist."""
        if not os.path.exists(self.log_file):
            initial_structure = {
                category: {
                    "last_updated": None,
                    "messages": []
                }
                for category in self.VALID_CATEGORIES
            }
            
            with open(self.log_file, 'w') as f:
                json.dump(initial_structure, f, indent=2)
    
    def _load_log_data(self) -> Dict[str, Any]:
        """Load current log data from file."""
        try:
            with open(self.log_file, 'r') as f:
                data = json.load(f)
            
            # Ensure all categories exist
            for category in self.VALID_CATEGORIES:
                if category not in data:
                    data[category] = {
                        "last_updated": None,
                        "messages": []
                    }
            
            return data
        
        except (json.JSONDecodeError, FileNotFoundError):
            # If file is corrupted or missing, reinitialize
            self._initialize_log_structure()
            return self._load_log_data()
    
    def _save_log_data(self, data: Dict[str, Any]) -> None:
        """Save log data to file."""
        with open(self.log_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def clear_category(self, category: str) -> None:
        """Clear logs for a specific category."""
        if category not in self.VALID_CATEGORIES:
            raise ValueError(f"Invalid category: {category}. Must be one of {self.VALID_CATEGORIES}")
        
        with self.lock:
            data = self._load_log_data()
            data[category] = {
                "last_updated": datetime.now().isoformat(),
                "messages": []
            }
            self._save_log_data(data)
    
    def log_message(self, category: str, level: str, message: str) -> None:
        """Log a message to a specific category."""
        if category not in self.VALID_CATEGORIES:
            raise ValueError(f"Invalid category: {category}. Must be one of {self.VALID_CATEGORIES}")
        
        with self.lock:
            data = self._load_log_data()
            
            # Update timestamp and add message as simple string
            data[category]["last_updated"] = datetime.now().isoformat()
            data[category]["messages"].append(f"{level}: {message}")
            
            self._save_log_data(data)
    
    def get_category_logs(self, category: str) -> Dict[str, Any]:
        """Get logs for a specific category."""
        if category not in self.VALID_CATEGORIES:
            raise ValueError(f"Invalid category: {category}. Must be one of {self.VALID_CATEGORIES}")
        
        with self.lock:
            data = self._load_log_data()
            return data.get(category, {"last_updated": None, "messages": []})
    
    def get_all_logs(self) -> Dict[str, Any]:
        """Get all logs."""
        with self.lock:
            return self._load_log_data()


class CategoryLogger:
    """A logger wrapper that automatically categorizes logs and forwards to both console and JSON."""
    
    def __init__(self, category: str, json_logger: PremiumJSONLogger, console_logger: logging.Logger, json_level: str = "INFO"):
        if category not in PremiumJSONLogger.VALID_CATEGORIES:
            raise ValueError(f"Invalid category: {category}. Must be one of {PremiumJSONLogger.VALID_CATEGORIES}")
        
        self.category = category
        self.json_logger = json_logger
        self.console_logger = console_logger
        self.json_level = getattr(logging, json_level.upper(), logging.INFO)
        
        # Always clear this category's logs when starting a new operation
        self.json_logger.clear_category(category)
    
    def _should_log_to_json(self, level: int) -> bool:
        """Check if this log level should be written to JSON."""
        return level >= self.json_level
    
    def info(self, message: str) -> None:
        """Log an info message."""
        self.console_logger.info(message)
        if self._should_log_to_json(logging.INFO):
            self.json_logger.log_message(self.category, "info", message)
    
    def error(self, message: str) -> None:
        """Log an error message."""
        self.console_logger.error(message)
        if self._should_log_to_json(logging.ERROR):
            self.json_logger.log_message(self.category, "error", message)
    
    def warning(self, message: str) -> None:
        """Log a warning message."""
        self.console_logger.warning(message)
        if self._should_log_to_json(logging.WARNING):
            self.json_logger.log_message(self.category, "warning", message)
    
    def debug(self, message: str) -> None:
        """Log a debug message."""
        self.console_logger.debug(message)
        if self._should_log_to_json(logging.DEBUG):
            self.json_logger.log_message(self.category, "debug", message)


def create_category_logger(category: str, console_logger: logging.Logger, 
                          log_file: str = "/var/log/homeserver/premium_installer.log",
                          json_level: str = "INFO") -> CategoryLogger:
    """Create a category logger for a specific operation."""
    json_logger = PremiumJSONLogger(log_file)
    return CategoryLogger(category, json_logger, console_logger, json_level) 