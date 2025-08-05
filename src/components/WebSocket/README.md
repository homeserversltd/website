# WebSocket Client Architecture

This directory contains the WebSocket client implementation used throughout the application for real-time communication with the server.

## Structure

The WebSocket client has been modularized for better maintainability:

- **client.ts**: Main entry point that exposes a clean public API for other components to use
- **types.ts**: Type definitions for WebSocket events, subscriptions, and messages
- **config.ts**: Configuration constants for WebSocket events and subscription categories
- **WebSocketProvider.tsx**: React context provider for WebSocket functionality with automatic connection handling
- **index.ts**: Centralizes all module exports for easy importing
- **init.ts**: Provides initialization and system status checking functionality

### Core Module Structure

The functionality has been broken down into logical modules in the `core/` directory:

- **socket.ts**: Socket instance management and low-level socket operations
- **connect.ts**: Connection establishment and management
- **subscriptions.ts**: Subscription tracking and management across different types
- **auth.ts**: Authentication-related functionality including admin authentication
- **tabs.ts**: Tab-specific functionality for subscription management
- **events.ts**: Event listener setup and handling
- **startup.ts**: Initialization sequence and reconnection logic
- **broadcastIntegration.ts**: Integration with system broadcast events
- **index.ts**: Exports all core modules for easy import

## Usage

The client should always be accessed through the `socketClient` exported from `client.ts`:

```typescript
import { socketClient } from '../components/WebSocket/client';

// Connection
await socketClient.connect();

// Subscribing to events
const unsubscribe = socketClient.subscribe('system_stats', (data) => {
  console.log('Received system stats:', data);
});

// Later: unsubscribe
unsubscribe();

// Or use specialized subscription methods
socketClient.subscribeCoreEvent('internet_status', (data) => {
  console.log('Internet status:', data.status);
});

socketClient.subscribeTabEvent('system_stats', (data) => {
  console.log('System stats for tab:', data);
}, 'stats');

// Admin-specific features
if (isAdmin) {
  await socketClient.authenticateAsAdmin(token);
  socketClient.subscribeAdminEvent('admin_event', (data) => {
    console.log('Admin event:', data);
  });
}
```

## React Integration

The WebSocket functionality is available in React components through the WebSocketProvider:

```tsx
// In your app root
import { WebSocketProvider } from '../components/WebSocket';

function App() {
  return (
    <WebSocketProvider maxRetries={3} retryDelay={1000} maxRetryDelay={5000}>
      <YourAppContent />
    </WebSocketProvider>
  );
}

// In your components
import { useStore } from '../../store';

function YourComponent() {
  // Access WebSocket state from your store
  const { status, connect, disconnect } = useStore(state => ({
    status: state.status,
    connect: state.connect,
    disconnect: state.disconnect
  }));

  // Use the WebSocket functionality
  // ...
}
```

## Subscription Types

The client supports different types of subscriptions:

1. **Core**: Always active, system-wide events (defined in `CORE_EVENTS`)
2. **Admin**: Requires admin authentication (defined in `ADMIN_EVENTS`)
3. **Tab**: Specific to a particular tab, activated when the tab is active (defined in `TAB_EVENT_MAP`)
4. **Standard**: Basic subscriptions that need to be manually managed

## Event Handling

Events from the server are processed through registered callbacks. The client handles:

- Connection state management with automatic exponential backoff retries
- Authentication state and secure admin authentication
- Subscription persistence across reconnections
- Tab context changes with automatic subscription management
- Browser online/offline state detection

## Event Types

The system supports various event types defined in `WebSocketEventMap`, including:

- System statistics monitoring
- Service status updates
- Power and resource usage metrics
- Internet and network connectivity status
- Authentication and admin commands
- Tab-specific data updates
- File upload progress tracking

## Extending

When adding new WebSocket functionality:

1. Define event types in `types.ts`
2. Update config constants in `config.ts` if needed
3. Use the appropriate subscription method in your components

For larger architectural changes, modify the core modules and maintain the public API in `client.ts`. 