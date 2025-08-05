# Monitors System

The monitors system provides real-time system monitoring and data broadcasting capabilities for the homeserver platform. It consists of specialized monitor classes that collect system information and broadcast it to connected clients via WebSocket.

## Architecture Overview

The monitors system follows a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Components                     │
│  (React hooks, WebSocket subscriptions, UI components)    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   WebSocket Layer                          │
│  (Socket.IO events, authentication, connection management) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Broadcast Manager                           │
│  (Subscription management, admin filtering, event routing) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Monitor Classes                          │
│  (Data collection, system commands, status checking)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                System Layer                                │
│  (Linux commands, systemd, hardware monitoring)           │
└─────────────────────────────────────────────────────────────┘
```

## Monitor Types

### 1. System Monitors (Public)

These monitors provide basic system information available to all users:

- **SystemStatsMonitor** (`system.py`): CPU, memory, disk usage statistics
- **ServicesMonitor** (`services.py`): Service status and health checks
- **PowerMonitor** (`power.py`): Real-time power consumption via RAPL
- **InternetStatusMonitor** (`internet.py`): Internet connectivity and public IP
- **TailscaleMonitor** (`tailscale.py`): Tailscale VPN connection status
- **VPNMonitor** (`vpn.py`): VPN and Transmission service status
- **SyncMonitor** (`sync.py`): NAS sync job progress and status

### 2. Admin-Only Monitors

These monitors provide sensitive system information only to authenticated administrators:

- **DiskMonitor** (`disk.py`): Detailed disk information including encryption status
- **HardDriveTestMonitor** (`harddrivetest.py`): Comprehensive drive testing with progress streaming

### 3. Hybrid Monitors

Some monitors provide both public and admin-only data:

- **InternetStatusMonitor**: Basic connectivity (public) + IP details (admin)
- **TailscaleMonitor**: Connection status (public) + IP/tailnet info (admin)
- **VPNMonitor**: Service status (public) + enabled state (admin)
- **ServicesMonitor**: Service status (public) + enabled state (admin)

## Broadcast System

### Broadcast Manager

The `BroadcastManager` class in `backend/broadcasts/events.py` handles:

- **Subscription Management**: Track which clients subscribe to which broadcast types
- **Admin Authentication**: Validate admin status for admin-only broadcasts
- **Data Filtering**: Remove admin-only fields for non-admin users
- **Change Detection**: Only broadcast when data meaningfully changes
- **Event Routing**: Route broadcasts to appropriate subscribers

### Broadcast Registration

Monitors are registered with the broadcast system in `init_broadcasters()`:

```python
# Public broadcast
broadcast_manager.register_broadcaster(
    'system_stats', 
    SystemStatsMonitor().broadcast_stats, 
    interval=app.config['STATS_INTERVAL']
)

# Admin-only broadcast
broadcast_manager.register_broadcaster(
    'admin_disk_info',
    DiskMonitor().broadcast_disk_info,
    interval=app.config.get('DISK_CHECK_INTERVAL', 30),
    admin_only=True
)

# Regular broadcast with admin fields
broadcast_manager.register_admin_fields('internet_status', {'publicIp', 'ipDetails'})
```

### Change Detection

The system uses comparison functions in `backend/broadcasts/comparisons.py` to determine when data has meaningfully changed:

```python
def compare_internet_status(old_data: Dict, new_data: Dict) -> bool:
    """Compare internet status data, ignoring volatile fields like timestamps."""
    if old_data.get('status') != new_data.get('status'):
        return True
    if old_data.get('publicIp') != new_data.get('publicIp'):
        return True
    return False
```

## Admin-Only Features

### Admin Authentication

Admin-only broadcasts require WebSocket authentication:

1. **Challenge-Response**: Client requests auth challenge
2. **PIN Validation**: Server validates admin PIN
3. **Session Management**: Maintains authenticated state
4. **Access Control**: Filters admin-only data

### Admin Field Filtering

Regular broadcasts can include admin-only fields that are filtered for non-admin users:

```python
# Register admin fields for a regular broadcast
broadcast_manager.register_admin_fields('internet_status', {
    'publicIp', 'ipDetails', 'dnsServers'
})
```

## Monitor Implementation Patterns

### Standard Monitor Structure

```python
class ExampleMonitor:
    """Monitor description."""
    
    def __init__(self, check_interval: int = 30):
        self.check_interval = check_interval
        
    def collect_data(self) -> Dict[str, Any]:
        """Collect current data."""
        try:
            # Implement data collection logic
            return {
                "status": "connected",
                "timestamp": time.time()
            }
        except Exception as e:
            current_app.logger.error(f"Error collecting data: {str(e)}")
            return {"error": str(e)}
            
    def broadcast_status(self) -> Dict[str, Any]:
        """Get current status for broadcasting."""
        return self.collect_data()
```

### Command Execution Pattern

```python
def _execute_command(self, command: str) -> str:
    """Execute a shell command and return its output."""
    try:
        process = subprocess.Popen(
            command, 
            shell=True, 
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )
        stdout, stderr = process.communicate()
        
        if process.returncode != 0:
            current_app.logger.error(f"Command '{command}' failed: {stderr}")
            return f"Error executing '{command}': {stderr}"
            
        return stdout.strip()
        
    except Exception as e:
        current_app.logger.error(f"Error executing command '{command}': {str(e)}")
        return f"Error: {str(e)}"
```

### Admin-Only Monitor Pattern

```python
def check_status(self, include_admin_data: bool = False) -> Dict[str, Any]:
    """Get current status with optional admin data."""
    # Basic data for all users
    result = {
        'status': 'connected',
        'timestamp': time.time()
    }
    
    # Add admin-only fields
    if include_admin_data:
        result['adminField'] = 'sensitive_data'
        
    return result

def broadcast_status(self) -> Dict[str, Any]:
    """Get current status for broadcasting."""
    # Always include admin data, filtering done by broadcast manager
    return self.check_status(include_admin_data=True)
```

## Real-Time Progress Broadcasting

Some monitors support real-time progress updates:

### Hard Drive Testing

```python
def _broadcast_test_progress(self, broadcast_id: str, message: str, progress: Optional[int] = None):
    """Broadcast test progress via WebSocket."""
    data = {
        "id": broadcast_id,
        "message": message,
        "timestamp": time.time()
    }
    if progress is not None:
        data["progress"] = progress
    
    socketio.emit('hard_drive_test', data)
```

### Sync Operations

```python
def _broadcast_status(self, job_id, status, progress=None, success=None):
    data = {
        'id': job_id,
        'status': status,  # 'starting', 'working', 'done'
        'timestamp': time.time()
    }
    if progress is not None:
        data['progress'] = progress
    if status == 'done':
        data['success'] = success
    
    socketio.emit('sync_status', data)
```

## Configuration

Monitor intervals are configured in the Flask app config:

```python
# Monitor intervals (in seconds)
STATS_INTERVAL = 2
SERVICES_CHECK_INTERVAL = 4
POWER_SAMPLE_INTERVAL = 1000  # milliseconds
INTERNET_CHECK_INTERVAL = 7
TAILSCALE_CHECK_INTERVAL = 10
VPN_CHECK_INTERVAL = 5
DISK_CHECK_INTERVAL = 30
DRIVE_TEST_INTERVAL = 5
ADMIN_STATS_INTERVAL = 2
```

## Security Considerations

### Command Execution

- All system commands use `sudo` with specific permissions
- Commands are executed through utility functions with error handling
- Sensitive data is logged at debug level only

### Admin Access Control

- Admin authentication uses challenge-response with PIN validation
- Admin sessions have timeout periods
- Admin-only data is filtered at the broadcast level

### Rate Limiting

- Connection limits per IP address
- Heartbeat monitoring for zombie connections
- Broadcast frequency limits to prevent spam

## Error Handling

### Graceful Degradation

Monitors handle errors gracefully and continue operating:

```python
try:
    # Attempt data collection
    result = self.collect_data()
except Exception as e:
    current_app.logger.error(f"Error in monitor: {str(e)}")
    result = {"error": str(e), "timestamp": time.time()}
```

### Logging

All monitors include comprehensive logging:

- Debug logs for detailed operation tracking
- Info logs for significant events
- Error logs for failures with context
- Warning logs for recoverable issues

## Frontend Integration

### WebSocket Subscriptions

Frontend components subscribe to monitor broadcasts:

```typescript
// Subscribe to system stats
socketClient.emit('subscribe', { type: 'system_stats' });

// Subscribe to admin-only disk info
socketClient.emit('subscribe', { type: 'admin_disk_info' });

// Listen for updates
socketClient.on('system_stats', (data) => {
    // Handle system stats update
});
```

### React Hooks

The frontend provides hooks for easy monitor integration:

```typescript
// Use system stats
const { status, data } = useWebSocket({
    event: 'system_stats',
    callback: (data) => setSystemStats(data)
});

// Use admin disk info
const { status } = useAdminWebSocket({
    event: 'admin_disk_info',
    callback: (data) => setDiskInfo(data)
});
```

## Testing and Debugging

### Monitor Testing

Each monitor can be tested independently:

```python
# Test disk monitor
monitor = DiskMonitor()
result = monitor.check_disks()
print(result)

# Test power monitor
monitor = PowerMonitor()
result = monitor.calculate_power()
print(result)
```

### Broadcast Testing

Test broadcast functionality:

```python
# Test broadcast manager
broadcast_manager.add_subscriber('system_stats', 'test_sid')
# Monitor logs for broadcast events
```

### Debug Logging

Enable debug logging to trace monitor operations:

```python
# In Flask config
LOG_LEVEL = 'DEBUG'
```

## Performance Considerations

### Caching

Monitors implement caching where appropriate:

- Service enabled states cached for 60 seconds
- IP information cached for 24 hours
- Power calculations use rolling averages

### Resource Management

- Commands execute with timeouts
- Large data sets are paginated
- Memory usage is monitored
- Process tracking prevents zombie processes

### Scalability

- Each monitor runs in its own thread
- Broadcasts are filtered by subscription
- Admin authentication is session-based
- Connection limits prevent resource exhaustion

## Troubleshooting

### Common Issues

1. **Monitor not broadcasting**: Check if monitor is registered and has subscribers
2. **Admin data not visible**: Verify admin authentication and session validity
3. **High CPU usage**: Check monitor intervals and command execution frequency
4. **Missing data**: Verify system commands have proper sudo permissions

### Debug Commands

```bash
# Check monitor processes
ps aux | grep python | grep monitor

# Check broadcast logs
tail -f /var/log/homeserver.log | grep BROADCAST

# Test WebSocket connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
     http://localhost:5000/socket.io/
```

## Future Enhancements

### Planned Features

- **Custom Monitor Creation**: Allow users to create custom monitors
- **Alert System**: Notify users of critical system events
- **Historical Data**: Store and retrieve historical monitor data
- **Export Capabilities**: Export monitor data in various formats
- **Mobile Notifications**: Push notifications for critical events

### Architecture Improvements

- **Microservice Architecture**: Split monitors into separate services
- **Database Integration**: Store monitor data in database
- **API Endpoints**: REST API for monitor data access
- **Plugin System**: Allow third-party monitor plugins 