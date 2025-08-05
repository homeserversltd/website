"""Service status monitoring functionality."""
import json
import time
from typing import Dict, List, Optional
from flask import current_app
from backend.indicators.utils import collect_services_status
from backend.utils.utils import execute_systemctl_command

# Global cache for service enabled states
_SERVICE_ENABLED_CACHE = {}
_SERVICE_ENABLED_CACHE_TIME = {}
_SERVICE_ENABLED_CACHE_TTL = 60  # Cache for 60 seconds

class ServicesMonitor:
    """Monitor status of configured services."""
    
    def __init__(self, check_interval: int = 2):  # Use config default of 4 seconds
        self.check_interval = check_interval
        self.service_mapping = self._load_service_mapping()
        
    def _load_service_mapping(self) -> Dict[str, List[str]]:
        """
        Load service mapping from homeserver.json.
        Maps portal names to their actual service names.
        """
        try:
            with open(current_app.config['HOMESERVER_CONFIG'], 'r') as f:
                config = json.load(f)
                portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
                
                # Create a mapping of portal names to service names
                mapping = {}
                for portal in portals:
                    name = portal.get('name')
                    services = portal.get('services', [])
                    if name and services:
                        mapping[name] = services
                
                current_app.logger.debug(f"Loaded service mapping: {mapping}")
                return mapping
        except Exception as e:
            current_app.logger.error(f"Error loading service mapping: {e}")
            return {}
        
    def _check_service_enabled(self, service_name: str) -> bool:
        """
        Check if a service is enabled using systemctl is-enabled, with caching.
        
        Args:
            service_name: Name of the service to check
            
        Returns:
            bool: True if service is enabled, False otherwise
        """
        global _SERVICE_ENABLED_CACHE, _SERVICE_ENABLED_CACHE_TIME, _SERVICE_ENABLED_CACHE_TTL
        
        # Normalize service name
        if not service_name.endswith('.service'):
            service_with_suffix = f"{service_name}.service"
        else:
            service_with_suffix = service_name
            
        # Check cache first
        current_time = time.time()
        if (service_with_suffix in _SERVICE_ENABLED_CACHE and 
            current_time - _SERVICE_ENABLED_CACHE_TIME.get(service_with_suffix, 0) < _SERVICE_ENABLED_CACHE_TTL):
            current_app.logger.debug(f"[SERVICES] Using cached enabled state for {service_with_suffix}")
            return _SERVICE_ENABLED_CACHE[service_with_suffix]
        
        try:
            # Cache miss or expired - check actual service state
            current_app.logger.debug(f"[SERVICES] Cache miss/expired for {service_with_suffix} - checking enabled state")
            
            # Use the utility function from utils.py
            success, output = execute_systemctl_command('is-enabled', service_with_suffix)
            
            # Check if the output contains 'enabled' (case insensitive)
            is_enabled = success and output.strip().lower() == 'enabled'
            
            # Update cache
            _SERVICE_ENABLED_CACHE[service_with_suffix] = is_enabled
            _SERVICE_ENABLED_CACHE_TIME[service_with_suffix] = current_time
            
            current_app.logger.debug(f"[SERVICES] Updated cache for {service_with_suffix}: {is_enabled}")
            return is_enabled
        except Exception as e:
            current_app.logger.error(f"[SERVICES] Error checking if {service_name} is enabled: {e}")
            return False
        
    def collect_status(self) -> List[Dict]:
        """Collect status information for all configured services."""
        try:
            services = collect_services_status()
            
            # For each service, add enabled status (admin-only field)
            for service in services:
                service_name = service.get('name')
                if service_name:
                    # Get the actual service names from the mapping
                    actual_services = self.service_mapping.get(service_name, [])
                    
                    # If we have actual service names from the mapping, use those
                    if actual_services:
                        # Check if any of the services are enabled - now with caching
                        service['isEnabled'] = any(self._check_service_enabled(svc) for svc in actual_services)
                        
                        # Add systemd-specific status information
                        systemd_statuses = []
                        for svc in actual_services:
                            is_enabled = self._check_service_enabled(svc)
                            systemd_statuses.append(f"{svc}: {'enabled' if is_enabled else 'disabled'}")
                        service['systemd_status'] = " | ".join(systemd_statuses)
                    else:
                        # Fallback to using the service identifier
                        service_id = service.get('service')
                        if service_id:
                            service['isEnabled'] = self._check_service_enabled(service_id)
                            service['systemd_status'] = f"{service_id}: {'enabled' if service['isEnabled'] else 'disabled'}"
                        else:
                            service['isEnabled'] = False
                            service['systemd_status'] = "No systemd service configured"
                    
            return services
        except Exception as e:
            current_app.logger.error(f'[SERVICES] Error collecting services status: {e}')
            return []
            
    def broadcast_status(self) -> List[Dict]:
        """Get current status for broadcasting."""
        return self.collect_status() 