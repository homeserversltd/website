"""Tailscale monitoring functionality."""
from typing import Dict, Any, Optional
from flask import current_app
from backend.indicators.tailscale.utils import get_tailscale_status, get_tailnet_name
import time

class TailscaleMonitor:
    """Monitor Tailscale connection status and configuration."""
    
    def __init__(self, check_interval: int = 10):
        self.check_interval = check_interval
        
    def check_status(self, include_admin_data: bool = False) -> Dict[str, Any]:
        """
        Get current Tailscale status.
        
        Args:
            include_admin_data: Whether to include admin-only detailed information
            
        Returns:
            Dict: Tailscale status information, with admin details if requested
        """
        try:
            status_data = get_tailscale_status()
            
            # Basic result for all users
            result = {
                'status': status_data['status'],
                'interface': status_data['interface'],
                'timestamp': time.time()
            }
            
            # Add admin-only fields
            if include_admin_data:
                result['ip'] = status_data.get('ip')
                result['tailnet'] = get_tailnet_name()
                result['isEnabled'] = status_data.get('isEnabled', False)
                result['loginUrl'] = status_data.get('loginUrl')  # Include login URL if available
                current_app.logger.debug(f"Including admin data in tailscale status: ip={result.get('ip')}, tailnet={result.get('tailnet')}, isEnabled={result.get('isEnabled')}, loginUrl={result.get('loginUrl')}")
            
            return result
        except Exception as e:
            current_app.logger.error(f"Error checking Tailscale status: {str(e)}")
            error_result = {
                'status': 'error',
                'error': str(e),
                'interface': False,
                'timestamp': time.time()
            }
             
            # Add admin-only fields even in error case
            if include_admin_data:
                error_result['tailnet'] = ''
                error_result['ip'] = None
                error_result['isEnabled'] = False
                error_result['loginUrl'] = None
                
            return error_result
            
    def broadcast_status(self) -> Dict[str, Any]:
        """Get current status for broadcasting."""
        # Always include admin data, filtering will be done by broadcast manager
        return self.check_status(include_admin_data=True)