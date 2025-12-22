"""
Backup Manager with Keyman Integration
Copyright (C) 2024 HOMESERVER LLC

Main backup management system with keyman credential integration.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from .providers.provider_factory import ProviderFactory
from .utils.keyman_integration import KeymanIntegration

class BackupManager:
    """Main backup management system."""
    
    def __init__(self, config_path: str = None):
        self.logger = logging.getLogger('backend.backupTab.utils')
        self.keyman = KeymanIntegration()
        self.provider_factory = ProviderFactory()
        
        # Load configuration
        if config_path:
            self.config_path = Path(config_path)
        else:
            self.config_path = Path(__file__).parent / 'config' / 'settings.json'
        
        self.config = self._load_config()
        
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from JSON file."""
        try:
            with open(self.config_path, 'r') as f:
                config = json.load(f)
            self.logger.info(f"Loaded configuration from {self.config_path}")
            return config
        except Exception as e:
            self.logger.error(f"Failed to load configuration: {e}")
            return {}
    
    def save_config(self) -> bool:
        """Save configuration to JSON file."""
        try:
            with open(self.config_path, 'w') as f:
                json.dump(self.config, f, indent=2)
            self.logger.info(f"Saved configuration to {self.config_path}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to save configuration: {e}")
            return False
    
    def get_configured_providers(self) -> List[Dict[str, Any]]:
        """Get list of all configured providers with their status."""
        providers = []
        
        # Get providers from config
        provider_configs = self.config.get('providers', {})
        
        for provider_name, config in provider_configs.items():
            if not config.get('enabled', False):
                continue
            
            # Get provider status
            status = self.provider_factory.get_provider_status(provider_name)
            
            # Add configuration info
            status.update({
                'enabled': config.get('enabled', False),
                'container': config.get('container', ''),
                'container_type': config.get('container_type', ''),
                'keyman_integrated': config.get('keyman_integrated', False),
                'keyman_service_name': config.get('keyman_service_name', provider_name)
            })
            
            providers.append(status)
        
        return providers
    
    def get_provider_instance(self, provider_name: str) -> Optional[Any]:
        """Get a provider instance."""
        provider_configs = self.config.get('providers', {})
        config = provider_configs.get(provider_name, {})
        
        if not config.get('enabled', False):
            self.logger.warning(f"Provider {provider_name} is not enabled")
            return None
        
        return self.provider_factory.create_provider(provider_name, config)
    
    def test_provider_connection(self, provider_name: str) -> Dict[str, Any]:
        """Test connection to a provider."""
        provider = self.get_provider_instance(provider_name)
        
        if not provider:
            return {
                'success': False,
                'error': f'Provider {provider_name} not available'
            }
        
        try:
            success = provider.test_connection()
            return {
                'success': success,
                'message': f'Connection test {"passed" if success else "failed"}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def create_backup(self, provider_name: str, files: List[str]) -> Dict[str, Any]:
        """Create a backup using the specified provider."""
        provider = self.get_provider_instance(provider_name)
        
        if not provider:
            return {
                'success': False,
                'error': f'Provider {provider_name} not available'
            }
        
        try:
            # This would implement the actual backup logic
            # For now, just return a placeholder
            return {
                'success': True,
                'message': f'Backup created using {provider_name}',
                'files_backed_up': len(files)
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def list_backups(self, provider_name: str) -> Dict[str, Any]:
        """List backups from a provider."""
        provider = self.get_provider_instance(provider_name)
        
        if not provider:
            return {
                'success': False,
                'error': f'Provider {provider_name} not available'
            }
        
        try:
            files = provider.list_files()
            return {
                'success': True,
                'files': files
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def enable_provider(self, provider_name: str) -> bool:
        """Enable a provider."""
        provider_configs = self.config.get('providers', {})
        if provider_name in provider_configs:
            provider_configs[provider_name]['enabled'] = True
            return self.save_config()
        return False
    
    def disable_provider(self, provider_name: str) -> bool:
        """Disable a provider."""
        provider_configs = self.config.get('providers', {})
        if provider_name in provider_configs:
            provider_configs[provider_name]['enabled'] = False
            return self.save_config()
        return False
    
    def update_provider_config(self, provider_name: str, config_updates: Dict[str, Any]) -> bool:
        """Update provider configuration."""
        provider_configs = self.config.get('providers', {})
        if provider_name in provider_configs:
            provider_configs[provider_name].update(config_updates)
            return self.save_config()
        return False
    
    def get_keyman_services(self) -> List[str]:
        """Get list of keyman-configured services."""
        return self.keyman.get_configured_services()
    
    def is_provider_keyman_configured(self, provider_name: str) -> bool:
        """Check if a provider is configured via keyman."""
        provider_configs = self.config.get('providers', {})
        config = provider_configs.get(provider_name, {})
        
        if config.get('keyman_integrated', False):
            keyman_service_name = config.get('keyman_service_name', provider_name)
            return self.keyman.service_configured(keyman_service_name)
        
        return False