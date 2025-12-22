# Tab Management System

The Tab Management System is a core component of the HOMESERVER platform that handles the configuration, visibility, and state management of UI tabs. This system provides a centralized approach to managing tab-based navigation with support for admin controls, visibility states, and fallback mechanisms.

## Overview

The tab management system consists of:

- **Backend API** (`routes.py`): RESTful endpoints for tab operations
- **Configuration Structure**: JSON-based tab definitions in `homeserver.json`
- **WebSocket Integration**: Real-time updates and state synchronization
- **Fallback System**: Automatic recovery when no tabs are available
- **Admin Controls**: Role-based access and visibility management

## Configuration Structure

Tabs are defined in the `homeserver.json` configuration file under the `tabs` section:

```json
{
  "tabs": {
    "admin": {
      "config": {
        "displayName": "Admin",
        "adminOnly": true,
        "order": 0,
        "isEnabled": true
      },
      "visibility": {
        "tab": true,
        "elements": {
          "settings": true
        }
      },
      "data": {}
    },
    "portals": {
      "config": {
        "displayName": "Portals",
        "adminOnly": false,
        "order": 1,
        "isEnabled": true
      },
      "visibility": {
        "tab": true,
        "elements": {
          "Jellyfin": true,
          "Transmission": true,
          "Piwigo": true
        }
      },
      "data": {
        "portals": [...]
      }
    },
    "starred": "portals"
  }
}
```

### Tab Configuration Properties

#### `config` Object
- **`displayName`**: Human-readable tab name
- **`adminOnly`**: Boolean flag for admin-only access
- **`order`**: Numeric ordering for tab display (lower numbers first)
- **`isEnabled`**: Boolean flag to enable/disable the tab

#### `visibility` Object
- **`tab`**: Boolean flag for overall tab visibility
- **`elements`**: Object mapping element IDs to visibility states

#### `data` Object
- Tab-specific data (e.g., portal configurations, network notes)
- Structure varies by tab type

#### `starred` Property
- Special property indicating the currently starred/favorite tab
- Must reference a valid, enabled, visible tab

## API Endpoints

### GET `/api/tabs`
Retrieves all tabs and their configurations.

**Response:**
```json
{
  "tabs": {
    "admin": {
      "config": {...},
      "visibility": {...},
      "data": {...}
    }
  },
  "starredTab": "portals"
}
```

**Features:**
- Filters out disabled tabs
- Validates starred tab exists and is enabled
- Provides fallback tab if no valid tabs exist
- Excludes `starred` property from tab list

### POST `/api/setstarredtab`
Sets the starred/favorite tab.

**Request:**
```json
{
  "tabId": "portals"
}
```

**Validation Rules:**
- Tab must exist in configuration
- Tab must be enabled (`isEnabled: true`)
- Tab must be visible (`visibility.tab: true`)
- Admin-only tabs cannot be starred
- Fallback tab is always allowed

**WebSocket Event:** `starred_tab_updated`

### POST `/api/tabs/visibility`
Updates tab visibility state.

**Request:**
```json
{
  "tabId": "admin",
  "visibility": false
}
```

**Features:**
- Updates `visibility.tab` property
- Validates tab exists
- Emits WebSocket event for real-time updates

**WebSocket Event:** `visibility_updated`

### PUT `/api/tabs/elements`
Updates element visibility within a tab.

**Request:**
```json
{
  "tabId": "portals",
  "elementId": "Jellyfin",
  "visibility": true
}
```

**Features:**
- Updates specific element visibility
- Creates visibility structure if missing
- Emits WebSocket event for real-time updates

**WebSocket Event:** `element_visibility_updated`

## Fallback System

The tab management system includes a robust fallback mechanism to ensure the application remains functional even when primary tabs are unavailable.

### Fallback Tab
- **ID**: `fallback`
- **Display Name**: "produced by HOMESERVER LLC"
- **Order**: 999 (lowest priority)
- **Always Enabled**: Cannot be disabled
- **Always Visible**: Cannot be hidden
- **Non-Admin**: Available to all users

### Fallback Activation Triggers
1. **No Visible Tabs**: When no tabs are configured as visible
2. **WebSocket Disconnection**: When connection to server is lost
3. **Loading Failures**: When tablet modules fail to load
4. **Empty Container**: When tablet content area becomes empty
5. **Admin Mode Changes**: When admin logs out and no non-admin tabs are available

### Fallback Recovery
- Automatically attempts to return to previous state when conditions improve
- Maintains last active tab for recovery
- Provides user feedback during recovery attempts
- Supports admin mode transitions

## WebSocket Integration

The tab management system uses WebSocket events for real-time updates:

### Outgoing Events
- `starred_tab_updated`: When starred tab changes
- `visibility_updated`: When tab visibility changes
- `element_visibility_updated`: When element visibility changes

### Event Payloads
```typescript
// starred_tab_updated
{ tabId: string }

// visibility_updated
{ tabId: string, visibility: boolean }

// element_visibility_updated
{ tabId: string, elementId: string, visibility: boolean }
```

## Security and Validation

### Factory Config Protection
- All write operations check for factory configuration mode
- Returns error if using factory config (read-only mode)
- Prevents accidental configuration changes during factory setup

### Safe Write Operations
- Uses `safe_write_config()` utility for atomic writes
- Prevents corruption during concurrent access
- Provides rollback capability on failure

### Input Validation
- Validates all required parameters
- Checks tab existence before operations
- Ensures proper data types and structures
- Validates admin permissions for admin-only tabs

## Error Handling

### Common Error Scenarios
1. **Configuration File Not Found**: Returns 404 with fallback data
2. **Invalid JSON**: Returns 500 with error message
3. **Missing Parameters**: Returns 400 with validation error
4. **Invalid Tab ID**: Returns 400 with error message
5. **Write Failures**: Returns 500 with error message

### Fallback Responses
- Provides minimal valid state when configuration is unavailable
- Ensures application remains functional
- Includes fallback tab in all responses

## State Management

### Frontend Integration
The tab management system integrates with the frontend state management:

- **Tab Slice**: Manages tab configurations and active tab
- **Visibility Slice**: Handles visibility states and caching
- **Fallback Slice**: Manages fallback mode and recovery
- **WebSocket Slice**: Handles real-time updates

### State Synchronization
- Backend changes trigger WebSocket events
- Frontend updates state based on WebSocket events
- Local state changes are persisted to backend
- Fallback system monitors state changes

## Usage Examples

### Adding a New Tab
1. Add tab configuration to `homeserver.json`:
```json
{
  "tabs": {
    "newtab": {
      "config": {
        "displayName": "New Tab",
        "adminOnly": false,
        "order": 5,
        "isEnabled": true
      },
      "visibility": {
        "tab": true,
        "elements": {}
      },
      "data": {}
    }
  }
}
```

2. Create corresponding tablet component in `src/tablets/newtab/`

### Updating Tab Visibility
```javascript
// Frontend
await api.post('/api/tabs/visibility', {
  tabId: 'admin',
  visibility: false
});

// Backend automatically emits WebSocket event
// Frontend receives event and updates state
```

### Setting Starred Tab
```javascript
// Frontend
await api.post('/api/setstarredtab', {
  tabId: 'portals'
});

// Backend validates and updates configuration
// WebSocket event notifies all clients
```

## Best Practices

### Configuration Management
- Always validate tab configurations before deployment
- Use meaningful display names and ordering
- Test visibility states thoroughly
- Ensure fallback tab is always available

### Error Handling
- Implement proper error boundaries in frontend
- Handle WebSocket disconnections gracefully
- Provide user feedback for configuration errors
- Log all tab management operations

### Performance Considerations
- Cache visibility states to reduce API calls
- Use debounced updates for rapid changes
- Implement proper cleanup for WebSocket subscriptions
- Monitor fallback activation frequency

### Security
- Validate all user inputs
- Check admin permissions before operations
- Use safe write operations for configuration changes
- Log security-relevant events

## Troubleshooting

### Common Issues

**No Tabs Visible**
- Check `isEnabled` flags in configuration
- Verify `visibility.tab` settings
- Ensure admin mode is appropriate for tab access
- Check fallback system activation

**Starred Tab Not Working**
- Verify starred tab exists in configuration
- Check tab is enabled and visible
- Ensure tab is not admin-only (unless in admin mode)
- Validate configuration file format

**WebSocket Events Not Received**
- Check WebSocket connection status
- Verify event names match frontend expectations
- Ensure proper error handling for disconnections
- Monitor server logs for event emission

**Configuration Not Persisting**
- Check file permissions on `homeserver.json`
- Verify factory config mode is not active
- Ensure safe write operations are working
- Monitor disk space and I/O errors

## Related Components

- **Frontend State Management**: `src/store/slices/`
- **WebSocket Integration**: `src/components/WebSocket/`
- **Fallback System**: `src/utils/fallbackManager.ts`
- **Configuration Utils**: `backend/utils/utils.py`
- **Tablet Components**: `src/tablets/` 