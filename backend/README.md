# HOMESERVER Backend Architecture

The HOMESERVER backend is a Flask-based WebSocket application that provides real-time system monitoring, file management, and administrative control for a professional-grade digital sovereignty platform. This document provides a high-level overview of how the backend works.

## Architecture Overview

The backend follows a modular blueprint architecture with real-time WebSocket communication:

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend                          │
│  (WebSocket client, state management, UI components)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Flask Application                        │
│  (Blueprint routing, CORS, static file serving)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Socket.IO Layer                             │
│  (WebSocket events, authentication, connection management) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Broadcast System                            │
│  (Real-time data distribution, admin filtering)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Monitor System                              │
│  (System data collection, service status, hardware info)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                System Layer                                │
│  (Linux commands, systemd, hardware monitoring)           │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Application Factory (`__init__.py`)

The application factory pattern creates and configures the Flask app:

- **Dynamic Configuration**: Loads settings from `/var/www/homeserver/src/config/homeserver.json`
- **CORS Management**: Configures cross-origin requests with dynamic origins
- **Blueprint Registration**: Registers all functional modules as Flask blueprints
- **WebSocket Initialization**: Sets up Socket.IO with eventlet for async operations
- **Static File Serving**: Serves the React frontend build files

### 2. WebSocket Layer (`sockets/`)

Manages real-time bidirectional communication:

- **Connection Management**: Tracks WebSocket connections with rate limiting
- **Authentication**: Handles admin authentication via challenge-response
- **Event Routing**: Routes events to appropriate handlers
- **Heartbeat Monitoring**: Detects and cleans up zombie connections
- **Admin Commands**: Processes privileged administrative operations

### 3. Broadcast System (`broadcasts/`)

Distributes real-time data to connected clients:

- **Subscription Management**: Tracks which clients subscribe to which data types
- **Admin Filtering**: Removes sensitive data for non-admin users
- **Change Detection**: Only broadcasts when data meaningfully changes
- **Event Routing**: Routes broadcasts to appropriate subscribers

### 4. Monitor System (`monitors/`)

Collects system information and status data:

- **System Monitors**: CPU, memory, disk usage, power consumption
- **Service Monitors**: Systemd service status and health checks
- **Network Monitors**: Internet connectivity, VPN status, Tailscale
- **Hardware Monitors**: Disk information, drive testing, NAS sync
- **Admin-Only Monitors**: Sensitive system information for administrators

### 5. Authentication System (`auth/`)

Manages user authentication and authorization:

- **PIN-Based Auth**: Uses admin PIN from configuration for authentication
- **Session Management**: Maintains admin sessions with timeout
- **WebSocket Auth**: Extends authentication to WebSocket connections
- **Access Control**: Protects admin-only endpoints and data

## Blueprint Modules

### Core Functionality

- **`admin/`**: Administrative operations (disk management, system control, updates)
- **`auth/`**: Authentication and authorization decorators
- **`broadcasts/`**: Real-time data broadcasting system
- **`monitors/`**: System monitoring and data collection
- **`sockets/`**: WebSocket event handling and connection management

### Feature Modules

- **`tabman/`**: Tab management and visibility control
- **`stats/`**: System statistics and performance data
- **`portals/`**: Portal configuration and management
- **`upload/`**: File upload and management
- **`indicators/`**: Service status indicators
- **`utils/`**: Utility functions and helpers
- **`dev/`**: Development tools and debugging

## Real-Time Data Flow

### 1. Data Collection

Monitors collect system data at configurable intervals:

```python
# Example: System stats monitor
class SystemStatsMonitor:
    def broadcast_stats(self) -> Dict[str, Any]:
        return {
            "cpu": self._get_cpu_usage(),
            "memory": self._get_memory_usage(),
            "disk": self._get_disk_usage(),
            "timestamp": time.time()
        }
```

### 2. Broadcast Registration

Monitors register with the broadcast system:

```python
# Register system stats broadcast
broadcast_manager.register_broadcaster(
    'system_stats', 
    SystemStatsMonitor().broadcast_stats, 
    interval=2  # Broadcast every 2 seconds
)
```

### 3. Client Subscription

Frontend subscribes to data streams:

```typescript
// Subscribe to system stats
socket.emit('subscribe', { type: 'system_stats' });

// Listen for updates
socket.on('system_stats', (data) => {
    updateSystemStats(data);
});
```

### 4. Admin Data Filtering

Sensitive data is filtered for non-admin users:

```python
# Register admin-only fields
broadcast_manager.register_admin_fields('internet_status', {
    'publicIp', 'ipDetails', 'dnsServers'
})
```

## Authentication Flow

### WebSocket Authentication

1. **Connection**: Client establishes WebSocket connection
2. **Challenge**: Client requests authentication challenge
3. **Response**: Client provides admin PIN
4. **Validation**: Server validates PIN against configuration
5. **Session**: Server creates admin session for socket
6. **Access**: Socket can access admin-only events and data

### HTTP Authentication

- **Cookie-Based**: Admin sessions stored in secure cookies
- **PIN Validation**: Admin PIN required for protected endpoints
- **Session Timeout**: Sessions expire after 30 minutes of inactivity

## Configuration Management

### Dynamic Configuration

The backend loads configuration from `/var/www/homeserver/src/config/homeserver.json`:

```json
{
  "global": {
    "admin": {
      "pin": "1234"
    },
    "cors": {
      "allowed_origins": ["https://home.arpa"]
    }
  },
  "tabs": {
    "system": {
      "visibility": {
        "tab": true,
        "elements": {
          "cpu": true,
          "memory": true
        }
      }
    }
  }
}
```

### Environment-Based Configuration

- **Development**: Debug mode, detailed logging
- **Production**: Optimized for performance and security
- **Testing**: Isolated configuration for automated tests

## Security Features

### Connection Management

- **Rate Limiting**: Maximum connections per IP address
- **Heartbeat Monitoring**: Detects and removes zombie connections
- **Session Timeout**: Automatic session expiration
- **Admin Authentication**: Challenge-response authentication

### Data Protection

- **Admin Filtering**: Sensitive data only sent to authenticated admins
- **CORS Protection**: Configurable cross-origin request handling
- **Input Validation**: All inputs validated and sanitized
- **Error Handling**: Graceful error handling without information leakage

## Performance Considerations

### Async Operations

- **Eventlet**: Non-blocking I/O for WebSocket operations
- **Background Tasks**: Monitor data collection runs in background
- **Connection Pooling**: Efficient WebSocket connection management
- **Caching**: Configurable caching for frequently accessed data

### Resource Management

- **Memory Monitoring**: Tracks memory usage and prevents leaks
- **Process Management**: Monitors system processes and services
- **Disk Monitoring**: Tracks disk usage and I/O performance
- **Network Monitoring**: Monitors network connectivity and performance

## Error Handling

### Graceful Degradation

- **Monitor Failures**: Individual monitor failures don't crash the system
- **Connection Loss**: Automatic reconnection handling
- **Data Errors**: Fallback values when data collection fails
- **Authentication Failures**: Clear error messages without information leakage

### Logging

- **Structured Logging**: Consistent log format across all modules
- **Error Tracking**: Detailed error information for debugging
- **Performance Monitoring**: Logs for performance analysis
- **Security Events**: Logs for security monitoring

## Deployment

### Production Deployment

- **Gunicorn**: WSGI server for production deployment
- **Systemd Service**: Automatic startup and management
- **Log Rotation**: Automatic log file management
- **Health Monitoring**: System health and performance monitoring

### Configuration Management

- **Dynamic Reloading**: Configuration changes without restart
- **Environment Variables**: Flexible configuration via environment
- **Secret Management**: Secure handling of sensitive configuration
- **Backup and Recovery**: Configuration backup and restoration

## Integration Points

### Frontend Integration

- **WebSocket Client**: Real-time data subscription
- **REST API**: Traditional HTTP endpoints for CRUD operations
- **File Upload**: Direct file upload to NAS storage
- **Admin Interface**: Administrative control panel

### System Integration

- **Systemd Services**: Service status monitoring and control
- **Hardware Monitoring**: CPU, memory, disk, power monitoring
- **Network Services**: VPN, DNS, firewall management
- **Storage Management**: NAS mount points and file operations

This backend architecture provides a robust foundation for the HOMESERVER platform, enabling real-time monitoring, secure administration, and professional-grade system management capabilities. 