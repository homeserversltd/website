"""
Portal management routes and functions.
"""
import json
import subprocess
from typing import Dict, Tuple
from flask import current_app, jsonify, send_from_directory, request
from . import bp
from backend.utils.utils import execute_systemctl_command, write_to_log, safe_write_config, is_using_factory_config, factory_mode_error
from .utils import get_service_mappings
from backend.auth.decorators import visibility_required, admin_required

@bp.route('/api/portals', methods=['GET'])
def get_portals():
    """Get all portals from the configuration."""
    try:
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            
        # Get portals data from config
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        
        return jsonify({
            'success': True,
            'portals': portals
        }), 200
        
    except FileNotFoundError:
        return jsonify({'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'Error getting portals: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/portals', methods=['POST'])
@admin_required
def add_portal():
    """Add a new portal to the configuration."""
    try:
        # Check for factory config mode first
        if is_using_factory_config():
            return factory_mode_error()
            
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Get portal type (default to 'systemd' for backward compatibility)
        portal_type = data.get('type', 'systemd')
        
        # Validate required fields (port and services are optional for 'link' type)
        required_fields = ['name', 'description', 'localURL']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
                
        # Validate data types and values
        if not isinstance(data['name'], str) or not data['name'].strip():
            return jsonify({'error': 'Portal name must be a non-empty string'}), 400
            
        if not isinstance(data['description'], str):
            return jsonify({'error': 'Description must be a string'}), 400
        
        # Services and port are only required for non-link types
        if portal_type != 'link':
            if 'services' not in data:
                return jsonify({'error': 'Missing required field: services'}), 400
            if not isinstance(data['services'], list) or not data['services']:
                return jsonify({'error': 'Services must be a non-empty list'}), 400
            
            if 'port' not in data:
                return jsonify({'error': 'Missing required field: port'}), 400
            if not isinstance(data['port'], int) or data['port'] <= 0 or data['port'] > 65535:
                return jsonify({'error': 'Port must be a valid integer between 1 and 65535'}), 400
            
        if not isinstance(data['localURL'], str) or not data['localURL'].strip():
            return jsonify({'error': 'Local URL must be a non-empty string'}), 400
            
        # Read current config
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            
        # Ensure the portals structure exists
        if 'tabs' not in config:
            config['tabs'] = {}
        if 'portals' not in config['tabs']:
            config['tabs']['portals'] = {}
        if 'data' not in config['tabs']['portals']:
            config['tabs']['portals']['data'] = {}
        if 'portals' not in config['tabs']['portals']['data']:
            config['tabs']['portals']['data']['portals'] = []
            
        portals = config['tabs']['portals']['data']['portals']
        
        # Check if portal with this name already exists
        if any(portal.get('name') == data['name'] for portal in portals):
            return jsonify({'error': f'Portal with name "{data["name"]}" already exists'}), 400
            
        # Check if port is already in use (only for non-link types)
        if portal_type != 'link' and 'port' in data:
            if any(portal.get('port') == data['port'] for portal in portals):
                return jsonify({'error': f'Port {data["port"]} is already in use by another portal'}), 400
            
        # Create new portal object
        new_portal = {
            'name': data['name'].strip(),
            'description': data['description'].strip(),
            'services': data.get('services', []),  # Empty array for link type
            'type': portal_type,
            'localURL': data['localURL'].strip(),
        }
        
        # Only include port if not link type
        if portal_type != 'link' and 'port' in data:
            new_portal['port'] = data['port']
        
        # Add the new portal to the list
        portals.append(new_portal)
        
        # Use safe write function
        def write_operation():
            with open(current_app.config['HOMESERVER_CONFIG'], 'w') as f:
                json.dump(config, f, indent=2)
                
        if not safe_write_config(write_operation):
            return jsonify({'error': 'Failed to update configuration'}), 500
            
        # Log the operation
        write_to_log('admin', f'Portal "{new_portal["name"]}" added successfully', 'info')
        
        return jsonify({
            'success': True,
            'message': f'Portal "{new_portal["name"]}" added successfully',
            'portal': new_portal
        }), 201
        
    except FileNotFoundError:
        return jsonify({'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'Error adding portal: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/portals/<portal_name>', methods=['DELETE'])
@admin_required
def delete_portal(portal_name):
    """Delete a custom portal from the configuration."""
    try:
        # Check for factory config mode first
        if is_using_factory_config():
            return factory_mode_error()
            
        # Read current config
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            
        # Get portals data from config
        portals = config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
        
        # Find the portal to delete
        portal_to_delete = None
        portal_index = None
        for i, portal in enumerate(portals):
            if portal.get('name') == portal_name:
                portal_to_delete = portal
                portal_index = i
                break
                
        if portal_to_delete is None:
            return jsonify({'error': f'Portal "{portal_name}" not found'}), 404
            
        # Check if this is a factory portal (should not be deletable)
        # We'll need to load the factory config to compare
        try:
            factory_config_path = current_app.config.get('FACTORY_CONFIG', 
                                                        current_app.config['HOMESERVER_CONFIG'].replace('.json', '.factory'))
            with open(factory_config_path) as f:
                factory_config = json.load(f)
                
            factory_portals = factory_config.get('tabs', {}).get('portals', {}).get('data', {}).get('portals', [])
            factory_portal_names = {portal.get('name') for portal in factory_portals}
            
            if portal_name in factory_portal_names:
                return jsonify({'error': f'Cannot delete factory portal "{portal_name}". Only custom portals can be deleted.'}), 400
                
        except FileNotFoundError:
            current_app.logger.warning('Factory config not found, allowing deletion of any portal')
        except Exception as e:
            current_app.logger.error(f'Error reading factory config: {str(e)}')
            # Continue with deletion if we can't read factory config
            
        # Remove the portal from the list
        portals.pop(portal_index)
        
        # Also remove from visibility elements if it exists
        visibility_elements = config.get('tabs', {}).get('portals', {}).get('visibility', {}).get('elements', {})
        if portal_name in visibility_elements:
            del visibility_elements[portal_name]
            
        # Use safe write function
        def write_operation():
            with open(current_app.config['HOMESERVER_CONFIG'], 'w') as f:
                json.dump(config, f, indent=2)
                
        if not safe_write_config(write_operation):
            return jsonify({'error': 'Failed to update configuration'}), 500
            
        # Log the operation
        write_to_log('admin', f'Portal "{portal_name}" deleted successfully', 'info')
        
        return jsonify({
            'success': True,
            'message': f'Portal "{portal_name}" deleted successfully'
        }), 200
        
    except FileNotFoundError:
        return jsonify({'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'Error deleting portal: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/portals/factory', methods=['GET'])
def get_factory_portals():
    """Get factory portal names for comparison."""
    try:
        current_app.logger.debug("[FACTORY] Starting factory portals request")
        
        # Get the factory config path (hardcoded to system-wide factory file)
        factory_config_path = '/etc/homeserver.factory'
        current_app.logger.debug(f"[FACTORY] Using factory config path: {factory_config_path}")
        
        # Check if file exists
        import os
        if not os.path.exists(factory_config_path):
            current_app.logger.error(f"[FACTORY] Factory config file does not exist: {factory_config_path}")
            return jsonify({
                'success': True,
                'factoryPortals': []
            }), 200
        
        current_app.logger.debug(f"[FACTORY] Factory config file exists, attempting to read")
        
        # Read and parse the factory config
        with open(factory_config_path) as f:
            factory_config = json.load(f)
            
        current_app.logger.debug(f"[FACTORY] Successfully loaded factory config, keys: {list(factory_config.keys())}")
        
        # Navigate to portals section
        tabs = factory_config.get('tabs', {})
        current_app.logger.debug(f"[FACTORY] Tabs section keys: {list(tabs.keys())}")
        
        portals_tab = tabs.get('portals', {})
        current_app.logger.debug(f"[FACTORY] Portals tab keys: {list(portals_tab.keys())}")
        
        portals_data = portals_tab.get('data', {})
        current_app.logger.debug(f"[FACTORY] Portals data keys: {list(portals_data.keys())}")
        
        factory_portals = portals_data.get('portals', [])
        current_app.logger.debug(f"[FACTORY] Found {len(factory_portals)} factory portals")
        
        # Extract portal names
        factory_portal_names = []
        for i, portal in enumerate(factory_portals):
            portal_name = portal.get('name')
            if portal_name:
                factory_portal_names.append(portal_name)
                current_app.logger.debug(f"[FACTORY] Portal {i+1}: {portal_name}")
            else:
                current_app.logger.warning(f"[FACTORY] Portal {i+1} has no name: {portal}")
        
        current_app.logger.debug(f"[FACTORY] Returning {len(factory_portal_names)} factory portal names: {factory_portal_names}")
        
        return jsonify({
            'success': True,
            'factoryPortals': factory_portal_names
        }), 200
        
    except FileNotFoundError as e:
        current_app.logger.error(f"[FACTORY] Factory config file not found: {str(e)}")
        return jsonify({
            'success': True,
            'factoryPortals': []
        }), 200
    except json.JSONDecodeError as e:
        current_app.logger.error(f"[FACTORY] Invalid JSON in factory config: {str(e)}")
        return jsonify({'error': 'Invalid factory config JSON'}), 500
    except Exception as e:
        current_app.logger.error(f'[FACTORY] Error getting factory portals: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/service/control', methods=['POST'])
@admin_required
def service_control():
    """Control and check status of services."""
    try:
        data = request.get_json()
        if not data or 'service' not in data or 'action' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing service or action'
            }), 400

        service = data['service']
        action = data['action']

        current_app.logger.info(f"Service control: {action} {service}")

        # Basic validation - just check for dangerous characters
        if not service or any(c in service for c in ['..', '/', ';', '&', '|', '`', '$']):
            return jsonify({
                'success': False,
                'error': 'Invalid service name'
            }), 400

        # Add .service suffix if not present
        systemd_service = service if service.endswith('.service') else f"{service}.service"

        current_app.logger.info(f"Using systemd service: {systemd_service}")

        # Map actions to systemctl commands
        action_map = {
            'start': 'start',
            'stop': 'stop',
            'restart': 'restart',
            'status': 'status',
            'enable': 'enable',
            'disable': 'disable'
        }

        if action not in action_map:
            return jsonify({
                'success': False,
                'error': 'Invalid action'
            }), 400

        # Execute the command
        success, output = execute_systemctl_command(action_map[action], systemd_service)

        # Special handling for 'status' action - always return 200 with the status information
        if action == 'status':
            current_app.logger.info(f"Service status for {systemd_service}: {'active' if success else 'inactive/failed'}")
            return jsonify({
                'success': True,
                'message': f"Successfully executed status on {service}",
                'output': output,
                'active': success  # Include whether the service is active
            })
        
        # For other actions, handle success/failure as before
        if success:
            # Log successful service operations
            if action in ['start', 'stop', 'restart', 'enable', 'disable']:
                write_to_log('admin', f'Service {service} {action}ed successfully', 'info')
            current_app.logger.info(f"Service {action} successful for {systemd_service}")
            return jsonify({
                'success': True,
                'message': f"Successfully executed {action} on {service}",
                'output': output
            })
        else:
            # Log failed service operations
            if action in ['start', 'stop', 'restart', 'enable', 'disable']:
                write_to_log('admin', f'Failed to {action} service {service}: {output}', 'error')
            current_app.logger.error(f"Service {action} failed for {systemd_service}: {output}")
            return jsonify({
                'success': False,
                'error': output
            }), 500

    except Exception as e:
        # Log unexpected errors
        if 'action' in locals() and 'service' in locals():
            write_to_log('admin', f'Error during service {action} operation on {service}: {str(e)}', 'error')
        current_app.logger.error(f"Error in service_control: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@bp.route('/api/portals/images/<path:filename>', methods=['GET'])
def get_portal_image(filename):
    """
    Serve portal images from the hard-coded directory.
    The images are stored in /var/www/homeserver/src/tablets/portals/images.
    """
    return send_from_directory('/var/www/homeserver/src/tablets/portals/images', filename)