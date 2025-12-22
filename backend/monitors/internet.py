"""Internet connectivity monitoring functionality."""
import socket
import requests
import time
import json
import os
import random
from typing import Dict, Optional, List, Any, Tuple
from flask import current_app

class InternetStatusMonitor:
    """Monitor internet connectivity status."""
    def __init__(self, check_interval: int = 7):
        self.hosts = ['1.1.1.1', '8.8.8.8', '208.67.222.222']
        self.timeout = 3
        self.check_interval = check_interval
        self.ip_cache_file = "/mnt/ramdisk/ipinfo_cache.json"
        self.ip_cache_expiry = 86400  # 24 hours in seconds
        
        # Alternative IP info services to try if ipinfo.io is rate-limited
        self.ip_info_services = [
            # Primary service
            {"url": "https://ipinfo.io/{ip}/json", "ip_key": None, "requires_key": False},
            # Alternatives (free with some limitations)
            {"url": "https://ipapi.co/{ip}/json", "ip_key": None, "requires_key": False},
            {"url": "https://freegeoip.app/json/{ip}", "ip_key": None, "requires_key": False},
            {"url": "https://extreme-ip-lookup.com/json/{ip}", "ip_key": None, "requires_key": False}
        ]
        
    def _load_cached_ip_details(self, current_ip: str) -> Optional[Dict]:
        """
        Load cached IP details if available and valid.
        
        Args:
            current_ip: The current public IP to validate against cached data
            
        Returns:
            Dict or None: Cached IP details if valid, None otherwise
        """
        try:
            if not os.path.exists(self.ip_cache_file):
                return None
                
            with open(self.ip_cache_file, 'r') as f:
                cache_data = json.load(f)
                
            # Check if cache is for current IP and not expired
            if (cache_data.get('ip') == current_ip and 
                time.time() - cache_data.get('timestamp', 0) < self.ip_cache_expiry):
                return cache_data.get('details')
                
            return None
        except Exception as e:
            current_app.logger.error(f"Error loading cached IP details: {str(e)}")
            return None
            
    def _save_ip_details_to_cache(self, ip: str, details: Dict) -> None:
        """
        Save IP details to cache file.
        
        Args:
            ip: The public IP address
            details: The IP details to cache
        """
        try:
            cache_data = {
                'ip': ip,
                'details': details,
                'timestamp': time.time()
            }
            
            # Ensure ramdisk directory exists
            os.makedirs("/mnt/ramdisk", exist_ok=True)
            
            with open(self.ip_cache_file, 'w') as f:
                json.dump(cache_data, f)
                
            current_app.logger.debug(f"Saved IP details to cache for IP {ip}")
        except Exception as e:
            current_app.logger.error(f"Error saving IP details to cache: {str(e)}")
    
    def _get_ip_details(self, ip: str) -> Tuple[Dict, bool]:
        """
        Get IP details from available services with fallbacks.
        
        Args:
            ip: The IP address to get details for
            
        Returns:
            Tuple[Dict, bool]: IP details and whether the request was successful
        """
        # Try primary service first, then fallbacks in random order
        services = [self.ip_info_services[0]] + random.sample(self.ip_info_services[1:], len(self.ip_info_services[1:]))
        
        for service in services:
            try:
                url = service["url"].format(ip=ip)
                response = requests.get(url, timeout=self.timeout)
                
                if response.status_code == 200:
                    details = response.json()
                    # Add source information
                    details["_source"] = url.split('/')[2]  # Extract domain
                    return details, True
                elif response.status_code == 429:
                    # Rate limited, try next service
                    current_app.logger.warning(f"Rate limited by {url.split('/')[2]}")
                    continue
                    
            except Exception as e:
                current_app.logger.error(f"Error getting IP details from {service['url']}: {str(e)}")
                continue
                
        # If all services failed, return error
        return {
            "error": {
                "status": 429,
                "title": "Rate limit exceeded",
                "message": "All IP information services are rate limited or unavailable."
            }
        }, False
        
    def check_connectivity(self, include_admin_data: bool = False) -> Dict:
        """
        Check internet connectivity using multiple hosts.
        
        Args:
            include_admin_data: Whether to include admin-only detailed information
            
        Returns:
            Dict: Internet status information, with admin details if requested
        """
        connected = False
        public_ip = None
        ip_details = None
        
        for host in self.hosts:
            try:
                socket.create_connection((host, 53), timeout=self.timeout)
                connected = True
                
                if public_ip is None:
                    try:
                        response = requests.get('https://api.ipify.org?format=json', 
                                             timeout=self.timeout)
                        public_ip = response.json().get('ip')
                        
                        # Get additional IP details for admin users
                        if include_admin_data and public_ip:
                            # Try to load from cache first
                            ip_details = self._load_cached_ip_details(public_ip)
                            
                            # If not in cache or cache invalid, fetch from API
                            if ip_details is None:
                                ip_details, success = self._get_ip_details(public_ip)
                                
                                # Only cache successful responses
                                if success:
                                    self._save_ip_details_to_cache(public_ip, ip_details)
                    except:
                        pass
                break
                
            except (socket.timeout, socket.error):
                continue
                
        # Basic result for all users
        result = {
            'status': 'connected' if connected else 'disconnected',
            'timestamp': time.time()
        }
        
        # Add admin-only fields
        if include_admin_data:
            result['publicIp'] = public_ip
            result['ipDetails'] = ip_details
            current_app.logger.debug(f"Including admin data in internet status: publicIp={public_ip}, ipDetails={ip_details is not None}")
            
        return result

    def broadcast_status(self) -> Dict:
        """Get current status for broadcasting."""
        try:
            # Always include admin data, filtering will be done by broadcast manager
            status_data = self.check_connectivity(include_admin_data=True)
            current_app.logger.debug(f"Broadcasting internet status: {status_data}")
            return status_data
        except Exception as e:
            current_app.logger.error(f"Error in Internet status broadcast: {str(e)}")
            return {
                'status': 'error',
                'error': str(e),
                'timestamp': time.time()
            } 