"""
Provider Factory with Keyman Integration
Copyright (C) 2024 HOMESERVER LLC

Factory for creating backup providers with keyman credential integration.
"""

from typing import Dict, Any, Optional, Type
from .base import BaseProvider
from .backblaze import BackblazeProvider
from .local import LocalProvider
from ..utils.keyman_integration import KeymanIntegration
import logging

class ProviderFactory:
    """Factory for creating backup providers with keyman integration."""
    
    def __init__(self):
        self.logger = logging.getLogger('backend.backupTab.utils')
        self.keyman = KeymanIntegration()
        
        # Registry of available providers
        self.providers = {
            'backblaze': BackblazeProvider,
            'local': LocalProvider,
            # Add other providers as they're implemented
        }
    
    def create_provider(self, provider_name: str, config: Dict[str, Any]) -> Optional[BaseProvider]:
        """
        Create a provider instance with keyman integration.
        
        Args:
            provider_name: Name of the provider to create
            config: Configuration dictionary
            
        Returns:
            Provider instance or None if creation failed
        """
        if provider_name not in self.providers:
            self.logger.error(f"Unknown provider: {provider_name}")
            return None
        
        try:
            # Check if keyman integration is enabled for this provider
            keyman_integrated = config.get('keyman_integrated', False)
            
            if keyman_integrated:
                # Use keyman integration
                keyman_service_name = config.get('keyman_service_name', provider_name)
                provider_config = self._get_provider_config_with_keyman(keyman_service_name, config)
            else:
                # Use traditional config
                provider_config = config
            
            # Create provider instance
            provider_class = self.providers[provider_name]
            provider = provider_class(provider_config)
            
            self.logger.info(f"Created {provider_name} provider with keyman_integrated={keyman_integrated}")
            return provider
            
        except Exception as e:
            self.logger.error(f"Failed to create {provider_name} provider: {e}")
            return None
    
    def _get_provider_config_with_keyman(self, service_name: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get provider configuration by combining keyman credentials with additional config.
        """
        # Get credentials from keyman
        credentials = self.keyman.get_service_credentials(service_name)
        
        if not credentials:
            self.logger.warning(f"No keyman credentials found for {service_name}, using fallback")
            # Use fallback credentials if available
            fallback_creds = config.get('fallback_credentials', {})
            credentials = {
                'username': fallback_creds.get('application_key_id', ''),
                'password': fallback_creds.get('application_key', '')
            }
        
        # Create provider config
        provider_config = config.copy()
        
        # Add credentials
        if service_name == 'backblaze':
            provider_config['application_key_id'] = credentials.get('username', '')
            provider_config['application_key'] = credentials.get('password', '')
        else:
            # For other providers, use standard username/password
            provider_config['username'] = credentials.get('username', '')
            provider_config['password'] = credentials.get('password', '')
        
        # Add keyman integration flag
        provider_config['keyman_integrated'] = True
        
        return provider_config
    
    def is_provider_configured(self, provider_name: str) -> bool:
        """
        Check if a provider is configured (has keyman credentials or config).
        """
        # Check keyman first
        if self.keyman.service_configured(provider_name):
            return True
        
        # Check if provider has fallback credentials
        # This would need to be implemented based on your config structure
        return False
    
    def get_configured_providers(self) -> list:
        """Get list of all configured providers."""
        configured = []
        
        # Get keyman-configured providers
        keyman_services = self.keyman.get_configured_services()
        for service in keyman_services:
            if service in self.providers:
                configured.append(service)
        
        return configured
    
    def get_provider_status(self, provider_name: str) -> Dict[str, Any]:
        """
        Get status information for a provider.
        """
        status = {
            'name': provider_name,
            'available': provider_name in self.providers,
            'keyman_configured': self.keyman.service_configured(provider_name),
            'credentials_available': False
        }
        
        if status['keyman_configured']:
            credentials = self.keyman.get_service_credentials(provider_name)
            status['credentials_available'] = credentials is not None
        
        return status
    
    def register_provider(self, name: str, provider_class: Type[BaseProvider]):
        """Register a new provider class."""
        self.providers[name] = provider_class
        self.logger.info(f"Registered provider: {name}")
    
    def list_available_providers(self) -> list:
        """Get list of all available provider names."""
        return list(self.providers.keys())