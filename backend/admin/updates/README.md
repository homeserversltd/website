# HOMESERVER Update Manager Backend API

## Overview

The Update Manager backend provides a Flask API interface for the frontend to interact with the HOMESERVER update system. This module bridges the React frontend with the schema-driven update manager CLI, enabling remote update operations through secure HTTP endpoints.

## Architecture

```
React Frontend
    ↓ HTTP/WebSocket
Flask Backend (this module)
    ↓ subprocess
updateManager.sh (CLI)
    ↓
index.py (Python Orchestrator)
    ↓
modules/ (Update Modules)
```

## API Endpoints

### Update Operations

#### `GET /api/admin/updates/check`
Check for available updates without applying them.

**Response:**
```json
{
  "success": true,
  "message": "Update check completed successfully",
  "details": {
    "updateAvailable": true,
    "currentVersion": "1.0.0",
    "latestVersion": "1.1.0",
    "updateInfo": {...},
    "checkTime": 1234567890,
    "operationTime": "2.45 seconds"
  }
}
```

#### `POST /api/admin/updates/apply`
Apply available updates to the system.

**Request Body:**
```json
{
  "mode": "full",      // Optional: 'full' (default) or 'legacy'
  "force": false       // Optional: force update even if no updates detected
}
```

**Response:**
```json
{
  "success": true,
  "message": "Updates applied successfully",
  "details": {
    "mode": "full",
    "force": false,
    "updateResult": {...},
    "appliedAt": 1234567890,
    "operationTime": "45.23 seconds"
  }
}
```

### Module Management

#### `GET /api/admin/updates/modules`
List all available modules with their status.

**Response:**
```json
{
  "success": true,
  "message": "Modules listed successfully",
  "details": {
    "modules": [
      {
        "name": "website",
        "enabled": true,
        "version": "1.0.0",
        "description": "HOMESERVER website frontend/backend update system"
      }
    ],
    "totalModules": 10,
    "enabledModules": 8,
    "disabledModules": 2,
    "listTime": 1234567890,
    "operationTime": "1.23 seconds"
  }
}
```

#### `GET /api/admin/updates/modules/<module_name>/status`
Get detailed status for a specific module.

**Response:**
```json
{
  "success": true,
  "message": "Module website status retrieved successfully",
  "details": {
    "moduleName": "website",
    "moduleInfo": {
      "status": "enabled",
      "details": {...}
    },
    "queryTime": 1234567890,
    "operationTime": "0.85 seconds"
  }
}
```

#### `POST /api/admin/updates/modules/<module_name>/toggle`
Enable or disable a specific module.

**Request Body:**
```json
{
  "enabled": true    // True to enable, False to disable
}
```

**Response:**
```json
{
  "success": true,
  "message": "Module website enabled successfully",
  "details": {
    "moduleName": "website",
    "enabled": true,
    "action": "enable",
    "toggleResult": {...},
    "toggleTime": 1234567890,
    "operationTime": "1.45 seconds"
  }
}
```

### Component Management

#### `POST /api/admin/updates/modules/<module_name>/components/<component_name>/toggle`
Enable or disable a specific component within a module.

**Request Body:**
```json
{
  "enabled": true    // True to enable, False to disable
}
```

**Response:**
```json
{
  "success": true,
  "message": "Component website/frontend enabled successfully",
  "details": {
    "moduleName": "website",
    "componentName": "frontend",
    "enabled": true,
    "action": "enable-component",
    "toggleResult": {...},
    "toggleTime": 1234567890,
    "operationTime": "1.12 seconds"
  }
}
```

### System Information

#### `GET /api/admin/updates/logs`
Retrieve recent update operation logs.

**Query Parameters:**
- `limit`: Number of entries (default: 50, max: 200)
- `level`: Log level filter ('info', 'warning', 'error', 'all')

**Response:**
```json
{
  "success": true,
  "message": "Update logs retrieved successfully",
  "details": {
    "logs": [
      {
        "timestamp": 1234567890,
        "level": "info",
        "message": "Update check completed successfully",
        "module": "system"
      }
    ],
    "totalEntries": 25,
    "limit": 50,
    "level": "all",
    "retrievalTime": 1234567890,
    "operationTime": "0.32 seconds"
  }
}
```

#### `GET /api/admin/updates/system-info`
Get system information relevant to updates.

**Response:**
```json
{
  "success": true,
  "message": "System update information retrieved successfully",
  "details": {
    "systemInfo": {
      "update_manager_path": "/usr/local/lib/updates/updateManager.sh",
      "update_manager_available": true,
      "python_orchestrator_available": true,
      "last_check_time": 1234567890,
      "system_version": "1.0.0"
    },
    "retrievalTime": 1234567890,
    "operationTime": "0.15 seconds"
  }
}
```

## Implementation Details

### Security
- All endpoints require admin authentication via `@admin_required` decorator
- Input validation for module and component names to prevent injection attacks
- Subprocess execution with timeout protection
- Comprehensive logging for audit trails

### Error Handling
- Consistent error response format
- Detailed logging for debugging
- Graceful handling of CLI timeouts and failures
- Validation of user inputs before processing

### Performance
- Command execution with configurable timeouts
- Parallel execution capability for multiple operations
- Response time tracking for monitoring
- Efficient output parsing

### Logging
- Structured logging with `[UPDATEMAN]` prefix
- Operation timing for performance monitoring
- Error tracking with full context
- Admin action logging for audit trails

## Integration with Frontend

### WebSocket Events
The module can be extended to support real-time updates via WebSocket:
- `update_progress`: Real-time update progress
- `module_status_changed`: Module enable/disable notifications
- `update_completed`: Update completion notifications

### State Management
Frontend state should track:
- Available updates status
- Module enable/disable states
- Update operation progress
- Last check/update timestamps

## CLI Integration

The backend interfaces with the update manager CLI located at:
```
/usr/local/lib/updates/updateManager.sh
```

### Command Mapping
- `--check` → Update availability check
- `--enable <module>` → Enable module
- `--disable <module>` → Disable module
- `--enable-component <module> <component>` → Enable component
- `--disable-component <module> <component>` → Disable component
- `--list-modules` → List all modules
- `--status [module]` → Get status information
- `--legacy` → Use legacy update mode

### Output Parsing
The module includes sophisticated output parsing to extract:
- Update availability status
- Module information and states
- Operation success/failure indicators
- Version information
- Error messages and details

## Development Notes

### Testing
- Unit tests for output parsing functions
- Integration tests for CLI interaction
- Mock implementations for development
- Error condition testing

### Future Enhancements
- Real-time progress reporting via WebSocket
- Update scheduling and automation
- Rollback capability
- Update history tracking
- Performance metrics collection

### Dependencies
- Flask and Flask extensions
- Backend utilities and decorators
- System CLI tools (git, subprocess)
- Logging infrastructure

## Error Codes

### Common HTTP Status Codes
- `200`: Success
- `400`: Bad Request (invalid parameters)
- `401`: Unauthorized (authentication required)
- `500`: Internal Server Error (system failure)

### Custom Error Messages
- "Invalid module name": Module name validation failed
- "Update operation timed out": CLI command exceeded timeout
- "Update manager execution failed": CLI command failed
- "Failed to parse output": Output parsing error