"""
DHCP Manager Utilities

Handles interaction with Kea DHCP server including configuration management,
lease queries, and reservation management.
"""

import json
import subprocess
import tempfile
import os
import csv
import time
from io import StringIO
from pathlib import Path
from typing import Dict, List, Optional, Any

class DhcpManager:
    """Manages Kea DHCP server operations."""
    
    CONFIG_PATH = Path("/etc/kea/kea-dhcp4.conf")
    LEASE_DB_PATH = Path("/var/lib/kea/kea-leases4.csv")
    
    def __init__(self):
        """Initialize DHCP manager."""
        self.config_path = self.CONFIG_PATH
        self.lease_db_path = self.LEASE_DB_PATH
    
    def _run_sudo_command(self, command: List[str]) -> tuple[bool, str]:
        """Execute a sudo command and return success status and output."""
        try:
            result = subprocess.run(
                ['/usr/bin/sudo'] + command,
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            return False, "Command timed out"
        except Exception as e:
            return False, str(e)
    
    def get_service_status(self) -> Dict[str, Any]:
        """Get DHCP service status."""
        success, output = self._run_sudo_command([
            'systemctl', 'is-active', 'kea-dhcp4-server'
        ])
        
        active = success and 'active' in output.lower()
        
        # Get service status details
        success_status, status_output = self._run_sudo_command([
            'systemctl', 'status', 'kea-dhcp4-server', '--no-pager'
        ])
        
        return {
            'active': active,
            'status': 'active' if active else 'inactive',
            'details': status_output if success_status else 'Unable to get status'
        }
    
    def get_config(self) -> Dict[str, Any]:
        """Read and return current DHCP configuration."""
        success, output = self._run_sudo_command([
            'cat', str(self.config_path)
        ])
        
        if not success:
            raise Exception(f"Failed to read config: {output}")
        
        # Extract JSON object from file (handles comments and extra data)
        # Find first { and last } to get the JSON object
        first_brace = output.find('{')
        last_brace = output.rfind('}')
        
        if first_brace == -1 or last_brace == -1 or last_brace <= first_brace:
            raise Exception("No valid JSON object found in config file")
        
        json_content = output[first_brace:last_brace + 1]
        
        try:
            return json.loads(json_content)
        except json.JSONDecodeError as e:
            raise Exception(f"Invalid JSON in config file: {str(e)}")
    
    def update_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Update DHCP configuration file using atomic shell script."""
        # Validate JSON structure
        try:
            json.dumps(config)
        except (TypeError, ValueError) as e:
            raise Exception(f"Invalid configuration JSON: {str(e)}")
        
        # Validate config before writing
        if not self._validate_config_structure(config):
            raise Exception("Invalid configuration structure")
        
        # Create temporary file with JSON config
        config_json = json.dumps(config, indent=4)
        
        # Use tempfile to create a temporary file that we can pass to the script
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_file:
            tmp_file.write(config_json)
            tmp_file_path = tmp_file.name
        
        try:
            # Call the atomic update script
            script_path = '/usr/local/sbin/update-kea-dhcp.sh'
            
            # Execute the script via sudo
            success, output = self._run_sudo_command([
                script_path, tmp_file_path
            ])
            
            if not success:
                raise Exception(f"Configuration update failed: {output}")
            
            # Return updated config
            return self.get_config()
        finally:
            # Clean up temporary file
            try:
                os.unlink(tmp_file_path)
            except Exception:
                pass  # Ignore cleanup errors
    
    def validate_config(self) -> bool:
        """Validate DHCP configuration file."""
        success, output = self._run_sudo_command([
            'kea-dhcp4', '-t', str(self.config_path)
        ])
        
        return success
    
    def _validate_config_structure(self, config: Dict[str, Any]) -> bool:
        """Validate that config has required structure."""
        if not isinstance(config, dict):
            return False
        
        if 'Dhcp4' not in config:
            return False
        
        dhcp4 = config['Dhcp4']
        if not isinstance(dhcp4, dict):
            return False
        
        if 'subnet4' not in dhcp4:
            return False
        
        return True
    
    def get_reservations(self) -> List[Dict[str, Any]]:
        """Get all static IP reservations from configuration."""
        config = self.get_config()
        reservations = []
        
        try:
            subnet4 = config.get('Dhcp4', {}).get('subnet4', [])
            for subnet in subnet4:
                subnet_reservations = subnet.get('reservations', [])
                for reservation in subnet_reservations:
                    reservations.append({
                        'hw-address': reservation.get('hw-address', ''),
                        'ip-address': reservation.get('ip-address', ''),
                        'hostname': reservation.get('hostname', '')
                    })
        except Exception as e:
            raise Exception(f"Error parsing reservations: {str(e)}")
        
        return reservations
    
    def add_reservation(self, hw_address: str, ip_address: Optional[str] = None, hostname: Optional[str] = None) -> Dict[str, Any]:
        """Add a new static IP reservation.
        
        If ip_address is not provided or is in pool range, automatically assigns
        the next available IP from reserved range (2 up to 49).
        """
        config = self.get_config()
        
        if not self._validate_mac_address(hw_address):
            raise Exception(f"Invalid MAC address: {hw_address}")
        
        # Check if reservation already exists
        existing = self.get_reservations()
        for res in existing:
            if res['hw-address'].lower() == hw_address.lower():
                raise Exception("Reservation with this MAC address already exists")
        
        # Determine IP address to use
        if not ip_address:
            # Auto-assign from reserved range
            ip_address = self._get_next_available_reserved_ip()
            if not ip_address:
                raise Exception("No available IP addresses in reserved range (192.168.123.2 - 192.168.123.49)")
        else:
            # Validate provided IP address format
            if not self._validate_ip_address(ip_address):
                raise Exception(f"Invalid IP address: {ip_address}")
            
            # If IP is in pool range, auto-assign from reserved range instead
            if self._validate_ip_in_pool(ip_address):
                ip_address = self._get_next_available_reserved_ip()
                if not ip_address:
                    raise Exception("No available IP addresses in reserved range (192.168.123.2 - 192.168.123.49)")
            else:
                # Validate that provided IP is in reserved range
                if not self._validate_ip_in_reserved_range(ip_address):
                    start_ip, end_ip = self._get_reserved_range()
                    raise Exception(f"IP address {ip_address} is outside the reserved range ({start_ip} - {end_ip})")
        
        # Check if IP is already assigned
        for res in existing:
            if res['ip-address'] == ip_address:
                raise Exception("IP address is already assigned to another reservation")
        
        # Also check in-memory config structure before adding
        subnet4 = config.get('Dhcp4', {}).get('subnet4', [])
        if not subnet4:
            raise Exception("No subnet4 configuration found")
        
        subnet = subnet4[0]
        if 'reservations' not in subnet:
            subnet['reservations'] = []
        
        # Check for duplicates in the in-memory config as well
        for res in subnet['reservations']:
            if res.get('hw-address', '').lower() == hw_address.lower():
                raise Exception("Reservation with this MAC address already exists")
            if res.get('ip-address', '') == ip_address:
                raise Exception("IP address is already assigned to another reservation")
        
        # Add reservation to first subnet
        try:
            new_reservation = {
                'hw-address': hw_address.lower(),
                'ip-address': ip_address
            }
            
            if hostname:
                new_reservation['hostname'] = hostname
            
            subnet['reservations'].append(new_reservation)
            
            # Update config
            updated_config = self.update_config(config)
            
            # Return the new reservation
            return new_reservation
        except Exception as e:
            raise Exception(f"Failed to add reservation: {str(e)}")
    
    def remove_reservation(self, identifier: str) -> bool:
        """Remove a reservation by MAC address or IP address."""
        config = self.get_config()
        
        try:
            subnet4 = config.get('Dhcp4', {}).get('subnet4', [])
            for subnet in subnet4:
                if 'reservations' in subnet:
                    reservations = subnet['reservations']
                    # Remove matching reservation
                    original_count = len(reservations)
                    subnet['reservations'] = [
                        r for r in reservations
                        if r.get('hw-address', '').lower() != identifier.lower()
                        and r.get('ip-address', '') != identifier
                    ]
                    
                    if len(subnet['reservations']) < original_count:
                        # Reservation was removed, update config
                        self.update_config(config)
                        return True
            
            return False
        except Exception as e:
            raise Exception(f"Failed to remove reservation: {str(e)}")
    
    def get_leases(self) -> List[Dict[str, Any]]:
        """Get active DHCP leases from lease database."""
        leases = []
        
        # Try to read lease database
        if not self.lease_db_path.exists():
            return leases
        
        try:
            success, output = self._run_sudo_command([
                'cat', str(self.lease_db_path)
            ])
            
            if not success:
                return leases
            
            # Use dict keyed by MAC address to automatically deduplicate
            leases_by_mac = {}
            current_time = int(time.time())
            
            # Parse CSV lease database using proper CSV parser
            # Format: address,hwaddr,client_id,valid_lifetime,expire,subnet_id,fqdn_fwd,fqdn_rev,hostname,state,user_context
            csv_content = StringIO(output)
            reader = csv.DictReader(csv_content)
            
            for row in reader:
                # Only include active leases (state=0 and not expired)
                try:
                    expire_time = int(row['expire']) if row.get('expire') else 0
                    state = int(row['state']) if row.get('state') else 1
                except (ValueError, KeyError):
                    continue
                
                if state == 0 and expire_time > current_time:
                    mac = row.get('hwaddr', '')
                    if not mac:
                        continue
                    
                    # Keep the lease with the latest expiration time for each MAC
                    if mac not in leases_by_mac or expire_time > leases_by_mac[mac]['_expire']:
                        leases_by_mac[mac] = {
                            'ip-address': row.get('address', ''),
                            'hw-address': mac,
                            'hostname': row.get('hostname', ''),
                            'expire': str(expire_time),
                            'state': str(state),
                            '_expire': expire_time  # Internal field for comparison
                        }
            
            # Convert dict to list and remove internal expire field
            for lease in leases_by_mac.values():
                lease.pop('_expire', None)  # Remove internal field
                leases.append(lease)
                
        except Exception as e:
            # If we can't read leases, return empty list
            # This is not a critical error
            pass
        
        return leases
    
    def _validate_ip_address(self, ip: str) -> bool:
        """Validate IP address format."""
        try:
            parts = ip.split('.')
            if len(parts) != 4:
                return False
            for part in parts:
                num = int(part)
                if num < 0 or num > 255:
                    return False
            return True
        except (ValueError, AttributeError):
            return False
    
    def _validate_mac_address(self, mac: str) -> bool:
        """Validate MAC address format."""
        try:
            parts = mac.replace(':', '-').split('-')
            if len(parts) != 6:
                return False
            for part in parts:
                int(part, 16)
            return True
        except (ValueError, AttributeError):
            return False
    
    def _get_pool_range(self) -> tuple[Optional[str], Optional[str]]:
        """Extract IP pool range from configuration."""
        try:
            config = self.get_config()
            subnet4 = config.get('Dhcp4', {}).get('subnet4', [])
            if not subnet4:
                return None, None
            
            subnet = subnet4[0]
            pools = subnet.get('pools', [])
            if not pools:
                return None, None
            
            # Get first pool range
            pool_str = pools[0].get('pool', '')
            if ' - ' in pool_str:
                start_ip, end_ip = pool_str.split(' - ', 1)
                return start_ip.strip(), end_ip.strip()
            
            return None, None
        except Exception:
            return None, None
    
    def _get_reserved_range(self) -> tuple[str, str]:
        """Get the reserved IP range for pinned reservations (2-49)."""
        return ("192.168.123.2", "192.168.123.49")
    
    def get_current_boundary(self) -> int:
        """Get the current max reservations boundary from config.
        
        Returns the maximum number of reservations based on the current
        pool configuration. Calculates backwards from the pool start IP.
        If no pool exists, all IPs are reserved (max_reservations = 249).
        
        Returns:
            Maximum reservations count (boundary value)
        """
        try:
            start_ip, end_ip = self._get_pool_range()
            print(f"[DHCP] get_current_boundary: pool range = {start_ip} - {end_ip}")
            
            if not start_ip:
                print("[DHCP] get_current_boundary: No pool found - checking if all IPs are reserved")
                # If no pool exists, check if we have a reserved range that goes to 250
                # If all IPs are reserved (2-250), max_reservations = 249
                config = self.get_config()
                subnet4 = config.get('Dhcp4', {}).get('subnet4', [])
                if subnet4:
                    subnet = subnet4[0]
                    pools = subnet.get('pools', [])
                    # If pools array is empty, all IPs are reserved
                    if not pools:
                        print("[DHCP] get_current_boundary: Empty pools array - all IPs reserved, returning 249")
                        return 249
                
                print("[DHCP] get_current_boundary: No pool start IP found, defaulting to 48")
                # Default to 48 if pool range can't be determined
                return 48
            
            # Pool starts at 192.168.123.X
            # Reserved range is 192.168.123.2 to 192.168.123.(X-1)
            # So max reservations = X - 2
            ip_parts = start_ip.split('.')
            if len(ip_parts) != 4:
                print(f"[DHCP] get_current_boundary: Invalid IP format: {start_ip}, defaulting to 48")
                return 48
            
            pool_start_octet = int(ip_parts[3])
            print(f"[DHCP] get_current_boundary: pool_start_octet = {pool_start_octet}")
            # Reserved range: 2 to (pool_start_octet - 1)
            # Max reservations = (pool_start_octet - 1) - 2 + 1 = pool_start_octet - 2
            # If pool_start = 2, then max_reservations = 0 (no reserved range, full pool)
            max_reservations = pool_start_octet - 2
            print(f"[DHCP] get_current_boundary: calculated max_reservations = {max_reservations}")
            
            # Ensure it's within valid range (0 to 249)
            if max_reservations < 0:
                print(f"[DHCP] get_current_boundary: max_reservations < 0, returning 0")
                return 0
            if max_reservations > 249:
                print(f"[DHCP] get_current_boundary: max_reservations > 249, returning 249")
                return 249
            
            print(f"[DHCP] get_current_boundary: returning {max_reservations}")
            return max_reservations
        except Exception as e:
            # Default to 48 if calculation fails
            print(f"[DHCP] get_current_boundary: Exception occurred: {str(e)}, defaulting to 48")
            import traceback
            traceback.print_exc()
            return 48
    
    def _ip_to_int(self, ip: str) -> Optional[int]:
        """Convert IP address to integer for comparison."""
        try:
            parts = ip.split('.')
            if len(parts) != 4:
                return None
            return int(parts[0]) * 256**3 + int(parts[1]) * 256**2 + int(parts[2]) * 256 + int(parts[3])
        except (ValueError, AttributeError):
            return None
    
    def _validate_ip_in_pool(self, ip: str) -> bool:
        """Validate IP address is within configured pool range."""
        if not self._validate_ip_address(ip):
            return False
        
        start_ip, end_ip = self._get_pool_range()
        if not start_ip or not end_ip:
            # If pool range can't be determined, just validate format
            return True
        
        ip_int = self._ip_to_int(ip)
        start_int = self._ip_to_int(start_ip)
        end_int = self._ip_to_int(end_ip)
        
        if ip_int is None or start_int is None or end_int is None:
            return False
        
        return start_int <= ip_int <= end_int
    
    def _validate_ip_in_reserved_range(self, ip: str) -> bool:
        """Validate IP address is within reserved range for pinned reservations (2-49)."""
        if not self._validate_ip_address(ip):
            return False
        
        start_ip, end_ip = self._get_reserved_range()
        ip_int = self._ip_to_int(ip)
        start_int = self._ip_to_int(start_ip)
        end_int = self._ip_to_int(end_ip)
        
        if ip_int is None or start_int is None or end_int is None:
            return False
        
        return start_int <= ip_int <= end_int
    
    def _get_next_available_reserved_ip(self) -> Optional[str]:
        """Find the next available IP in reserved range (2 up to 49)."""
        existing_reservations = self.get_reservations()
        used_ips = {res['ip-address'] for res in existing_reservations}
        
        start_ip, end_ip = self._get_reserved_range()
        start_int = self._ip_to_int(start_ip)
        end_int = self._ip_to_int(end_ip)
        
        if start_int is None or end_int is None:
            return None
        
        # Check from 2 up to 49 (ascending)
        for ip_int in range(start_int, end_int + 1, 1):
            # Convert integer back to IP string
            ip_parts = [
                (ip_int >> 24) & 0xFF,
                (ip_int >> 16) & 0xFF,
                (ip_int >> 8) & 0xFF,
                ip_int & 0xFF
            ]
            ip_str = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.{ip_parts[3]}"
            
            if ip_str not in used_ips:
                return ip_str
        
        # All IPs in reserved range are taken
        return None
    
    def update_reservation_ip(self, identifier: str, new_ip: str) -> Dict[str, Any]:
        """Update a reservation's IP address.
        
        Validates that the new IP is within the reserved range (2-49).
        """
        config = self.get_config()
        
        # Validate new IP address
        if not self._validate_ip_address(new_ip):
            raise Exception(f"Invalid IP address format: {new_ip}")
        
        # Validate IP is within reserved range (not pool range)
        if not self._validate_ip_in_reserved_range(new_ip):
            start_ip, end_ip = self._get_reserved_range()
            raise Exception(f"IP address {new_ip} is outside the reserved range ({start_ip} - {end_ip})")
        
        # Check if new IP is already assigned to another reservation
        existing = self.get_reservations()
        for res in existing:
            if res['ip-address'] == new_ip:
                # Allow if it's the same reservation we're updating
                if res['hw-address'].lower() != identifier.lower() and res['ip-address'] != identifier:
                    raise Exception("IP address is already assigned to another reservation")
        
        # Find and update the reservation
        try:
            subnet4 = config.get('Dhcp4', {}).get('subnet4', [])
            found = False
            
            for subnet in subnet4:
                if 'reservations' in subnet:
                    for reservation in subnet['reservations']:
                        # Match by MAC or IP
                        if (reservation.get('hw-address', '').lower() == identifier.lower() or
                            reservation.get('ip-address', '') == identifier):
                            reservation['ip-address'] = new_ip
                            found = True
                            break
                    if found:
                        break
            
            if not found:
                raise Exception("Reservation not found")
            
            # Update config
            updated_config = self.update_config(config)
            
            # Return updated reservation
            updated_reservations = self.get_reservations()
            for res in updated_reservations:
                if res['hw-address'].lower() == identifier.lower() or res['ip-address'] == new_ip:
                    return res
            
            raise Exception("Failed to retrieve updated reservation")
        except Exception as e:
            raise Exception(f"Failed to update reservation: {str(e)}")
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get DHCP statistics including homeserver IP, reservation count, and lease count."""
        try:
            config = self.get_config()
            
            # Extract homeserver IP from routers option
            homeserver_ip = "192.168.123.1"  # Default
            try:
                subnet4 = config.get('Dhcp4', {}).get('subnet4', [])
                if subnet4:
                    subnet = subnet4[0]
                    option_data = subnet.get('option-data', [])
                    for option in option_data:
                        if option.get('name') == 'routers':
                            homeserver_ip = option.get('data', homeserver_ip)
                            break
            except Exception:
                pass  # Use default if extraction fails
            
            # Get reservation count
            reservations = self.get_reservations()
            reservations_count = len(reservations)
            
            # Calculate reservations_total based on current pool boundary
            # Get the current boundary to determine the actual reserved range
            try:
                print(f"[DHCP] get_statistics: Calling get_current_boundary()...")
                max_reservations = self.get_current_boundary()
                print(f"[DHCP] get_statistics: get_current_boundary() returned {max_reservations}")
                # Reserved range: 192.168.123.2 to 192.168.123.(max_reservations+1)
                # Total = max_reservations (since we have IPs from 2 to max_reservations+1, that's max_reservations IPs)
                reservations_total = max_reservations
                print(f"[DHCP] get_statistics: Setting reservations_total = {reservations_total}")
            except Exception as e:
                # Fallback to default if boundary can't be determined
                print(f"[DHCP] get_statistics: Exception in get_current_boundary(): {str(e)}, defaulting to 48")
                import traceback
                traceback.print_exc()
                reservations_total = 48
            
            # Get lease count
            # Only count leases that are NOT reservations (active leases for non-reserved devices)
            leases = self.get_leases()
            reservations = self.get_reservations()
            reserved_macs = {res['hw-address'].lower() for res in reservations}
            
            # Filter out leases that match reservations by MAC address
            active_leases = [lease for lease in leases if lease['hw-address'].lower() not in reserved_macs]
            leases_count = len(active_leases)
            
            # Calculate pool total
            start_ip, end_ip = self._get_pool_range()
            leases_total = 0
            if start_ip and end_ip:
                start_int = self._ip_to_int(start_ip)
                end_int = self._ip_to_int(end_ip)
                if start_int is not None and end_int is not None:
                    leases_total = end_int - start_int + 1
            
            return {
                'homeserver_ip': homeserver_ip,
                'reservations_count': reservations_count,
                'reservations_total': reservations_total,
                'leases_count': leases_count,
                'leases_total': leases_total
            }
        except Exception as e:
            raise Exception(f"Failed to get statistics: {str(e)}")
    
    def update_pool_boundary(self, max_reservations: int) -> bool:
        """Update the pool boundary to adjust reservations-to-hosts ratio.
        
        Args:
            max_reservations: Maximum number of reservations allowed.
                            This sets the boundary between reserved range
                            and pool range.
        
        Returns:
            True if update was successful
        
        Raises:
            Exception if validation fails or update fails
        """
        config = self.get_config()
        
        # Validate constraints
        # Terminology:
        # - Hosts = unique MAC addresses (devices)
        # - Leases = IP addresses currently leased/assigned (active DHCP leases for non-reserved devices)
        # - Reservations = fixed IP assignments to MAC addresses
        current_reservations = len(self.get_reservations())
        
        # Get active leases and filter out those that are reservations
        # Only count leases for devices that don't have reservations
        leases = self.get_leases()
        reservations = self.get_reservations()
        reserved_macs = {res['hw-address'].lower() for res in reservations}
        active_leases = [lease for lease in leases if lease['hw-address'].lower() not in reserved_macs]
        current_leases = len(active_leases)  # Active leases (non-reserved devices)
        
        total_ips = 249  # 192.168.123.2 to 192.168.123.250
        
        # Min value: can't go below current reservation count
        # If there are no reservations, we can go down to 0 (full pool range 2-250)
        min_allowed = current_reservations
        
        if max_reservations < min_allowed:
            raise Exception(f"Cannot set max reservations below {min_allowed} (current reservations: {min_allowed})")
        
        # Validate that all existing reservations are within the new reserved range
        # If max_reservations = 0, there's no reserved range, so we can't have any reservations
        if max_reservations == 0:
            if current_reservations > 0:
                raise Exception(f"Cannot set max reservations to 0 when there are {current_reservations} existing reservations")
        else:
            # Reserved range is 192.168.123.2 to 192.168.123.(max_reservations+1)
            reserved_end = max_reservations + 1
            for res in reservations:
                ip = res.get('ip-address', '')
                ip_parts = ip.split('.')
                if len(ip_parts) == 4:
                    try:
                        ip_last_octet = int(ip_parts[3])
                        # Reserved range: 2 to (max_reservations+1)
                        # If reservation is at .X, then max_reservations+1 must be >= X
                        if ip_last_octet < 2 or ip_last_octet > reserved_end:
                            raise Exception(f"Existing reservation {ip} is outside new reserved range (192.168.123.2 - 192.168.123.{reserved_end}). Minimum allowed: {ip_last_octet - 1}")
                    except ValueError:
                        continue
        
        # Max value constraint logic:
        # - If there are 0 active leases (no non-reserved devices currently have leased IPs), we can set all IPs to reservations (max = total_ips, leaving 0 leases capacity)
        # - If there are active leases, we must ensure at least that many leases can be accommodated
        #   So max reservations = total_ips - active_leases_count
        if current_leases == 0:
            max_allowed = total_ips  # Allow all IPs to be reservations (0 leases capacity)
        else:
            max_allowed = total_ips - current_leases  # Ensure minimum leases capacity for active leases
        
        if max_reservations > max_allowed:
            if current_leases == 0:
                raise Exception(f"Cannot set max reservations above {max_allowed} (total available IPs)")
            else:
                raise Exception(f"Cannot set max reservations above {max_allowed} (must ensure {current_leases} active leases minimum)")
        
        # Calculate new boundary
        # If max_reservations = 0, no reserved range, pool is full (2-250)
        # If max_reservations = N (N > 0), we can have up to N reservations
        # Reserved range: 192.168.123.2 to 192.168.123.(N+1) gives us N IPs (2, 3, ..., N+1)
        # Pool range: 192.168.123.(N+2) to 192.168.123.250
        if max_reservations == 0:
            # No reserved range, pool is full (2-250)
            reserved_end = None
            pool_start = 2
            pool_end = 250
        else:
            reserved_end = max_reservations + 1
            pool_start = reserved_end + 1
            pool_end = 250
            
            # Edge case: If all IPs are reserved (max_reservations = 249), there's no pool
            # In this case, we need to handle it specially - either no pool or empty pool
            if pool_start > pool_end:
                # All IPs are reserved, no pool available
                pool_start = None
                pool_end = None
        
        # Note: We already validated that max_reservations >= min_allowed (based on highest reservation IP)
        # So all existing reservations will be within the new reserved range
        # No need to validate again here
        
        # Note: We don't validate existing leases against the new pool range because:
        # 1. Leases are temporary and will expire naturally
        # 2. Existing leases can be anywhere in the subnet - they're not restricted to pool range
        # 3. The pool range only affects NEW lease assignments, not existing ones
        # 4. Moving the boundary doesn't invalidate existing leases - they'll continue to work
        
        # Update config
        try:
            subnet4 = config.get('Dhcp4', {}).get('subnet4', [])
            if not subnet4:
                raise Exception("No subnet4 configuration found")
            
            subnet = subnet4[0]
            
            # Update pool range
            # If all IPs are reserved (pool_start > pool_end), remove the pool entirely
            if pool_start is None or pool_end is None or pool_start > pool_end:
                # All IPs are reserved, remove pool configuration
                if 'pools' in subnet:
                    subnet['pools'] = []
            else:
                # Normal case: set the pool range
                new_pool_range = f"192.168.123.{pool_start} - 192.168.123.{pool_end}"
                if 'pools' not in subnet or not subnet['pools']:
                    subnet['pools'] = [{'pool': new_pool_range}]
                else:
                    subnet['pools'][0]['pool'] = new_pool_range
            
            # If max_reservations = 0, remove any reservations from the reserved range
            # (Actually, we should keep existing reservations, they'll just be in the pool range)
            # But we need to ensure the reserved range is empty in the config
            # Actually, if max_reservations = 0, there's no reserved range, so reservations
            # should still work but they'll be in the pool range. Let's not remove them.
            
            # Update config
            self.update_config(config)
            
            return True
        except Exception as e:
            raise Exception(f"Failed to update pool boundary: {str(e)}")
