import json
from typing import Dict
from flask import current_app

def get_service_mappings() -> Dict[str, str]:
    """
    Get service name mappings from homeserver.json configuration.
    If the config is invalid or missing, the factory config will be used automatically.
    """
    try:
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            
        # Initialize mappings dict
        service_map = {}
        
        # Get portals data from config
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        
        # Build service mappings from portal configurations
        for portal in portals:
            portal_name = portal.get('name', '').lower().replace(' ', '')
            services = portal.get('services', [])
            
            if portal_name and services:
                # Use the first service as the primary mapping
                service_map[portal_name] = services[0]
                
                # Also add the service name itself as a key
                for service in services:
                    service_name = service.lower().replace('-', '')
                    service_map[service_name] = service
        
        # current_app.logger.debug(f"Loaded service mappings: {service_map}")
        return service_map
        
    except Exception as e:
        current_app.logger.error(f"Error loading service mappings: {str(e)}")
        # Return empty dict - the factory config will be used automatically
        return {}