# Broadcasts System

The broadcasts system provides real-time data streaming from the homeserver backend to connected clients via WebSocket connections. It supports both regular broadcasts and admin-only broadcasts with field-level access control.

## Architecture Overview

The broadcasts system consists of several key components:

### Core Components

1. **BroadcastManager** (`events.py`) - Central manager for all broadcast operations
2. **Comparison Functions** (`comparisons.py`) - Logic for determining when data has meaningfully changed
3. **Monitor Classes** (`../monitors/`) - Data collection and formatting
4. **WebSocket Handlers** (`../sockets/events.py`) - Client subscription management

### Data Flow

```
Monitor Classes → BroadcastManager → Comparison Functions → WebSocket Emission → Client
```

## Broadcast Types

### Regular Broadcasts
- `system_stats` - System performance metrics
- `services_status` - Service running status
- `power_status` - Power consumption data
- `internet_status` - Internet connectivity status
- `tailscale_status` - Tailscale VPN status
- `vpn_status` - VPN and Transmission status
- `hard_drive_test_status` - Disk testing progress
- `sync_status` - NAS sync operations

### Admin-Only Broadcasts
- `admin_system` - Detailed system information
- `admin_disk_info` - Comprehensive disk information

### Mixed Broadcasts with Admin Fields
Regular broadcasts that include additional fields only visible to admin users:
- `internet_status` - Admin fields: `publicIp`, `ipDetails`, `dnsServers`
- `vpn_status` - Admin fields: `connectionDetails`, `credentials`
- `system_stats` - Admin fields: `processes`, `users`, `networkConnections`
- `tailscale_status` - Admin fields: `ip`, `tailnet`, `isEnabled`
- `services_status` - Admin fields: `isEnabled`

## How It Works

### 1. Monitor Data Collection

Monitor classes collect system data at regular intervals:

```python
class InternetStatusMonitor:
    def broadcast_status(self) -> Dict:
        """Get current status for broadcasting."""
        return self.check_connectivity(include_admin_data=True)
```

### 2. Broadcast Registration

Monitors are registered with the BroadcastManager during application startup:

```python
broadcast_manager.register_broadcaster(
    'internet_status',
    InternetStatusMonitor().broadcast_status,
    interval=app.config['INTERNET_CHECK_INTERVAL']
)
```

### 3. Change Detection

The system uses comparison functions to determine if data has meaningfully changed:

```python
def compare_internet_status(old_data: Dict, new_data: Dict) -> bool:
    """Compare internet status data, ignoring volatile fields like timestamps."""
    if old_data.get('status') != new_data.get('status'):
        return True
    if old_data.get('publicIp') != new_data.get('publicIp'):
        return True
    return False
```

### 4. Client Subscription

Clients subscribe to broadcast types via WebSocket:

```javascript
// Frontend subscription
socket.emit('subscribe', { type: 'internet_status' });
```

### 5. Data Emission

The generic broadcaster runs in a separate thread and emits data to subscribed clients:

```python
def generic_broadcaster(broadcast_type, app):
    while True:
        subscribers = broadcast_manager.get_subscribers(broadcast_type)
        data = broadcaster_func()
        
        for sid in subscribers:
            if should_broadcast(broadcast_type, data, sid):
                socketio.server.emit(broadcast_type, data, room=sid)
```

## Admin Authentication

### Admin-Only Broadcasts

For admin-only broadcasts, the system validates admin status before allowing subscriptions:

```python
def add_subscriber(self, broadcast_type: str, sid: str) -> None:
    is_admin_broadcast = broadcast_type in self.admin_only_broadcasts
    
    if is_admin_broadcast:
        admin_auth = get_socket_auth_manager()
        if not admin_auth.validate_socket(sid):
            current_app.logger.warning(f"Unauthorized admin subscription attempt")
            return
```

### Admin Field Filtering

For mixed broadcasts, admin fields are filtered for non-admin users:

```python
def filter_admin_data(self, broadcast_type: str, data: Dict[str, Any], sid: str) -> Dict[str, Any]:
    if broadcast_type not in self.broadcasts_with_admin_fields:
        return data
        
    admin_auth = get_socket_auth_manager()
    is_admin = admin_auth.validate_socket(sid)
    
    if not is_admin:
        for field in self.broadcasts_with_admin_fields[broadcast_type]:
            if field in data:
                del data[field]
    
    return data
```

## Configuration

### Broadcast Intervals

Broadcast intervals are configured in the application config:

```python
app.config.update({
    'STATS_INTERVAL': 2,
    'SERVICES_CHECK_INTERVAL': 5,
    'POWER_SAMPLE_INTERVAL': 1000,  # milliseconds
    'INTERNET_CHECK_INTERVAL': 30,
    'TAILSCALE_CHECK_INTERVAL': 10,
    'VPN_CHECK_INTERVAL': 5,
    'DISK_CHECK_INTERVAL': 30,
    'ADMIN_STATS_INTERVAL': 2,
})
```

### Admin Field Registration

Admin fields are registered during broadcaster initialization:

```python
broadcast_manager.register_admin_fields('internet_status', {
    'publicIp', 'ipDetails', 'dnsServers'
})
```

## Adding New Broadcasts

### 1. Create a Monitor Class

```python
class YourMonitor:
    def broadcast_status(self) -> Dict[str, Any]:
        """Get current status for broadcasting."""
        return {
            'status': 'running',
            'data': 'your_data',
            'timestamp': time.time()
        }
```

### 2. Add Comparison Function

```python
def compare_your_broadcast(old_data: Dict, new_data: Dict) -> bool:
    """Compare your broadcast data."""
    if old_data.get('status') != new_data.get('status'):
        return True
    return False

# Add to COMPARISON_FUNCTIONS map
COMPARISON_FUNCTIONS = {
    # ... existing entries
    'your_broadcast': compare_your_broadcast
}
```

### 3. Register the Broadcaster

```python
# In init_broadcasters function
broadcast_manager.register_broadcaster(
    'your_broadcast',
    YourMonitor().broadcast_status,
    interval=30,
    admin_only=False  # Set to True for admin-only
)
```

## Frontend Integration

### Basic Subscription

```typescript
import { useWebSocket } from '../hooks/useWebSocket';

function MyComponent() {
  const { status } = useWebSocket({
    event: 'internet_status',
    callback: (data) => {
      console.log('Internet status:', data);
    },
    autoConnect: true
  });
  
  return <div>Status: {status}</div>;
}
```

### Admin-Only Subscription

```typescript
import { useAdminWebSocket } from '../hooks/useAdminWebSocket';

function AdminComponent() {
  const { isSocketAuthenticated } = useAdminWebSocket();
  
  const { status } = useWebSocket({
    event: 'admin_disk_info',
    callback: (data) => {
      console.log('Admin disk info:', data);
    },
    autoConnect: true,
    deps: [isSocketAuthenticated]
  });
  
  return <div>Admin Status: {status}</div>;
}
```

## Error Handling

### Connection Errors

The system handles WebSocket connection errors gracefully:

```python
def handle_error(self, sid: str, error: Exception) -> None:
    error_str = str(error)
    
    # Don't remove subscriptions for auth-related errors
    if "authentication" in error_str.lower():
        current_app.logger.info(f"Authentication error for {sid}, preserving subscriptions")
    else:
        self.remove_all_subscriptions(sid)
        self.connected_sids.discard(sid)
```

### Data Validation

Broadcast data is validated before emission:

```python
def should_broadcast(self, broadcast_type: str, data: Any, sid: str = None) -> bool:
    if data is None:
        current_app.logger.warning(f"Data is None for {broadcast_type}")
        return False
    
    # Check for initialization needs
    if sid is not None and sid not in self.initialized_subscribers[broadcast_type]:
        return True
    
    # Use comparison logic
    return should_broadcast(self.last_broadcast_data[broadcast_type], data, broadcast_type)
```

## Performance Considerations

### Change Detection

The system only broadcasts when data has meaningfully changed, reducing network traffic:

- Timestamps are ignored in comparisons
- Small changes (e.g., < 0.1% disk usage) are filtered out
- Periodic updates ensure clients stay synchronized

### Resource Management

- Each broadcast type runs in its own thread
- Subscribers are automatically cleaned up on disconnect
- Admin validation is cached to reduce overhead

## Security Features

### Admin Authentication

- Admin status is validated on every subscription attempt
- Admin fields are filtered for non-admin users
- Authentication tokens expire after inactivity

### Data Sanitization

- Command outputs are sanitized before broadcasting
- Error messages are filtered to prevent information leakage
- Sensitive data is only included in admin broadcasts

## Troubleshooting

### Common Issues

1. **No data received**: Check if client is subscribed and authenticated
2. **Admin data missing**: Verify admin authentication status
3. **High CPU usage**: Check broadcast intervals and comparison functions
4. **Memory leaks**: Ensure subscribers are properly cleaned up

### Debugging

Enable debug logging to trace broadcast operations:

```python
current_app.logger.setLevel('DEBUG')
```

Key log messages to monitor:
- `[BROADCAST]` - General broadcast operations
- `[BROADCAST_VALIDATE]` - Admin validation
- `[DEBUG_SUB_BACKEND]` - Subscription management

## File Structure

```
backend/broadcasts/
├── __init__.py          # Blueprint initialization
├── events.py            # BroadcastManager and generic broadcaster
├── comparisons.py       # Change detection logic
├── routes.py            # HTTP routes (currently empty)
└── README.md           # This file
```

## Dependencies

- `eventlet` - Asynchronous networking
- `flask-socketio` - WebSocket support
- `flask` - Web framework
- `typing` - Type hints
- `collections.defaultdict` - Data structures
- `time` - Timestamp generation