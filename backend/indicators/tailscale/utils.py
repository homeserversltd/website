"""
Tailscale helper functions and utilities.
"""
import json
import re
import subprocess
import os
import time
import tempfile
from typing import Tuple
from flask import current_app
from backend.utils.utils import (
    execute_systemctl_command, 
    safe_write_config,
    is_using_factory_config
)

def is_tailscale_service_enabled() -> bool:
    """Check if the Tailscale service is enabled."""
    try:
        success, output = execute_systemctl_command('is-enabled', 'tailscaled.service')
        return success and output.strip().lower() == 'enabled'
    except Exception as e:
        current_app.logger.error(f"Error checking if Tailscale service is enabled: {str(e)}")
        return False

def needs_initial_authentication() -> bool:
    """Check if Tailscale needs initial authentication (first-time setup)."""
    try:
        current_app.logger.info("[TAIL] Starting needs_initial_authentication check...")
        # Check if tailscale status shows we need login
        status_result = subprocess.run(
            ['/usr/bin/tailscale', 'status'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        current_app.logger.debug(f"[TAIL] tailscale status return code: {status_result.returncode}")
        current_app.logger.debug(f"[TAIL] tailscale status stdout: {status_result.stdout}")
        current_app.logger.debug(f"[TAIL] tailscale status stderr: {status_result.stderr}")
        
        # Check stdout for "Logged out." message (this is the key indicator)
        if "Logged out." in status_result.stdout:
            current_app.logger.info("[TAIL] Detected 'Logged out.' - need for initial authentication")
            return True
        
        # If tailscale status returns specific error codes or messages indicating need for auth
        if status_result.returncode != 0:
            stderr_output = status_result.stderr.lower()
            stdout_output = status_result.stdout.lower()
            
            # Common indicators that initial auth is needed
            auth_needed_indicators = [
                'not logged in',
                'not connected',
                'needs login',
                'authorization required',
                'authenticate',
                'logged out'
            ]
            
            if any(indicator in stderr_output for indicator in auth_needed_indicators):
                current_app.logger.info(f"[TAIL] Detected need for initial authentication in stderr: {status_result.stderr}")
                return True
                
            if any(indicator in stdout_output for indicator in auth_needed_indicators):
                current_app.logger.info(f"[TAIL] Detected need for initial authentication in stdout: {status_result.stdout}")
                return True
                
        return False
        
    except Exception as e:
        current_app.logger.error(f"[TAIL] Error checking if initial authentication needed: {str(e)}")
        return False

def generate_login_url() -> str:
    """Proactively run 'tailscale up' to generate a login URL for first-time setup."""
    try:
        current_app.logger.info("[TAIL] Attempting to generate login URL via tailUp script")
        
        result = subprocess.run(
            ['/usr/bin/sudo', '/usr/local/sbin/tailUp'],
            capture_output=True,
            text=True,
            timeout=15
        )
        
        current_app.logger.info(f"[TAIL] tailUp script return code: {result.returncode}")
        current_app.logger.info(f"[TAIL] tailUp script output: {result.stdout.strip()}")
        
        if result.returncode == 0:
            # Script succeeded, output should be the login URL
            login_url = result.stdout.strip()
            if login_url and login_url.startswith('https://login.tailscale.com/'):
                current_app.logger.info(f"[TAIL] Successfully generated login URL: {login_url}")
                return login_url
            else:
                current_app.logger.warning(f"[TAIL] Script succeeded but output doesn't look like a URL: {login_url}")
        else:
            # Script failed, log the error output
            current_app.logger.error(f"[TAIL] tailUp script failed with output: {result.stdout}")
            if result.stderr:
                current_app.logger.error(f"[TAIL] tailUp script stderr: {result.stderr}")
        
        return ""
        
    except subprocess.TimeoutExpired:
        current_app.logger.error("[TAIL] Timeout while running tailUp script")
        return ""
    except Exception as e:
        current_app.logger.error(f"[TAIL] Error running tailUp script: {str(e)}")
        return ""

def get_tailscale_status() -> dict:
    """Get Tailscale connection status and IP."""
    try:
        interface_exists = os.path.exists('/sys/class/net/tailscale0')
        if not interface_exists:
            return {"status": "disconnected", "ip": None, "interface": False, "timestamp": time.time()}

        ip_result = subprocess.run(
            ['/usr/sbin/ip', '-details', 'address', 'show', 'tailscale0'],
            capture_output=True,
            text=True
        )
        interface_up = 'LOWER_UP' in ip_result.stdout
        ip_match = re.search(r'\b100(\.\d+){3}\b', ip_result.stdout)
        ip = ip_match.group(0) if ip_match else None

        status_result = subprocess.run(
            ['/usr/bin/tailscale', 'status', '--json'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if status_result.returncode == 0:
            try:
                status_data = json.loads(status_result.stdout)
                truly_connected = status_data.get('BackendState') == 'Running'
            except json.JSONDecodeError:
                truly_connected = False
        else:
            truly_connected = False

        connected = truly_connected and interface_up and ip is not None
        
        # Check if the service is enabled (for admin users)
        is_enabled = is_tailscale_service_enabled()
        
        # Check for login URL when service is enabled but not connected
        login_url = None
        if is_enabled and not connected:
            try:
                current_app.logger.info(f"[TAIL] Service enabled but not connected, checking for login URL...")
                
                # First, check if we need initial authentication
                current_app.logger.info("[TAIL] Calling needs_initial_authentication()...")
                needs_auth = needs_initial_authentication()
                current_app.logger.info(f"[TAIL] needs_initial_authentication() returned: {needs_auth}")
                
                if needs_auth:
                    current_app.logger.info("[TAIL] Detected need for initial authentication, generating login URL...")
                    login_url = generate_login_url()
                    if login_url:
                        current_app.logger.info(f"[TAIL] Successfully generated login URL: {login_url}")
                    else:
                        current_app.logger.warning("[TAIL] Failed to generate login URL, falling back to service status check")
                else:
                    current_app.logger.info("[TAIL] No need for initial authentication detected")
                
                # If we still don't have a login URL, check systemctl status as fallback
                if not login_url:
                    service_status_result = subprocess.run(
                        ['/usr/bin/sudo', '/usr/bin/systemctl', 'status', 'tailscaled.service'],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    current_app.logger.info(f"[TAIL] Systemctl status return code: {service_status_result.returncode}")
                    current_app.logger.debug(f"[TAIL] Systemctl status output: {service_status_result.stdout}")
                    
                    if service_status_result.returncode == 0:
                        # Look for login URL in the status output
                        login_match = re.search(r'https://login\.tailscale\.com/a/[a-zA-Z0-9]+', service_status_result.stdout)
                        if login_match:
                            login_url = login_match.group(0)
                            current_app.logger.info(f"[TAIL] Found login URL in service status: {login_url}")
                        else:
                            current_app.logger.info(f"[TAIL] No login URL found in service status output")
                            # Let's also check for the "Needs login" text pattern
                            if "Needs login:" in service_status_result.stdout:
                                current_app.logger.info(f"[TAIL] Found 'Needs login:' text in status")
                    else:
                        current_app.logger.warning(f"[TAIL] Systemctl status failed with stderr: {service_status_result.stderr}")
                        
            except Exception as e:
                current_app.logger.error(f"[TAIL] Error checking service status for login URL: {str(e)}")

        result = {
            "status": "connected" if connected else "disconnected",
            "ip": ip,
            "interface": True,
            "isEnabled": is_enabled,
            "timestamp": time.time()
        }
        
        # Add login URL if found
        if login_url:
            result["loginUrl"] = login_url
            
        return result

    except subprocess.TimeoutExpired:
        return {"status": "error", "error": "Status check timed out", "interface": True, "timestamp": time.time()}
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "interface": interface_exists if 'interface_exists' in locals() else False,
            "timestamp": time.time()
        }

def get_tailnet_name() -> str:
    """Extract Tailnet name from homeserver.json config using the configured path."""
    try:
        config_path = current_app.config['HOMESERVER_CONFIG']
        with open(config_path, 'r') as f:
            config = json.load(f)
        # Try to extract from portals remoteURL - support both 'server.' and 'home.' patterns
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        for portal in portals:
            remote_url = portal.get('remoteURL', '')
            # Try server.{tailnet}.ts.net pattern first
            match = re.match(r'https://server\.([a-zA-Z0-9-]+)\.ts\.net', remote_url)
            if match:
                return match.group(1)
            # Try home.{tailnet}.ts.net pattern as fallback
            match = re.match(r'https://home\.([a-zA-Z0-9-]+)\.ts\.net', remote_url)
            if match:
                return match.group(1)
        # Fallback: try CORS allowed_origins - support both patterns
        allowed_origins = config.get('global', {}).get('cors', {}).get('allowed_origins', [])
        for origin in allowed_origins:
            # Try server.{tailnet}.ts.net pattern first
            match = re.match(r'https://server\.([a-zA-Z0-9-]+)\.ts\.net', origin)
            if match:
                return match.group(1)
            # Try home.{tailnet}.ts.net pattern as fallback
            match = re.match(r'https://home\.([a-zA-Z0-9-]+)\.ts\.net', origin)
            if match:
                return match.group(1)
        return ''
    except Exception as e:
        current_app.logger.error(f"Error getting Tailnet name from homeserver.json: {str(e)}")
        return ''


def update_caddy_api_config(name: str) -> Tuple[bool, str]:
    """Update Tailnet name in Caddy's API configuration."""
    try:
        # Get current config
        check_result = subprocess.run(
            ['/usr/bin/curl', '-s', 'http://localhost:2019/config/'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if check_result.returncode != 0:
            return False, f"Failed to get Caddy config: {check_result.stderr}"

        current_config = json.loads(check_result.stdout)
        
        # Update configuration
        servers = current_config.get('apps', {}).get('http', {}).get('servers', {})
        old_name = None
        
        # Find and update Tailscale server block
        for server_name, server_config in servers.items():
            for route in server_config.get('routes', []):
                for matcher in route.get('match', []):
                    hosts = matcher.get('host', [])
                    for host in hosts:
                        if '.ts.net' in host:
                            old_name = host
                            matcher['host'] = [f"server.{name}.ts.net"]

        if not old_name:
            return False, "No Tailscale server block found"

        # Update TLS automation policy
        policies = current_config.get('tls', {}).get('automation', {}).get('policies', [])
        for policy in policies:
            if 'subjects' in policy and any('.ts.net' in subject for subject in policy['subjects']):
                policy['subjects'] = [f"server.{name}.ts.net"]

        # Send updated configuration
        update_result = subprocess.run(
            ['/usr/bin/curl', '-s', '-X', 'POST',
             'http://localhost:2019/load',
             '-H', 'Content-Type: application/json',
             '-d', json.dumps(current_config)],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if update_result.returncode != 0:
            return False, f"Failed to update configuration: {update_result.stderr}"

        return True, "Successfully updated Caddy API configuration"

    except Exception as e:
        return False, f"Error updating Caddy API configuration: {str(e)}"


def update_caddyfile(name: str) -> Tuple[bool, str]:
    """Update Tailnet name in Caddyfile."""
    try:
        with open('/etc/caddy/Caddyfile', 'r') as f:
            caddyfile_content = f.read()

        match = re.search(r'server\.([a-zA-Z0-9-]+)\.ts\.net', caddyfile_content)
        if not match:
            return False, "Could not find existing Tailnet name in Caddyfile"

        current_name = match.group(1)
        
        # Copy to temp file first
        subprocess.run(['/usr/bin/sudo', 'cp', '/etc/caddy/Caddyfile', '/tmp/Caddyfile.new'], check=True)
        
        # Update the file
        sed_cmd = f'/usr/bin/sudo sed -i "s/server\.{current_name}\.ts\.net/server.{name}.ts.net/g" /tmp/Caddyfile.new'
        process = subprocess.run(sed_cmd, shell=True, text=True, capture_output=True)

        if process.returncode != 0:
            return False, f"Failed to update Caddyfile: {process.stderr}"

        # Move back
        subprocess.run(['/usr/bin/sudo', 'dd', 'if=/tmp/Caddyfile.new', 'of=/etc/caddy/Caddyfile'], check=True)
        subprocess.run(['/usr/bin/sudo', 'rm', '-f', '/tmp/Caddyfile.new'], check=True)
        
        return True, f"Successfully updated Caddyfile from {current_name} to {name}"

    except Exception as e:
        return False, f"Failed to update Caddyfile: {str(e)}"

def update_homeserver_config(name: str) -> Tuple[bool, str]:
    """Update Tailnet name in homeserver.json configuration."""
    try:
        # Check for factory config mode first
        if is_using_factory_config():
            current_app.logger.warning("[TAIL] Cannot update config - using factory config")
            return False, "Cannot update configuration while using factory fallback configuration"
            
        current_app.logger.info(f"[TAIL] Reading current homeserver.json configuration")
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)

        # Update CORS origins
        cors_origins = config.get('global', {}).get('cors', {}).get('allowed_origins', [])
        updated_cors = False

        for i, origin in enumerate(cors_origins):
            if '.ts.net' in origin:
                cors_origins[i] = f"https://server.{name}.ts.net"
                updated_cors = True

        if not updated_cors:
            cors_origins.append(f"https://server.{name}.ts.net")

        # Ensure config structure exists
        if 'global' not in config:
            config['global'] = {}
        if 'cors' not in config['global']:
            config['global']['cors'] = {}
        config['global']['cors']['allowed_origins'] = cors_origins

        # Update portal remoteURLs
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        for portal in portals:
            if 'remoteURL' in portal and '.ts.net' in portal['remoteURL']:
                portal['remoteURL'] = f"https://server.{name}.ts.net{portal['remoteURL'].split('.ts.net')[-1]}"

        current_app.logger.info("[TAIL] Writing updated configuration to temp file")
        # Write to temp file first for atomic update
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
            json.dump(config, temp_file, indent=2)
            temp_path = temp_file.name

        current_app.logger.info("[TAIL] Moving temp file to final location")
        # Move temp file to final location using dd for atomic write
        subprocess.run(['/usr/bin/sudo', 'dd', f'if={temp_path}', f'of={current_app.config["HOMESERVER_CONFIG"]}'], check=True)
        os.unlink(temp_path)

        current_app.logger.info("[TAIL] Successfully updated homeserver.json configuration")
        return True, "Successfully updated homeserver.json configuration"

    except Exception as e:
        error_msg = f"Failed to update homeserver.json: {str(e)}"
        current_app.logger.error(f"[TAIL] {error_msg}")
        return False, error_msg



def update_tailnet_name_v2(name: str) -> Tuple[bool, str]:
    """Update Tailnet name across all configurations (v2 - nginx based)."""
    try:
        # Check for factory config mode first
        if is_using_factory_config():
            current_app.logger.warning("[TAIL] Cannot update Tailnet name - using factory config")
            return False, "Cannot update Tailnet name while using factory fallback configuration"
            
        if not re.match(r'^[a-zA-Z0-9-]+$', name):
            current_app.logger.error(f"[TAIL] Invalid tailnet name format: {name}")
            return False, "Invalid tailnet name format"

        current_app.logger.info(f"[TAIL] Starting tailnet update process for: {name}")

        # Update homeserver.json configuration first
        config_success, config_message = update_homeserver_config(name)
        if not config_success:
            current_app.logger.error(f"[TAIL] Failed to update homeserver.json: {config_message}")
            return False, config_message

        current_app.logger.info("[TAIL] Successfully updated homeserver.json configuration")

        # Run the tailnetName script to update nginx configuration
        current_app.logger.info("[TAIL] Running tailnetName to update nginx configuration")
        current_app.logger.info("[TAIL] Executing: sudo /usr/local/sbin/tailnetName")
        result = subprocess.run(
            ['/usr/bin/sudo', '/usr/local/sbin/tailnetName'],
            capture_output=True,
            text=True,
            timeout=30  # Give it enough time to restart nginx
        )
        
        if result.returncode != 0:
            error_msg = f"Failed to update nginx configuration: {result.stderr}"
            current_app.logger.error(f"[TAIL] {error_msg}")
            current_app.logger.error(f"[TAIL] Script output: {result.stdout}")
            current_app.logger.error(f"[TAIL] Script error: {result.stderr}")
            current_app.logger.error(f"[TAIL] Exit code: {result.returncode}")
            return False, error_msg

        current_app.logger.info("[TAIL] Successfully updated nginx configuration")

        # Restart gunicorn to apply CORS changes
        current_app.logger.info("[TAIL] Restarting gunicorn to apply CORS changes")
        success, message = execute_systemctl_command('restart', 'gunicorn.service')
        if not success:
            current_app.logger.error(f"[TAIL] Failed to restart gunicorn: {message}")
            return False, f"Failed to restart gunicorn: {message}"

        current_app.logger.info(f"[TAIL] Successfully updated Tailnet name to {name}")
        return True, f"Successfully updated Tailnet name to {name}"
        
    except subprocess.TimeoutExpired:
        error_msg = "Timeout while updating nginx configuration"
        current_app.logger.error(f"[TAIL] {error_msg}")
        return False, error_msg
    except Exception as e:
        error_msg = f"Error updating Tailnet name: {str(e)}"
        current_app.logger.error(f"[TAIL] {error_msg}")
        return False, error_msg