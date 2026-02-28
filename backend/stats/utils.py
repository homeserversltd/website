"""
Utility functions for system statistics and monitoring.
"""
import os
import subprocess
import time
from typing import Optional, List, Dict
from pathlib import Path
from flask import current_app
import psutil
from collections import defaultdict
import json
from backend.utils.utils import get_cached_global_mounts, get_partlabel
# Initialize global state here
prev_net_counters = psutil.net_io_counters()
prev_disk_counters = {}
previous_process_times = {}
process_sample_counts = {}
last_process_check = 0.0

def read_rapl_energy(domain: str) -> Optional[float]:
    """Read energy consumption from RAPL files, trying direct read first, then sudo as fallback."""
    try:
        path = current_app.config['RAPL_PATHS'].get(domain)
        if not path or not os.path.exists(path):
            return None
        
        # Try direct read first (should work with udev rules)
        try:
            with open(path, 'r') as f:
                return float(f.read().strip())
        except PermissionError:
            # Fallback to sudo if direct read fails
            current_app.logger.debug(f"Direct RAPL read failed for {path}, falling back to sudo")
            
            # Redirect stderr to devnull to suppress sudo logging
            with open(os.devnull, 'w') as devnull:
                result = subprocess.run(
                    ['/usr/bin/sudo', '/usr/bin/cat', path],
                    stdout=subprocess.PIPE,
                    stderr=devnull,
                    text=True,
                    timeout=1.0
                )
            
            if result.returncode != 0:
                current_app.logger.error(f"RAPL read failed for {path}")
                return None
                
            return float(result.stdout.strip())
        
    except subprocess.TimeoutExpired:
        current_app.logger.error("RAPL read timed out")
        return None
    except ValueError:
        current_app.logger.error("Invalid RAPL energy value")
        return None
    except Exception as e:
        current_app.logger.error(f"RAPL read error: {str(e)}")
        return None

def get_dm_mapping() -> Dict[str, str]:
    """Get mapping between device mapper names and dm-X devices."""
    dm_mapping = {}
    try:
        # Read DM table
        if os.path.exists('/proc/devices'):
            with open('/proc/devices', 'r') as f:
                for line in f:
                    if 'device-mapper' in line:
                        dm_major = line.split()[0]
                        break
        
        # Read DM device names from sysfs
        dm_dir = '/sys/devices/virtual/block'
        if os.path.exists(dm_dir):
            for dm_device in os.listdir(dm_dir):
                if dm_device.startswith('dm-'):
                    name_path = os.path.join(dm_dir, dm_device, 'dm/name')
                    if os.path.exists(name_path):
                        with open(name_path, 'r') as f:
                            name = f.read().strip()
                            dm_mapping[name] = dm_device
                            current_app.logger.debug(f"Mapped device mapper {name} to {dm_device}")
    
    except Exception as e:
        current_app.logger.error(f"Error getting device mapper mapping: {str(e)}")
    
    return dm_mapping

def get_friendly_name(mount_point: str) -> str:
    """Convert mount point to a friendly name."""
    # Special cases for important mount points
    mount_map = {
        '/': 'root',  # Root filesystem
        '/mnt/nas': 'nas',  # Primary NAS
        '/mnt/nas_backup': 'nasbackup'  # Backup NAS
    }
    
    return mount_map.get(mount_point, mount_point.lstrip('/').replace('/', '_'))

def get_mount_info() -> Dict[str, Dict[str, str]]:
    """
    Get mapping of mount points to their devices and device types.
    Returns a dict with mount point as key and device info as value.
    """
    mount_info = {}
    dm_mapping = get_dm_mapping()
    current_app.logger.debug(f"Device mapper mapping: {dm_mapping}")
    
    try:
        # Get list of mounted partitions
        partitions = psutil.disk_partitions(all=False)
        for partition in partitions:
            # Skip pseudo filesystems
            if partition.fstype in ('tmpfs', 'devtmpfs', 'devpts', 'proc', 'sysfs', 'securityfs'):
                continue
                
            device = partition.device.replace('/dev/', '')
            mount_point = partition.mountpoint
            
            # Determine if this is an encrypted device
            is_encrypted = device.startswith('mapper/')
            actual_device = device.replace('mapper/', '') if is_encrypted else device
            
            # Get dm device name if encrypted
            dm_device = None
            if is_encrypted:
                dm_device = dm_mapping.get(actual_device)
                current_app.logger.debug(f"Found dm device {dm_device} for encrypted device {actual_device}")
            
            # Get friendly name based on mount point
            friendly_name = get_friendly_name(mount_point)
            
            mount_info[mount_point] = {
                'device': actual_device,
                'label': get_partlabel(partition.device),
                'is_encrypted': is_encrypted,
                'fstype': partition.fstype,
                'dm_device': dm_device,
                'friendly_name': friendly_name
            }
            
            current_app.logger.debug(f"Found mount: {mount_point} -> device: {actual_device} (encrypted: {is_encrypted}, dm: {dm_device}, friendly: {friendly_name})")
            
    except Exception as e:
        current_app.logger.error(f"Error getting mount info: {str(e)}")
    
    return mount_info

def get_physical_devices() -> List[str]:
    """
    Get list of physical block devices using sysfs.
    Includes both regular and encrypted devices that are mounted.
    """
    physical_devices = []
    
    # Get mount information first
    mount_info = get_mount_info()
    current_app.logger.debug(f"Mount info: {mount_info}")
    
    # Track important mount points
    important_mounts = {
        '/': 'root',  # Root filesystem (whether it includes /home or not)
        '/mnt/nas': 'nas',
        '/mnt/nas_backup': 'nasbackup'
    }
    
    monitored_devices = set()
    
    # Identify devices from mount points
    for mount_point, info in mount_info.items():
        if mount_point in important_mounts:
            device = info['device']
            if info['is_encrypted'] and info['dm_device']:
                device = info['dm_device']  # Use dm-X name for encrypted devices
            monitored_devices.add(device)
            current_app.logger.debug(f"Including monitored device {device} for mount {mount_point}")
    
    current_app.logger.debug(f"Found monitored devices: {monitored_devices}")
    
    # Get physical devices that are mounted
    try:
        # Add regular physical devices
        for device_path in Path('/sys/block').glob('*/device'):
            device = device_path.parts[3]
            current_app.logger.debug(f"Checking sysfs device: {device}")
            if not device.startswith(('loop', 'ram', 'zram')):
                # Only include the device if it's monitored
                base_device = device.split('p')[0] if 'nvme' in device else device[:3]
                if device in monitored_devices or base_device in monitored_devices:
                    physical_devices.append(device)
                    current_app.logger.debug(f"Including device {device} for I/O stats")
                else:
                    current_app.logger.debug(f"Skipping unmonitored device {device}")
        
        # Add monitored devices that weren't found in sysfs
        for device in monitored_devices:
            if device not in physical_devices:
                physical_devices.append(device)
                current_app.logger.debug(f"Including monitored device {device} for I/O stats")
    except Exception as e:
        current_app.logger.error(f"Error scanning /sys/block: {str(e)}")
    
    if not physical_devices:
        current_app.logger.warning("No physical devices found!")
    
    return physical_devices

def read_load_average() -> Dict[str, float]:
    """Read system load average from /proc/loadavg."""
    try:
        with open('/proc/loadavg', 'r') as f:
            load = f.read().strip().split()
            return {
                '1min': float(load[0]),
                '5min': float(load[1]),
                '15min': float(load[2])
            }
    except Exception as e:
        current_app.logger.error(f"Error reading load average: {str(e)}")
        return {'1min': 0.0, '5min': 0.0, '15min': 0.0}

def read_network_interfaces() -> Dict[str, Dict[str, int]]:
    """Read detailed network interface statistics from /proc/net/dev."""
    interfaces_of_interest = {'tailscale0', 'wan0', 'lan0', 'veth0'}
    interface_stats = {}
    
    try:
        with open('/proc/net/dev', 'r') as f:
            # Skip header lines
            next(f)
            next(f)
            
            for line in f:
                face, stats = line.strip().split(':')
                face = face.strip()
                
                if face in interfaces_of_interest:
                    values = stats.split()
                    interface_stats[face] = {
                        'bytes_recv': int(values[0]),
                        'packets_recv': int(values[1]),
                        'bytes_sent': int(values[8]),
                        'packets_sent': int(values[9])
                    }
                    
        return interface_stats
    except Exception as e:
        current_app.logger.error(f"Error reading network interfaces: {str(e)}")
        return {}

def collect_system_stats() -> Dict:
    """
    Collect system statistics including CPU, memory, network, disk I/O, and process information.
    Returns a structured dictionary of system metrics.
    """
    global prev_net_counters, prev_disk_counters
    
    # Get load average
    load_avg = read_load_average()
    
    # Get detailed network interface stats
    interface_stats = read_network_interfaces()
    
    # Basic system stats
    cpu = psutil.cpu_percent(interval=None)
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    temps = psutil.sensors_temperatures()
    
    # Network stats
    current_net = psutil.net_io_counters()
    download_speed = current_net.bytes_recv - prev_net_counters.bytes_recv
    upload_speed = current_net.bytes_sent - prev_net_counters.bytes_sent
    prev_net_counters = current_net
    
    # Disk I/O stats
    mount_info = get_mount_info()
    physical_devices = get_physical_devices()
    current_disk_counters = psutil.disk_io_counters(perdisk=True)
    disk_io_rates = defaultdict(lambda: {"read_bytes": 0, "write_bytes": 0})
    # Create mapping from device to friendly name
    device_to_friendly = {}
    global_mounts, _ = get_cached_global_mounts()
    
    # First map physical devices to friendly names
    for mount_name, details in global_mounts.items():
        device = details.get('device')
        mount_point = details.get('mountPoint')
        if device and mount_point:
            if mount_point == '/':
                device_to_friendly[device] = 'root'
            elif mount_point == '/mnt/nas':
                device_to_friendly[device] = 'nas'
            elif mount_point == '/mnt/nas_backup':
                device_to_friendly[device] = 'nasbackup'
    
    # Then map dm devices to friendly names using mount info
    for info in mount_info.values():
        if info['dm_device'] and info['friendly_name']:
            device_to_friendly[info['dm_device']] = info['friendly_name']
            # Also map the base device if it's not already mapped
            if info['device'] not in device_to_friendly:
                device_to_friendly[info['device']] = info['friendly_name']
    
    # Log the physical devices we're monitoring
    current_app.logger.debug(f"[STATS] Monitoring I/O for physical devices: {', '.join(physical_devices)}")
    current_app.logger.debug(f"[STATS] Available disk counters: {list(current_disk_counters.keys())}")
    current_app.logger.debug(f"[STATS] Device to friendly name mapping: {device_to_friendly}")
    
    # Only process devices that are in our physical_devices list (mounted devices)
    for device in physical_devices:
        current_app.logger.debug(f"[STATS] Processing I/O for device: {device}")
        
        # Get the friendly name if available, otherwise use device name
        friendly_name = device_to_friendly.get(device, device)
        
        if device in current_disk_counters:
            current = current_disk_counters[device]
            current_app.logger.debug(f"[STATS] Current counters for {device} ({friendly_name}): read={current.read_bytes}, write={current.write_bytes}")
            
            if device in prev_disk_counters:
                prev = prev_disk_counters[device]
                current_app.logger.debug(f"[STATS] Previous counters for {device} ({friendly_name}): read={prev.read_bytes}, write={prev.write_bytes}")
                
                time_delta = current_app.config.get('STATS_INTERVAL', 1)  # Default to 1 if not set
                current_app.logger.debug(f"[STATS] Using time delta: {time_delta}")
                
                read_delta = max(0, current.read_bytes - prev.read_bytes)
                write_delta = max(0, current.write_bytes - prev.write_bytes)
                
                current_app.logger.debug(f"[STATS] Raw deltas for {device} ({friendly_name}): read_delta={read_delta}, write_delta={write_delta}")
                
                # Calculate rates
                read_rate = read_delta // time_delta if time_delta > 0 else 0
                write_rate = write_delta // time_delta if time_delta > 0 else 0
                
                # Store rates using friendly name
                disk_io_rates[friendly_name] = {
                    "read_bytes": read_rate,
                    "write_bytes": write_rate
                }
                current_app.logger.debug(f"[STATS] Calculated rates for {friendly_name}: read={read_rate}/s, write={write_rate}/s")
            else:
                current_app.logger.debug(f"[STATS] No previous counters for {device} ({friendly_name}), initializing")
                prev_disk_counters[device] = current
        else:
            current_app.logger.warning(f"[STATS] Device {device} ({friendly_name}) not found in disk counters")
    
    # Update disk counters for next iteration
    prev_disk_counters = {device: counters for device, counters in current_disk_counters.items() 
                         if device in physical_devices}
    
    current_app.logger.debug(f"[STATS] Final I/O rates: {dict(disk_io_rates)}")
    # Get process statistics
    top_processes = collect_process_stats()
    
    # Get disk usage stats
    disk_usage = collect_disk_usage()
    
    # Compile all stats
    return {
        'timestamp': time.time(),
        'load_average': load_avg,
        'cpu': {
            'percent': cpu,
            'temp': temps.get('coretemp', [{}])[0].current if 'coretemp' in temps else 0,
            'top_processes': top_processes
        },
        'memory': {
            'total': mem.total,
            'used': mem.used,
            'available': mem.available,
            'percent': mem.percent,
            'swap': {
                'total': swap.total,
                'used': swap.used,
                'free': swap.free,
                'percent': swap.percent
            }
        },
        'network': {
            'sent': upload_speed,
            'recv': download_speed,
            'interfaces': interface_stats
        },
        'disk_usage': disk_usage,
        'io': {
            'devices': dict(disk_io_rates)
        }
    }

def collect_process_stats() -> List[Dict]:
    """Collect and aggregate process statistics."""
    global previous_process_times, process_sample_counts, last_process_check
    
    current_time = time.time()
    time_delta = current_time - last_process_check
    
    # Initialize process groups
    process_groups = defaultdict(lambda: {
        'total_cpu': 0.0,
        'name': '',
        'exe_paths': set(),
        'pids': set(),
        'cpu_percent': 0.0,
        'memory_rss': 0
    })
    
    # Get number of CPU cores
    cpu_count = psutil.cpu_count()
    
    # Collect current process data
    for proc in psutil.process_iter(['pid', 'name', 'exe', 'cpu_times', 'ppid']):
        try:
            # Get process details
            proc_name = proc.name()
            try:
                proc_exe = proc.exe()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                proc_exe = "Access Denied"
                
            key = proc_name
            cpu_times = proc.cpu_times()
            total_cpu = cpu_times.user + cpu_times.system
            
            # Update process group data
            process_groups[key]['total_cpu'] += total_cpu
            process_groups[key]['name'] = proc_name
            process_groups[key]['exe_paths'].add(proc_exe)
            process_groups[key]['pids'].add(proc.pid)
            
            # Add memory info
            try:
                memory_info = proc.memory_info()
                process_groups[key]['memory_rss'] = process_groups[key].get('memory_rss', 0) + memory_info.rss
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
                
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    # Calculate CPU percentages and prepare final data
    top_processes = []
    for key, data in process_groups.items():
        prev_cpu = previous_process_times.get(key, 0)
        cpu_delta = data['total_cpu'] - prev_cpu
        
        if time_delta > 0:
            # Calculate percentage relative to total available CPU time across all cores
            cpu_percent = (cpu_delta / (time_delta * cpu_count)) * 100
        else:
            cpu_percent = 0
            
        # Update sample counts
        process_sample_counts[key] = process_sample_counts.get(key, 0) + 1
        
        # Only include processes that meet the sample threshold
        if process_sample_counts[key] >= current_app.config['PROCESS_SAMPLE_THRESHOLD']:
            top_processes.append({
                'name': data['name'],
                'cpu_percent': round(cpu_percent, 1),
                'executablePaths': list(data['exe_paths']),
                'processCount': len(data['pids']),
                'memory_bytes': data.get('memory_rss', 0)
            })
        
        # Update previous CPU times
        previous_process_times[key] = data['total_cpu']
    
    # Sort by CPU usage and take top 10
    top_processes.sort(key=lambda x: x['cpu_percent'], reverse=True)
    top_processes = top_processes[:10]
    
    # Clean up old processes
    current_processes = set(process_groups.keys())
    old_processes = set(process_sample_counts.keys()) - current_processes
    for proc in old_processes:
        process_sample_counts.pop(proc, None)
        previous_process_times.pop(proc, None)
    
    last_process_check = current_time
    return top_processes

def collect_disk_usage() -> Dict:
    """Collect disk usage statistics using cached global config."""
    try:
        disk_usage = {}
        seen_devices = set()
        
        # Get cached config data and mount info
        global_mounts, ignored_mounts = get_cached_global_mounts()
        mount_info = get_mount_info()
        ignored_mounts = set(ignored_mounts)
        
        # Important mount points to always track
        important_mounts = {
            '/': 'root',  # Root filesystem (whether it includes /home or not)
            '/mnt/nas': 'nas',
            '/mnt/nas_backup': 'nasbackup'
        }
        
        # Create mountpoint to device mapping, handling both encrypted and unencrypted devices
        mount_to_device = {}
        for mount_point, info in mount_info.items():
            if mount_point in important_mounts:
                if info['is_encrypted']:
                    mount_to_device[mount_point] = {
                        'device': info['device'],
                        'dm_device': info['dm_device'],
                        'friendly_name': important_mounts[mount_point]
                    }
                else:
                    mount_to_device[mount_point] = {
                        'device': info['device'],
                        'dm_device': None,
                        'friendly_name': important_mounts[mount_point]
                    }
        
        current_app.logger.debug(f"Mount to device mapping: {mount_to_device}")
        
        # Process each important mount point
        for mount_point, friendly_name in important_mounts.items():
            try:
                if mount_point in ignored_mounts:
                    continue
                
                # Skip if we've already processed this mount
                if mount_point in seen_devices:
                    continue
                
                # Skip if mount point doesn't exist
                if not os.path.exists(mount_point):
                    continue
                
                # Get usage statistics
                usage = psutil.disk_usage(mount_point)
                
                # Get device info from our mapping
                device_info = mount_to_device.get(mount_point)
                if device_info:
                    disk_usage[friendly_name] = {
                        "total": usage.total,
                        "used": usage.used,
                        "free": usage.free,
                        "percent": usage.percent,
                        "mountpoint": mount_point,
                        "device": device_info['device'],
                        "label": get_partlabel('/dev/' + device_info['device']) if not device_info['device'].startswith('mapper/') else None,
                        "configured_path": mount_point
                    }
                    
                    # If it's an encrypted device, add the dm_device info
                    if device_info['dm_device']:
                        disk_usage[friendly_name]["dm_device"] = device_info['dm_device']
                    
                    seen_devices.add(mount_point)
                    current_app.logger.debug(f"Added disk usage for {friendly_name} at {mount_point}")
                
            except (PermissionError, FileNotFoundError) as e:
                current_app.logger.warning(f"Permission or file not found error for {mount_point}: {str(e)}")
                continue
            except Exception as e:
                current_app.logger.error(f"Error processing mount {mount_point}: {str(e)}")
                continue
        
        current_app.logger.debug(f"Final disk usage data: {disk_usage}")
        return disk_usage
        
    except Exception as e:
        current_app.logger.error(f"Error in collect_disk_usage: {str(e)}")
        return {}

