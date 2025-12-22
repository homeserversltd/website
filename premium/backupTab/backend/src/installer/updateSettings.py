#!/usr/bin/env python3
"""
HOMESERVER Backup Settings Update Utility
Copyright (C) 2024 HOMESERVER LLC

Intelligently merges new fields from template settings.json into existing system configuration
without damaging user's custom configuration.
"""

import json
import shutil
import sys
from pathlib import Path
from typing import Dict, Any, List, Set, Union
from datetime import datetime


class SettingsUpdater:
    """Handles intelligent merging of backup settings configuration."""
    
    def __init__(self, template_path: str = None, system_path: str = None):
        self.template_path = Path(template_path or "src/config/settings.json")
        self.system_path = Path(system_path or "/var/www/homeserver/premium/backup/settings.json")
        self.backup_path = self.system_path.with_suffix(f".backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        
    def log(self, message: str, level: str = "INFO") -> None:
        """Log update messages."""
        prefix = {
            "INFO": "✓",
            "WARNING": "⚠", 
            "ERROR": "✗",
            "DEBUG": "→"
        }.get(level, "•")
        
        print(f"{prefix} {message}")
    
    def load_json(self, file_path: Path) -> Dict[str, Any]:
        """Load JSON file with error handling."""
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            self.log(f"File not found: {file_path}", "ERROR")
            return {}
        except json.JSONDecodeError as e:
            self.log(f"Invalid JSON in {file_path}: {e}", "ERROR")
            return {}
        except Exception as e:
            self.log(f"Error loading {file_path}: {e}", "ERROR")
            return {}
    
    def save_json(self, data: Dict[str, Any], file_path: Path) -> bool:
        """Save JSON file with error handling."""
        try:
            # Create backup of existing file
            if file_path.exists():
                shutil.copy2(file_path, self.backup_path)
                self.log(f"Created backup: {self.backup_path}")
            
            # Ensure directory exists
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write new file
            with open(file_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            self.log(f"Updated configuration: {file_path}")
            return True
            
        except Exception as e:
            self.log(f"Failed to save {file_path}: {e}", "ERROR")
            return False
    
    def get_all_keys(self, data: Dict[str, Any], prefix: str = "") -> Set[str]:
        """Recursively get all keys from nested dictionary."""
        keys = set()
        
        for key, value in data.items():
            full_key = f"{prefix}.{key}" if prefix else key
            keys.add(full_key)
            
            if isinstance(value, dict):
                keys.update(self.get_all_keys(value, full_key))
        
        return keys
    
    def get_nested_value(self, data: Dict[str, Any], key_path: str) -> Any:
        """Get value from nested dictionary using dot notation."""
        keys = key_path.split('.')
        current = data
        
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None
        
        return current
    
    def set_nested_value(self, data: Dict[str, Any], key_path: str, value: Any) -> None:
        """Set value in nested dictionary using dot notation."""
        keys = key_path.split('.')
        current = data
        
        # Navigate to the parent of the target key
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            current = current[key]
        
        # Set the final value
        current[keys[-1]] = value
    
    def merge_configurations(self, template: Dict[str, Any], system: Dict[str, Any]) -> Dict[str, Any]:
        """Intelligently merge template into system configuration."""
        self.log("Analyzing configuration differences...")
        
        # Get all keys from both configurations
        template_keys = self.get_all_keys(template)
        system_keys = self.get_all_keys(system)
        
        # Find new keys in template that don't exist in system
        new_keys = template_keys - system_keys
        existing_keys = template_keys & system_keys
        
        self.log(f"Found {len(new_keys)} new fields to add")
        self.log(f"Found {len(existing_keys)} existing fields to preserve")
        
        # Start with system configuration (preserves user settings)
        merged = system.copy()
        
        # Add new fields from template
        added_fields = []
        for key_path in sorted(new_keys):
            template_value = self.get_nested_value(template, key_path)
            if template_value is not None:
                self.set_nested_value(merged, key_path, template_value)
                added_fields.append(key_path)
                self.log(f"Added new field: {key_path}", "DEBUG")
        
        # Handle special cases for provider configurations
        self._merge_provider_configs(template, merged)
        
        self.log(f"Successfully added {len(added_fields)} new configuration fields")
        return merged
    
    def _merge_provider_configs(self, template: Dict[str, Any], merged: Dict[str, Any]) -> None:
        """Handle special merging logic for provider configurations."""
        template_providers = template.get('providers', {})
        merged_providers = merged.get('providers', {})
        
        for provider_name, template_provider in template_providers.items():
            if provider_name not in merged_providers:
                # Add completely new provider
                merged_providers[provider_name] = template_provider.copy()
                self.log(f"Added new provider: {provider_name}")
            else:
                # Merge new fields into existing provider
                existing_provider = merged_providers[provider_name]
                new_fields = []
                
                for field_name, field_value in template_provider.items():
                    if field_name not in existing_provider:
                        existing_provider[field_name] = field_value
                        new_fields.append(field_name)
                
                if new_fields:
                    self.log(f"Added {len(new_fields)} new fields to provider '{provider_name}': {', '.join(new_fields)}")
    
    def validate_configuration(self, config: Dict[str, Any]) -> bool:
        """Validate merged configuration structure."""
        self.log("Validating merged configuration...")
        
        required_fields = ['backup_items', 'providers', 'state']
        
        for field in required_fields:
            if field not in config:
                self.log(f"Missing required field: {field}", "ERROR")
                return False
        
        # Validate state section has required fields
        state = config.get('state', {})
        required_state_fields = ['encryption_enabled', 'backup_count']
        for field in required_state_fields:
            if field not in state:
                self.log(f"Missing required state field: {field}", "ERROR")
                return False
        
        # Validate providers structure
        providers = config.get('providers', {})
        if not isinstance(providers, dict):
            self.log("Invalid providers structure", "ERROR")
            return False
        
        # Validate each provider has required fields
        for provider_name, provider_config in providers.items():
            if not isinstance(provider_config, dict):
                self.log(f"Invalid provider '{provider_name}' structure", "ERROR")
                return False
            
            if 'enabled' not in provider_config:
                self.log(f"Provider '{provider_name}' missing 'enabled' field", "WARNING")
                provider_config['enabled'] = False
        
        self.log("Configuration validation passed")
        return True
    
    def update_settings(self) -> bool:
        """Main method to update settings configuration."""
        self.log("Starting backup settings update...")
        
        # Load template and system configurations
        template_config = self.load_json(self.template_path)
        if not template_config:
            self.log("Failed to load template configuration", "ERROR")
            return False
        
        system_config = self.load_json(self.system_path)
        if not system_config:
            self.log("System configuration not found, creating from template", "WARNING")
            system_config = {}
        
        # Merge configurations
        merged_config = self.merge_configurations(template_config, system_config)
        
        # Validate merged configuration
        if not self.validate_configuration(merged_config):
            self.log("Configuration validation failed", "ERROR")
            return False
        
        # Save updated configuration
        if not self.save_json(merged_config, self.system_path):
            self.log("Failed to save updated configuration", "ERROR")
            return False
        
        self.log("Settings update completed successfully!")
        return True
    
    def show_differences(self) -> None:
        """Show differences between template and system configuration."""
        self.log("Analyzing configuration differences...")
        
        template_config = self.load_json(self.template_path)
        system_config = self.load_json(self.system_path)
        
        if not template_config:
            self.log("Template configuration not found", "ERROR")
            return
        
        if not system_config:
            self.log("System configuration not found", "ERROR")
            return
        
        template_keys = self.get_all_keys(template_config)
        system_keys = self.get_all_keys(system_config)
        
        new_keys = template_keys - system_keys
        removed_keys = system_keys - template_keys
        common_keys = template_keys & system_keys
        
        self.log(f"Template has {len(template_keys)} fields")
        self.log(f"System has {len(system_keys)} fields")
        self.log(f"New fields to add: {len(new_keys)}")
        self.log(f"Fields to remove: {len(removed_keys)}")
        self.log(f"Common fields: {len(common_keys)}")
        
        if new_keys:
            self.log("New fields that would be added:")
            for key in sorted(new_keys):
                self.log(f"  + {key}")
        
        if removed_keys:
            self.log("Fields that would be removed:")
            for key in sorted(removed_keys):
                self.log(f"  - {key}")


def main():
    """Main entry point for settings update utility."""
    import argparse
    
    parser = argparse.ArgumentParser(description="HOMESERVER Backup Settings Update Utility")
    parser.add_argument("--template", help="Path to template settings.json")
    parser.add_argument("--system", help="Path to system settings.json")
    parser.add_argument("--dry-run", action="store_true", help="Show differences without updating")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose output")
    
    args = parser.parse_args()
    
    updater = SettingsUpdater(
        template_path=args.template,
        system_path=args.system
    )
    
    if args.dry_run:
        updater.show_differences()
        return
    
    success = updater.update_settings()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()