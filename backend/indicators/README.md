# Indicators System

The indicators system provides real-time status monitoring and management for various services and network components in the HomeServer platform. It serves as the backend for status indicators displayed in the frontend UI.

## Architecture Overview

The indicators system is organized as a Flask blueprint with modular sub-components:

```
indicators/
├── __init__.py          # Blueprint registration
├── routes.py            # Core service status endpoints
├── utils.py             # Shared utility functions
├── tailscale/           # Tailscale VPN management
│   ├── __init__.py
│   ├── routes.py        # Tailscale-specific endpoints
│   └── utils.py         # Tailscale helper functions
└── vpn/                 # VPN management (PIA/Transmission)
    ├── __init__.py
    ├── routes.py        # VPN-specific endpoints
    └── utils.py         # VPN helper functions
```

## Core Components

### 1. Service Status Monitoring (`routes.py`)

The main indicators endpoint provides unified service status information:

- **`/api/status/services`** - Returns status of all configured services
- **`/api/status`** - Overall system status
- **`/api/uptime`** - System uptime information

#### Service Status Data Flow

1. **Configuration Source**: Reads from `homeserver.json` configuration file
2. **Portal Mapping**: Uses `tabs.portals.data.portals` to map services to their status
3. **Status Collection**: Calls `collect_services_status()` to gather real-time data
4. **Response Format**: Returns JSON with service name, description, status, and detailed information

#### Example Service Status Response

```json
[
  {
    "service": "jellyfin",
    "name": "Jellyfin",
    "description": "Media server",
    "status": "running",
    "detailed_status": "jellyfin: systemd: active | port 8096: open"
  },
  {
    "service": "transmission",
    "name": "Transmission", 
    "description": "BitTorrent client",
    "status": "stopped",
    "detailed_status": "transmissionPIA: systemd: inactive | port 9091: closed"
  }
]
```

### 2. Tailscale Management (`tailscale/`)

Provides comprehensive Tailscale VPN management capabilities:

#### Endpoints

- **`GET /api/status/tailscale`** - Get connection status and IP
- **`POST /api/status/tailscale/connect`** - Connect to Tailscale network
- **`POST /api/status/tailscale/disconnect`** - Disconnect from network
- **`POST /api/status/tailscale/authkey`** - Authenticate with auth key
- **`POST /api/status/tailscale/enable`** - Enable Tailscale service
- **`POST /api/status/tailscale/disable`** - Disable Tailscale service
- **`GET/POST /api/status/tailscale/config`** - Get/update configuration
- **`POST /api/status/tailscale/update-tailnet`** - Update tailnet configuration

#### Key Features

- **Connection Detection**: Checks interface status, IP assignment, and backend state
- **Authentication Flow**: Supports both interactive login URLs and auth key authentication
- **Configuration Management**: Updates homeserver.json, nginx config, and Caddy settings
- **Service Control**: Enables/disables systemd service with proper logging

#### Example Tailscale Status Response

```json
{
  "status": "connected",
  "ip": "100.64.0.1",
  "interface": true,
  "isEnabled": true,
  "timestamp": 1640995200.0,
  "tailnet": "my-tailnet"
}
```

### 3. VPN Management (`vpn/`)

Manages PIA (Private Internet Access) VPN and Transmission integration:

#### Endpoints

- **`GET /api/status/vpn/pia`** - PIA connection status
- **`GET /api/status/vpn/transmission`** - Transmission VPN status
- **`POST /api/status/vpn/updatekey/pia`** - Update PIA credentials
- **`POST /api/status/vpn/updatekey/transmission`** - Update Transmission credentials
- **`GET /api/status/vpn/pia/exists`** - Check if PIA credentials exist
- **`GET /api/status/vpn/transmission/exists`** - Check if Transmission credentials exist
- **`POST /api/status/vpn/enable`** - Enable VPN service
- **`POST /api/status/vpn/disable`** - Disable VPN service
- **`GET /api/status/vpn/check-enabled`** - Check if VPN service is enabled

#### Security Features

- **Encrypted Payloads**: All credential updates use encrypted payloads
- **Admin Authentication**: All management endpoints require admin privileges
- **Credential Validation**: Validates credential format and length
- **Service Coordination**: Stops Transmission services before credential updates

## Data Flow Architecture

### 1. Configuration-Driven Monitoring

The system uses `homeserver.json` as the single source of truth for service configuration:

```json
{
  "tabs": {
    "portals": {
      "data": {
        "portals": [
          {
            "name": "Jellyfin",
            "description": "Media server", 
            "services": ["jellyfin"],
            "type": "systemd",
            "port": 8096,
            "localURL": "https://jellyfin.home.arpa",
            "remoteURL": "https://home.tail13aff.ts.net/jellyfin/"
          }
        ]
      }
    }
  }
}
```

### 2. Real-Time Status Collection

The `collect_services_status()` function:

1. **Reads Configuration**: Loads portal definitions from `homeserver.json`
2. **Checks Systemd Status**: Uses `execute_systemctl_command()` to check service status
3. **Port Verification**: Uses `check_port()` to verify service accessibility
4. **Status Aggregation**: Combines systemd and port status for comprehensive health check

### 3. WebSocket Integration

Status data is broadcast via WebSocket events for real-time UI updates:

- **`services_status`** - Service health and status information
- **`tailscale_status`** - Tailscale connection and configuration status  
- **`vpn_status`** - VPN connection and credential status

### 4. Caching and Performance

- **Service Status Caching**: Monitors cache service enabled states for 60 seconds
- **WebSocket Broadcasting**: Real-time updates without polling
- **Error Handling**: Graceful degradation with detailed error logging

## Utility Functions

### `get_service_full_status(service_name, port)`

Provides comprehensive service status by checking both systemd and port status:

```python
def get_service_full_status(service_name: str, port: int = None) -> Tuple[bool, str]:
    """
    Get comprehensive service status using both systemctl and port checks.
    
    Returns:
        Tuple[bool, str]: (is_running, status_description)
    """
```

### `collect_services_status()`

Aggregates status for all configured services from `homeserver.json`:

```python
def collect_services_status() -> List[Dict]:
    """
    Collect status information for all configured services.
    Returns a list of service status indicators with both systemctl and port status.
    """
```

## Integration Patterns

### 1. Frontend Integration

The indicators system integrates with React components through:

- **WebSocket Subscriptions**: Real-time status updates via `useWebSocket` hook
- **Broadcast Data Store**: Centralized state management for status data
- **Admin Controls**: Privileged operations for service management

### 2. Monitoring Integration

The system integrates with the monitoring subsystem:

- **Service Monitors**: Background monitoring with `ServicesMonitor` class
- **Status Broadcasting**: Automatic WebSocket broadcasts on status changes
- **Cache Management**: Efficient caching to reduce system calls

### 3. Configuration Management

- **Dynamic Configuration**: Reads from `homeserver.json` for service definitions
- **Factory Fallback**: Graceful degradation to factory configuration if needed
- **Live Updates**: Configuration changes reflected immediately via WebSocket

## Error Handling

The system implements comprehensive error handling:

1. **Configuration Errors**: Graceful fallback to factory configuration
2. **Service Failures**: Detailed logging with service-specific error messages
3. **Network Issues**: Timeout handling for external service checks
4. **Permission Errors**: Proper admin authentication and privilege checking

## Security Considerations

- **Admin Authentication**: All management endpoints require admin privileges
- **Encrypted Credentials**: VPN credentials transmitted as encrypted payloads
- **Input Validation**: Comprehensive validation of all user inputs
- **Audit Logging**: All administrative actions logged for security

## Development Guidelines

### Adding New Indicators

1. **Create Blueprint Module**: Add new subdirectory under `indicators/`
2. **Define Routes**: Implement REST endpoints for status and management
3. **Add Utilities**: Create helper functions for status checking
4. **Update Configuration**: Add service definitions to `homeserver.json`
5. **Frontend Integration**: Create React components for UI display

### Testing Patterns

- **Unit Tests**: Test individual utility functions
- **Integration Tests**: Test endpoint responses and error handling
- **WebSocket Tests**: Verify real-time broadcast functionality
- **Admin Tests**: Test privileged operation security

## Performance Considerations

- **Caching Strategy**: Cache expensive operations (systemd checks, port scans)
- **WebSocket Efficiency**: Minimize broadcast frequency for unchanged data
- **Error Recovery**: Implement exponential backoff for failed operations
- **Resource Management**: Proper cleanup of subprocess calls and file handles

## Troubleshooting

### Common Issues

1. **Service Not Detected**: Check `homeserver.json` configuration and service names
2. **Permission Errors**: Verify admin authentication and sudo privileges
3. **WebSocket Disconnects**: Check network connectivity and firewall rules
4. **Configuration Errors**: Validate JSON syntax and required fields

### Debug Information

- **Logging**: All operations logged with appropriate detail levels
- **Status Endpoints**: Use `/api/status/services` for current service status
- **WebSocket Events**: Monitor WebSocket events for real-time status
- **Configuration**: Check `homeserver.json` for service definitions 