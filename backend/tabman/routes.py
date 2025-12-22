"""
Tab management routes and functions.
"""
import json
from flask import current_app, jsonify, request
from backend import socketio
from . import bp
from backend.utils.utils import safe_write_config, is_using_factory_config, factory_mode_error

@bp.route('/api/tabs', methods=['GET'])
def get_tabs():
    """Get all tabs and their configurations."""
    try:
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
            
        # Ensure we have valid tabs structure
        tabs = config.get('tabs', {})
        if not isinstance(tabs, dict):
            tabs = {}
            
        # Filter valid tabs and add fallback
        valid_tabs = {
            k: v for k, v in tabs.items() 
            if (isinstance(v, dict) and 'config' in v and k != 'starred' and  # Exclude starred from tab list
                v.get('config', {}).get('isEnabled', False))  # Only include enabled tabs
        }
        
        # Add fallback tab
        valid_tabs['fallback'] = {
            'config': {
                'id': 'fallback',
                'displayName': 'produced by HOMESERVER LLC',
                'order': 999,
                'isEnabled': True,
                'adminOnly': False
            },
            'visibility': {'tab': True, 'elements': {}},
            'data': {}
        }

        # Get starred tab from tabs section
        starred_tab = tabs.get('starred', 'fallback')
        
        # Validate starred tab exists and is enabled, otherwise use fallback
        if starred_tab not in valid_tabs or not valid_tabs[starred_tab]['config']['isEnabled']:
            starred_tab = 'fallback'
        
        return jsonify({
            'tabs': valid_tabs,
            'starredTab': starred_tab
        }), 200
        
    except FileNotFoundError:
        # Return minimal valid state with fallback
        return jsonify({
            'tabs': {
                'fallback': {
                    'config': {
                        'id': 'fallback',
                        'displayName': 'produced by HOMESERVER LLC',
                        'order': 999,
                        'isEnabled': True,
                        'adminOnly': False
                    },
                    'visibility': {'tab': True, 'elements': {}},
                    'data': {}
                }
            },
            'starredTab': 'fallback'
        }), 200
    except json.JSONDecodeError:
        current_app.logger.error('Invalid JSON in homeserver.json')
        return jsonify({'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'Error loading tabs: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/setstarredtab', methods=['POST'])
def set_starred_tab():
    """Set the starred tab in configuration."""
    try:
        # Check for factory config mode first
        if is_using_factory_config():
            return factory_mode_error()
            
        data = request.get_json()
        tab_id = data.get('tabId')
        
        if not tab_id:
            return jsonify({'error': 'Missing tabId parameter'}), 400
            
        # Special case: Allow fallback tab without further validation
        if tab_id == 'fallback':
            with open(current_app.config['HOMESERVER_CONFIG']) as f:
                config = json.load(f)
            
            # Update starred tab within tabs section
            tabs = config.get('tabs', {})
            tabs['starred'] = 'fallback'
            config['tabs'] = tabs
            
            # Use safe write function
            def write_operation():
                with open(current_app.config['HOMESERVER_CONFIG'], 'w') as f:
                    json.dump(config, f, indent=2)
                    
            if not safe_write_config(write_operation):
                return jsonify({'error': 'Failed to update configuration'}), 500
                
            # Notify clients via WebSocket
            socketio.emit('starred_tab_updated', {'tabId': 'fallback'})
            
            return jsonify({'success': True, 'starredTab': 'fallback'}), 200
            
        # Read current config
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
        
        # Get tabs and validate tab exists
        tabs = config.get('tabs', {})
        if tab_id not in tabs:
            return jsonify({'error': 'Invalid tab ID'}), 400
            
        tab = tabs[tab_id]
        
        # Check if tab is enabled and visible
        if not tab.get('config', {}).get('isEnabled', False):
            return jsonify({'error': 'Cannot star disabled tab'}), 400
            
        if not tab.get('visibility', {}).get('tab', False):
            return jsonify({'error': 'Cannot star hidden tab'}), 400
            
        # Admin-only tabs can never be starred
        if tab.get('config', {}).get('adminOnly', False):
            return jsonify({'error': 'Cannot star admin-only tabs'}), 400
            
        # Update starred tab within tabs section
        tabs['starred'] = tab_id
        config['tabs'] = tabs
        
        # Use safe write function
        def write_operation():
            with open(current_app.config['HOMESERVER_CONFIG'], 'w') as f:
                json.dump(config, f, indent=2)
                
        if not safe_write_config(write_operation):
            return jsonify({'error': 'Failed to update configuration'}), 500
            
        # Notify clients via WebSocket
        socketio.emit('starred_tab_updated', {'tabId': tab_id})
        
        current_app.logger.info(f"[USER ACTION] Tab starred: {tab_id}")
        
        return jsonify({'success': True, 'starredTab': tab_id}), 200
            
    except FileNotFoundError:
        return jsonify({'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid configuration file'}), 500
    except KeyError as e:
        # Specifically catch KeyError for HOMESERVER_CONFIG to provide better error message
        if str(e) == "'HOMESERVER_CONFIG'":
            current_app.logger.error(f'Error setting starred tab: Config path not initialized. Error: {str(e)}')
            current_app.logger.exception('Full traceback:')
        else:
            current_app.logger.error(f'Error setting starred tab: Missing key {str(e)}')
            current_app.logger.exception('Full traceback:')
        return jsonify({'error': 'Internal server error'}), 500
    except Exception as e:
        current_app.logger.error(f'Error setting starred tab: {str(e)}')
        current_app.logger.exception('Full traceback:')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/tabs/visibility', methods=['POST'])
def update_tab_visibility():
    """Update tab visibility in configuration."""
    try:
        # Check for factory config mode first
        if is_using_factory_config():
            return factory_mode_error()
            
        data = request.get_json()
        tab_id = data.get('tabId')
        visibility = data.get('visibility')
        
        if not tab_id or visibility is None:
            return jsonify({'error': 'Missing required parameters'}), 400
            
        # Read current config
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
        
        # Get tabs and validate tab exists
        tabs = config.get('tabs', {})
        if tab_id not in tabs:
            return jsonify({'error': 'Invalid tab ID'}), 400
            
        # Update visibility
        if 'visibility' not in tabs[tab_id]:
            tabs[tab_id]['visibility'] = {}
        
        tabs[tab_id]['visibility']['tab'] = visibility
        
        # Use safe write function
        def write_operation():
            with open(current_app.config['HOMESERVER_CONFIG'], 'w') as f:
                json.dump(config, f, indent=2)
                
        if not safe_write_config(write_operation):
            return jsonify({'error': 'Failed to update configuration'}), 500
            
        # Notify clients via WebSocket
        socketio.emit('visibility_updated', {'tabId': tab_id, 'visibility': visibility})
        
        action = "shown" if visibility else "hidden"
        current_app.logger.info(f"[USER ACTION] Tab {action}: {tab_id}")
        
        return jsonify({
            'success': True,
            'tabId': tab_id,
            'visibility': visibility
        }), 200
            
    except FileNotFoundError:
        return jsonify({'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'Error updating tab visibility: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/api/tabs/elements', methods=['PUT'])
def update_element_visibility():
    """Update element visibility within a tab."""
    try:
        # Check for factory config mode first
        if is_using_factory_config():
            return factory_mode_error()
            
        data = request.get_json()
        tab_id = data.get('tabId')
        element_id = data.get('elementId')
        visibility = data.get('visibility')
        
        # Validate all required parameters
        if not tab_id or not element_id or visibility is None:
            return jsonify({'error': 'Missing tabId, elementId, or visibility'}), 400
            
        # Read current config
        with open(current_app.config['HOMESERVER_CONFIG']) as f:
            config = json.load(f)
        
        # Get tabs and validate tab exists
        tabs = config.get('tabs', {})
        if tab_id not in tabs:
            return jsonify({'error': 'Invalid tab ID'}), 400
            
        # Ensure visibility structure exists
        if 'visibility' not in tabs[tab_id]:
            tabs[tab_id]['visibility'] = {'tab': True, 'elements': {}}
        if 'elements' not in tabs[tab_id]['visibility']:
            tabs[tab_id]['visibility']['elements'] = {}
            
        # Update specific element visibility
        tabs[tab_id]['visibility']['elements'][element_id] = bool(visibility)
        
        # Use safe write function
        def write_operation():
            with open(current_app.config['HOMESERVER_CONFIG'], 'w') as f:
                json.dump(config, f, indent=2)
                
        if not safe_write_config(write_operation):
            return jsonify({'error': 'Failed to update configuration'}), 500
            
        # Notify clients via WebSocket
        socketio.emit('element_visibility_updated', {
            'tabId': tab_id,
            'elementId': element_id,
            'visibility': visibility
        })
        
        return jsonify({
            'success': True,
            'tabId': tab_id,
            'elementId': element_id,
            'visibility': visibility
        }), 200
            
    except FileNotFoundError:
        return jsonify({'error': 'Configuration file not found'}), 404
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid configuration file'}), 500
    except Exception as e:
        current_app.logger.error(f'Error updating element visibility: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500