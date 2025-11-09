"""
System statistics and monitoring routes and functions.
"""
import os
import time
import json
import psutil
import speedtest
import subprocess
import threading
import csv
from backend import socketio  # Import socketio instance from backend package
from typing import Dict, List, Optional
from collections import defaultdict
from flask import current_app, jsonify, request
from . import bp
from backend.monitors.system import SystemStatsMonitor
from backend.utils.utils import write_to_log, safe_write_config, is_using_factory_config, factory_mode_error
from backend.auth.decorators import visibility_required, admin_required
from backend.stats.utils import (
    read_rapl_energy, get_physical_devices, collect_system_stats,
    collect_process_stats, collect_disk_usage
)
stats_monitor = SystemStatsMonitor()

@bp.route('/api/status/internet/speedtest', methods=['POST'])
@admin_required
def run_speed_test():
    """Run a network speed test and return results."""
    try:
        def run_test(result_dict):
            try:
                st = speedtest.Speedtest()
                st.get_best_server()
                download_speed = st.download() / 1_000_000  # Convert to Mbps
                upload_speed = st.upload() / 1_000_000  # Convert to Mbps
                ping = st.results.ping
                
                result_dict['results'] = {
                    'download': round(download_speed, 2),
                    'upload': round(upload_speed, 2),
                    'latency': round(ping, 2)
                }
            except Exception as e:
                result_dict['error'] = str(e)
            
        # Create a dict to store results that can be shared between threads
        result_dict = {}
        
        # Run speed test in a thread to avoid blocking
        thread = threading.Thread(target=run_test, args=(result_dict,))
        thread.start()
        thread.join(timeout=30)  # Wait up to 30 seconds
        
        if thread.is_alive():
            thread.join(0)  # Kill the thread
            return jsonify({
                'error': 'Speed test timed out'
            }), 408
            
        if 'error' in result_dict:
            return jsonify({
                'error': result_dict['error']
            }), 500
            
        if 'results' not in result_dict:
            return jsonify({
                'error': 'No results returned'
            }), 500
            
        return jsonify(result_dict['results']), 200
        
    except Exception as e:
        current_app.logger.error(f'Speed test failed: {str(e)}')
        return jsonify({
            'error': 'Failed to run speed test'
        }), 500

@bp.route('/status/power/usage', methods=['GET'])
def get_power_usage():
    """Get current power usage and historical data."""
    try:
        # Move import inside the function to break circular dependency
        from backend.monitors.power import PowerMonitor
        power_monitor = PowerMonitor()
        current_power = power_monitor.calculate_power()
        
        if current_power is not None:
            return jsonify({
                'current': current_power,
                'historical': power_monitor.history,
                'unit': 'W',
                'timestamp': time.time()
            }), 200
        else:
            return jsonify({
                'error': 'Initializing power monitoring'
            }), 503
            
    except Exception as e:
        current_app.logger.error(f'Error reading power usage: {str(e)}')
        return jsonify({
            'error': 'Failed to read power usage'
        }), 500

@bp.route('/api/kea-leases', methods=['GET'])
@visibility_required(tab_id='stats', element_id='kea-leases')
def get_kea_leases():
    csv_path = '/var/lib/kea/kea-leases4.csv'
    current_app.logger.info(f'[KeaLeases] Fetching leases from {csv_path}')
    
    try:
        if not os.path.exists(csv_path):
            current_app.logger.warning(f'[KeaLeases] Lease file not found at {csv_path}')
            return jsonify({'error': 'Kea leases file not found'}), 404
        
        # Use dict keyed by MAC address to automatically deduplicate
        leases_by_mac = {}
        current_time = int(time.time())
        
        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Only include active leases (state=0 and not expired)
                expire_time = int(row['expire']) if row['expire'] else 0
                state = int(row['state']) if row['state'] else 1
                
                if state == 0 and expire_time > current_time:
                    mac = row['hwaddr']
                    # Keep the lease with the latest expiration time for each MAC
                    if mac not in leases_by_mac or expire_time > leases_by_mac[mac]['_expire']:
                        leases_by_mac[mac] = {
                            'hostname': row['hostname'],
                            'ip': row['address'],
                            'mac': mac,
                            '_expire': expire_time  # Internal field for comparison
                        }
        
        # Convert dict to list and remove internal expire field
        leases = []
        for lease in leases_by_mac.values():
            leases.append({
                'hostname': lease['hostname'],
                'ip': lease['ip'],
                'mac': lease['mac']
            })
        
        current_app.logger.info(f'[KeaLeases] Retrieved {len(leases)} unique active leases from CSV')
        return jsonify({'leases': leases}), 200
        
    except Exception as e:
        current_app.logger.error(f'[KeaLeases] Error reading CSV: {str(e)}', exc_info=True)
        return jsonify({'error': 'Failed to read lease file'}), 500

@bp.route('/api/network/notes', methods=['GET', 'PUT'])
@visibility_required(tab_id='stats', element_id='kea-leases')
def network_notes():
    # Use the validated config path from app config
    config_path = current_app.config['HOMESERVER_CONFIG']
    
    if request.method == 'GET':
        try:
            with open(config_path) as f:
                config = json.load(f)
            
            # Return empty dict if path doesn't exist
            notes = config.get('tabs', {}).get('stats', {}).get('data', {}).get('networkNotes', {})
            return jsonify(notes), 200
            
        except FileNotFoundError:
            current_app.logger.error(f'Configuration file not found at {config_path}')
            return jsonify({'error': 'Configuration file not found'}), 404
        except json.JSONDecodeError:
            current_app.logger.error(f'Invalid JSON in configuration file at {config_path}')
            return jsonify({'error': 'Invalid configuration file'}), 500
        except Exception as e:
            current_app.logger.error(f'Error reading network notes from {config_path}: {str(e)}')
            return jsonify({'error': 'Internal server error'}), 500
            
    elif request.method == 'PUT':
        try:
            # Check for factory config mode first
            if is_using_factory_config():
                return factory_mode_error()
                
            data = request.get_json()
            mac = data.get('mac')
            note = data.get('note')
            
            if not mac or note is None:
                return jsonify({'error': 'Missing mac or note parameter'}), 400
                
            # Read current config
            with open(config_path) as f:
                config = json.load(f)
            
            # Ensure path exists
            if 'tabs' not in config:
                config['tabs'] = {}
            if 'stats' not in config['tabs']:
                config['tabs']['stats'] = {}
            if 'data' not in config['tabs']['stats']:
                config['tabs']['stats']['data'] = {}
            if 'networkNotes' not in config['tabs']['stats']['data']:
                config['tabs']['stats']['data']['networkNotes'] = {}
                
            # Update note
            config['tabs']['stats']['data']['networkNotes'][mac] = note
            
            # Use safe write function
            def write_operation():
                with open(config_path, 'w') as f:
                    json.dump(config, f, indent=2)
                    
            if not safe_write_config(write_operation):
                return jsonify({'error': 'Failed to update configuration'}), 500
                
            # Log the note addition with config path for debugging
            write_to_log('admin', f'Network note added for device {mac} in {config_path}', 'info')
                
            # Emit WebSocket event using the imported socketio instance
            socketio.emit('network_notes_updated', {
                'mac': mac, 
                'note': note,
                'timestamp': time.time()
            })
            
            return jsonify({'success': True}), 200
                
        except FileNotFoundError:
            current_app.logger.error(f'Configuration file not found at {config_path}')
            return jsonify({'error': 'Configuration file not found'}), 404
        except json.JSONDecodeError:
            current_app.logger.error(f'Invalid JSON in configuration file at {config_path}')
            return jsonify({'error': 'Invalid configuration file'}), 500
        except Exception as e:
            current_app.logger.error(f'Error updating network note in {config_path}: {str(e)}')
            return jsonify({'error': 'Internal server error'}), 500
