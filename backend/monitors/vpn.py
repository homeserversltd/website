"""VPN and Transmission monitoring functionality."""
import time
from typing import Dict, Any
from flask import current_app
from backend.indicators.vpn.utils import check_process_running
from backend.utils.utils import execute_systemctl_command

# Global cache for service enabled state to ensure it's shared across all instances
_ENABLED_CACHE = None
_ENABLED_CACHE_TIME = 0
_ENABLED_CACHE_TTL = 60  # Cache service enabled state for 60 seconds

class VPNMonitor:
    """Monitor VPN and Transmission status."""
    
    def __init__(self, check_interval: int = 5):
        self.check_interval = check_interval
        
    def invalidate_enabled_cache(self):
        """Explicitly invalidate the cached service enabled state."""
        global _ENABLED_CACHE, _ENABLED_CACHE_TIME
        current_app.logger.info("[PIA] Invalidating service enabled cache.")
        _ENABLED_CACHE = None
        _ENABLED_CACHE_TIME = 0 # Set time to 0 to ensure expiry
        
    def check_if_service_enabled(self) -> bool:
        """Check if the VPN service is enabled in systemd, with caching."""
        global _ENABLED_CACHE, _ENABLED_CACHE_TIME, _ENABLED_CACHE_TTL
        
        # Check if we have a recent cached value
        current_time = time.time()
        if _ENABLED_CACHE is not None and current_time - _ENABLED_CACHE_TIME < _ENABLED_CACHE_TTL:
            current_app.logger.debug("[PIA] Using cached VPN enabled state")
            return _ENABLED_CACHE
            
        # No cache or expired cache, check actual state
        try:
            current_app.logger.info("[PIA] Cache expired - Checking VPN service enabled state")
            success, message = execute_systemctl_command('is-enabled', 'transmissionPIA.service')
            enabled = success and message.strip() == 'enabled'
            
            # Update global cache
            _ENABLED_CACHE = enabled
            _ENABLED_CACHE_TIME = current_time
            
            # Log cache update
            current_app.logger.info(f"[PIA] Updated service enabled cache: {enabled}, next check in {_ENABLED_CACHE_TTL}s")
            
            return enabled
        except Exception as e:
            current_app.logger.error(f"[PIA] Error checking if VPN service is enabled: {str(e)}")
            return False
            
    def check_status(self) -> Dict[str, Any]:
        """Get current VPN and Transmission status, including enabled state."""
        try:
            vpn_running = check_process_running('openvpn')
            transmission_running = check_process_running('transmission')
            # Also check the enabled status using the cached method
            is_enabled = self.check_if_service_enabled()
            
            current_app.logger.debug(f"[PIA] Status check: VPN={vpn_running}, Transmission={transmission_running}, Enabled={is_enabled}")
            
            return {
                'vpnStatus': 'running' if vpn_running else 'stopped',
                'transmissionStatus': 'running' if transmission_running else 'stopped',
                'isEnabled': is_enabled, # Add enabled status
                'timestamp': time.time()
            }
        except Exception as e:
            current_app.logger.error(f"[PIA] Error checking VPN status: {str(e)}")
            return {
                'vpnStatus': 'error',
                'transmissionStatus': 'error',
                'isEnabled': None, # Indicate error or unknown state
                'error': str(e),
                'timestamp': time.time()
            }
            
    def broadcast_status(self) -> Dict[str, Any]:
        """Get current status for broadcasting."""
        return self.check_status() 