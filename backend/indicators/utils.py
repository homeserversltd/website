from typing import List, Dict, Tuple
from flask import current_app
import json
from backend.utils.utils import check_port, execute_systemctl_command

def get_service_full_status(service_name: str, port: int = None) -> Tuple[bool, str]:
    """
    Get comprehensive service status using both systemctl and port checks.
    
    Args:
        service_name: Name of the service to check
        port: Optional port number to check
        
    Returns:
        Tuple[bool, str]: (is_running, status_description)
    """
    systemd_active = False
    status_details = []
    
    # Check systemctl status
    success, output = execute_systemctl_command('is-active', service_name)
    systemd_active = success and output.strip() == 'active'
    status_details.append(f"systemd: {'active' if systemd_active else 'inactive'}")
    
    # Check port if provided
    if port:
        port_status = check_port(port)
        status_details.append(f"port {port}: {port_status}")
    
    # Determine overall status
    is_running = systemd_active  # Consider service running if systemd shows active
    status = ' | '.join(status_details)
    
    return is_running, status

def collect_services_status() -> List[Dict]:
    """
    Collect status information for all configured services.
    Returns a list of service status indicators with both systemctl and port status.
    """
    try:
        # Read service configuration from homeserver.json
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            
        # Get portals configuration
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        indicators = []
        
        # Check each portal's service status
        for portal in portals:
            port = portal.get('port')
            services = portal.get('services', [])
            
            if not services:
                continue
                
            # Check status for each service associated with the portal
            service_statuses = []
            is_running = True  # Will be set to False if any service is not running
            
            for service in services:
                running, status = get_service_full_status(service, port)
                service_statuses.append(f"{service}: {status}")
                is_running = is_running and running
            
            # Create status indicator for the service
            indicator = {
                "service": portal.get('name', 'unknown').lower().replace(" ", "_"),
                "name": portal.get('name', 'Unknown'),
                "description": portal.get('description', ''),
                "status": "running" if is_running else "stopped",
                "detailed_status": " | ".join(service_statuses)
            }
            indicators.append(indicator)
            
        return indicators
        
    except Exception as e:
        current_app.logger.error(f'Error collecting services status: {e}')
        return []