# Tablets System

## Overview

The tablets system is the core UI architecture of HOMESERVER, providing a modular, dynamic interface that adapts to different user roles and system states. Tablets are self-contained React components that represent distinct functional areas of the system, loaded dynamically based on user permissions and system configuration.

## Architecture

### Core Components

- **App.tsx**: Main orchestrator that manages tablet loading, switching, and fallback states
- **TabBar**: Navigation component that displays available tablets based on user permissions
- **Store (Zustand)**: Centralized state management for tablet configuration, visibility, and user roles
- **Fallback System**: Emergency UI that activates when normal tablets cannot load

### Tablet Types

#### 1. **Admin Tablet** (`/tablets/admin/`)
- **Purpose**: System administration and management
- **Components**: System controls, disk management, key management, debug subscriptions
- **Access**: Admin-only
- **Features**:
  - SSH/Samba service controls
  - Disk mounting/unmounting/encryption
  - Key management and security
  - System updates and maintenance
  - Hard drive testing and thermal monitoring

#### 2. **Portals Tablet** (`/tablets/portals/`)
- **Purpose**: Service portal management and access
- **Components**: Portal cards, add portal modal, service status
- **Access**: All users (with visibility controls)
- **Features**:
  - Dynamic portal configuration
  - Service status monitoring
  - Custom portal addition
  - Remote access support (Tailscale)

#### 3. **Stats Tablet** (`/tablets/stats/`)
- **Purpose**: System monitoring and statistics
- **Components**: CPU charts, memory usage, network traffic, disk I/O, DHCP leases
- **Access**: All users (with visibility controls)
- **Features**:
  - Real-time system metrics
  - Historical data visualization
  - Network interface monitoring
  - Process usage tracking

#### 4. **Upload Tablet** (`/tablets/upload/`)
- **Purpose**: File upload and directory management
- **Components**: Directory browser, upload progress, blacklist manager
- **Access**: All users (with visibility controls)
- **Features**:
  - Drag-and-drop file uploads
  - Directory navigation
  - Upload history tracking
  - Permission management
  - Blacklist configuration

#### 5. **Fallback Tablet** (`/tablets/fallback/`)
- **Purpose**: Emergency UI when normal tablets fail
- **Components**: Error display, recovery options, connection status
- **Access**: Always available
- **Features**:
  - Connection status display
  - Error recovery options
  - System status information
  - Emergency navigation

## Dynamic Loading System

### Module Loading
```typescript
// Dynamic import based on tab ID
const loadTabletModule = async (tabId: string): Promise<any> => {
  const normalizedTabId = tabId.startsWith('@') ? tabId.substring(1) : tabId;
  
  if (normalizedTabId === 'fallback') {
    return await import('./tablets/fallback/index');
  }
  
  const modulePath = `./tablets/${normalizedTabId}`;
  return await import(`${modulePath}/index`);
};
```

### Caching Strategy
- **Module Cache**: Prevents redundant imports
- **Fallback Cache**: Ensures emergency tablet is always available
- **State Persistence**: Maintains user preferences across sessions

### Loading Sequence
1. **Bootstrap Phase**: Determines initial tablet based on user role and configuration
2. **Priority Loading**: Loads bootstrap-determined tablet first
3. **Background Loading**: Preloads fallback tablet for emergency use
4. **Dynamic Switching**: Loads tablets on-demand when user navigates

## State Management

### Store Structure
```typescript
interface TabSlice {
  tabs: TabsState;           // Tab configurations
  activeTab: string | null;   // Currently active tablet
  isInitialized: boolean;     // Initialization status
  setActiveTab: (tabId: string) => void;
  getVisibleTabs: () => string[];
  hasTabAccess: (tabId: string) => boolean;
}
```

### Visibility Controls
- **Admin Mode**: Full access to all tablets
- **Regular Mode**: Access based on tab configuration and visibility settings
- **Element Visibility**: Individual components within tablets can be hidden/shown

### Permission System
```typescript
const hasTabAccess = (tabId: string) => {
  const tabData = state.tabs[tabId];
  const isVisible = state.visibility[tabId]?.tab === true;
  const isAdminTab = tabData.config.adminOnly === true;
  const hasAccess = !isAdminTab || (isAdminTab && state.isAdmin);
  const isEnabled = tabData.config.isEnabled !== false;
  
  return isVisible && hasAccess && isEnabled;
};
```

## Fallback System

### Activation Triggers
- **Connection Loss**: WebSocket disconnection
- **Loading Failures**: Tablet module loading errors
- **Permission Issues**: Access denied scenarios
- **System Errors**: Critical application failures

### Recovery Process
1. **Detection**: System detects issue and activates fallback
2. **Display**: Shows fallback tablet with error information
3. **Recovery**: Attempts to restore normal operation
4. **Transition**: Switches back to appropriate tablet

### Fallback States
```typescript
interface FallbackState {
  isActive: boolean;
  reason: string | null;
  isRecovering: boolean;
  recoveryMessage: string | null;
}
```

## Error Handling

### Tablet Loading Errors
- **Module Not Found**: Attempts alternative tablet loading
- **Invalid Module**: Falls back to emergency tablet
- **Loading Timeout**: Shows fallback with retry options

### Recovery Mechanisms
- **Automatic Retry**: Attempts to reload failed tablets
- **Alternative Loading**: Tries different tablets if primary fails
- **Graceful Degradation**: Maintains system functionality with reduced features

## Configuration

### Tab Configuration
```json
{
  "tabs": {
    "admin": {
      "config": {
        "id": "admin",
        "displayName": "Administration",
        "adminOnly": true,
        "order": 1,
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

### Visibility Settings
- **Tab Level**: Entire tablet visibility
- **Element Level**: Individual component visibility
- **Admin Override**: Admin can control visibility for all users

## Development Guidelines

### Creating a New Tablet

1. **Directory Structure**:
   ```
   /tablets/your-tablet/
   ├── index.tsx          # Main tablet component
   ├── components/        # Tablet-specific components
   ├── hooks/            # Custom hooks
   ├── types.ts          # TypeScript definitions
   └── styles/           # CSS files
   ```

2. **Component Structure**:
   ```typescript
   import React from 'react';
   import { ErrorBoundary } from '../../components/ErrorBoundary';
   
   const YourTablet: React.FC = () => {
     return (
       <ErrorBoundary>
         <div className="your-tablet">
           {/* Your tablet content */}
         </div>
       </ErrorBoundary>
     );
   };
   
   export default YourTablet;
   ```

3. **Configuration**:
   - Add tab configuration to `homeserver.json`
   - Define visibility settings
   - Set appropriate permissions

## Performance Considerations

### Loading Optimization
- **Lazy Loading**: Tablets load only when needed
- **Module Caching**: Prevents redundant imports

### Memory Management
- **Component Cleanup**: Proper unmounting of tablet components
- **Cache Management**: Periodic cleanup of unused modules
- **State Optimization**: Efficient state updates and re-renders

## Security

### Access Control
- **Role-Based Access**: Different tablets for different user roles
- **Permission Validation**: Server-side validation of all requests
- **Session Management**: Proper session handling and timeout

### Data Protection
- **Input Validation**: All user inputs validated
- **XSS Prevention**: Proper escaping and sanitization
- **CSRF Protection**: Token-based request validation

---

This tablets system provides a robust, scalable foundation for the HOMESERVER interface, ensuring reliable operation across various scenarios while maintaining excellent user experience and developer productivity. 