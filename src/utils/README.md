# Utility Modules

This directory contains core utility modules that provide essential functionality for the application. The modules are designed to be modular, reusable, and maintainable.

## Core Modules

### bootstrap.ts
Handles the application initialization sequence with configuration options. Key responsibilities:
- Initializing WebSocket connections
- Determining the initial tab to load
- Managing recovery mechanisms for bootstrap failures
- Coordinating image caching and other startup tasks

**Bootstrap Process Flow:**
1. **Initialization Phase**:
   - Application starts and bootstrap.ts is executed
   - Image caching is initiated to ensure offline functionality
   - WebSocket system is initialized with appropriate configuration
   - Connection attempt is made with configurable timeout

2. **Tab Determination**:
   - Bootstrap checks for a starred tab in localStorage
   - If a valid starred tab exists, it's selected as the initial tab
   - If no starred tab exists, the first visible tab is selected
   - Fallback tab is used as a last resort if no valid tabs are found

3. **Handoff to App Component**:
   - Bootstrap result is passed to App component with initialTab, connectionStatus, and other metadata
   - App component prioritizes loading the bootstrap's initial tab first
   - TabManager is initialized with the bootstrap tab
   - Fallback tablet is loaded in the background only after the main tablet is loaded

4. **Tablet Loading Sequence**:
   - The bootstrap's initial tab (typically stats) is loaded first
   - A custom 'tablet-loaded' event is dispatched when the main tablet is loaded
   - Only after the main tablet is loaded, the fallback tablet is loaded in the background
   - The fallback tablet is cached for emergency use but not displayed

5. **Recovery Mechanisms**:
   - If the bootstrap tab fails to load, the system attempts to load an alternative tab
   - If all alternatives fail, the fallback tablet is loaded and fallback mode is activated
   - Special handling ensures the fallback tablet is never loaded first during bootstrap

### tabManager.ts
Centralized tab management system that handles:
- Tab navigation and state synchronization
- URL hash handling for deep linking
- Tab visibility management
- Active tab tracking and transitions
- Tablet component lifecycle management

### fallbackManager.ts
Comprehensive fallback system for graceful degradation:
- Activation/deactivation of fallback mode
- Recovery attempt management
- Event-based notification system
- Error handling and reporting
- Integration with admin mode and tab visibility

**Fallback Recovery Process:**
1. When recovering from fallback mode, the system:
   - Dispatches a 'force-tablet-reload' event to ensure complete tablet reloading
   - Clears the current tablet module and cache to ensure a fresh start
   - Forces loading of the target tablet (typically the previous active tab)
   - Provides event notifications for recovery success or failure

### events.ts
Centralized event handling system that:
- Extracts event handlers from App.tsx into a dedicated module
- Provides consistent event registration/deregistration
- Groups related event handlers together
- Improves testability and maintainability
- Handles WebSocket, fallback, and visibility events

### adminModeManager.ts
Manages admin mode state transitions and related functionality:
- Admin mode state management
- Tab accessibility during admin mode changes
- Transition cooldown management
- Event-driven state synchronization

## Supporting Utilities

### imageCache.ts
Handles image caching for offline use:
- Caching of essential application images
- Pre-loading of primary logo
- Fallback embedded logo
- Cache expiration management

### refreshUtils.ts
Utility functions for handling page refreshes:
- Rapid refresh detection
- Connection cooldown management
- Exponential backoff for retries
- Session storage integration

### secureAuth.ts
Provides secure authentication mechanisms:
- WebSocket authentication with encryption
- Admin PIN verification
- Challenge-response authentication
- AES-256 encryption for secure payloads

### api.ts
Lightweight fetch wrapper for API calls:
- Centralized HTTP request handling
- Error handling and response parsing
- Support for GET, POST, PUT, DELETE methods
- Type-safe API responses

## Usage Patterns

### Event Handling
```typescript
import { createAppEventHandlers, attachAppEventListeners } from './utils/events';

// Create event handlers with access to component state and refs
const eventHandlers = createAppEventHandlers(
  storeGetState,
  storeSetState,
  toast,
  componentRefs,
  stateSetters,
  loaders
);

// Attach all event listeners and get cleanup function
const cleanup = attachAppEventListeners(eventHandlers);

// Later, clean up event listeners
cleanup();
```

### Tab Management
```typescript
import { tabManager } from './utils/tabManager';

// Set active tab
tabManager.setActiveTab('dashboard', 'click');

// Get current active tab
const activeTab = tabManager.getActiveTab();
```

### Fallback System
```typescript
import { fallbackManager } from './utils/fallbackManager';

// Activate fallback mode
fallbackManager.activateFallback('connection_error');

// Attempt recovery
fallbackManager.attemptRecovery();
```

### Bootstrap Process
```typescript
import { bootstrapApplication } from './utils/bootstrap';

// Bootstrap the application with options
const bootstrapResult = await bootstrapApplication({
  timeout: 5000,
  initialTab: 'stats',
  forceOffline: false
});

// Use bootstrap result in App component
<App bootstrapResult={bootstrapResult} />
```

### Tablet Loading Sequence
```typescript
// In App.tsx
useEffect(() => {
  // If bootstrap provided an initial tab, prioritize loading it
  if (bootstrapResult && bootstrapInitialTabRef.current) {
    // Force the active tab to be the bootstrap tab
    setActiveTab(bootstrapInitialTabRef.current);
    
    // Load the bootstrap tab immediately
    loadTablet(bootstrapInitialTabRef.current);
    
    // Only pre-load the fallback tablet AFTER the main tablet is loaded
    const preloadFallbackAfterDelay = () => {
      setTimeout(() => {
        loadTabletModule('fallback')
          .then(module => {
            moduleCache.set('fallback', module);
            cachedFallbackTablet = module;
          });
      }, 2000); // Wait 2 seconds after main tablet loads
    };
    
    // Listen for the main tablet load completion
    window.addEventListener('tablet-loaded', handleMainTabletLoaded);
  }
}, []);
```

## Design Principles
1. **Single Responsibility**: Each module focuses on a specific area of functionality
2. **Event-Driven Architecture**: Modules communicate through well-defined events
3. **Type Safety**: Strict TypeScript typing throughout all utilities
4. **Modularity**: Utilities can be used independently or in combination
5. **Testability**: Designed with unit testing in mind
6. **Error Handling**: Graceful degradation and recovery mechanisms
7. **Prioritized Loading**: Critical components are loaded first, with non-essential components loaded in the background
8. **Complete Recovery**: During recovery, state is completely reset to ensure a fresh start 