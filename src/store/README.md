# HOMESERVER Zustand Store Architecture

## Overview

The HOMESERVER frontend uses a sophisticated Zustand store architecture with a slice-based pattern to manage complex application state. The store is designed for a professional-grade digital sovereignty platform with real-time WebSocket communication, admin authentication, and comprehensive state persistence.

## Architecture Principles

### 1. Slice-Based Organization
The store is organized into **14 specialized slices**, each handling a specific domain of the application:

- **Admin Management** (`adminSlice`) - Authentication, session management, PIN validation
- **Theme System** (`themeSlice`) - Dynamic theming with CSS variable injection
- **Visibility Control** (`visibilitySlice`) - Tab and element visibility with debounced updates
- **Tab Management** (`tabSlice`) - Active tabs, starred tabs, tab configurations
- **Favorites System** (`favoriteSlice`) - Starred tab management with fallback logic
- **WebSocket Communication** (`websocketSlice`) - Real-time connection and event handling
- **Directory Management** (`directorySlice`) - File system navigation with caching
- **Subscription System** (`subscriptionSlice`) - WebSocket event subscriptions with type safety
- **Fallback Mode** (`fallbackSlice`) - Error recovery and fallback state management
- **Broadcast Data** (`broadcastDataSlice`) - WebSocket data storage with admin/regular modes
- **API Caching** (`cacheSlice`) - Request caching with expiration and admin-aware clearing
- **Sync Operations** (`syncSlice`) - File synchronization with progress tracking
- **Inactivity Timeout** (`inactivityTimeoutSlice`) - Session timeout management
- **Startup Management** (`startupSlice`) - Application initialization and phase tracking

### 2. Type Safety
All slices are fully typed with TypeScript interfaces, ensuring compile-time safety and excellent developer experience.

### 3. Persistence Strategy
The store uses Zustand's `persist` middleware with selective persistence:
- **Persisted fields**: `theme`, `visibility`, `starredTab`, `isInitialized`, `tabs`, `activeTab`
- **Excluded fields**: Admin state, WebSocket state, temporary data
- **Debounced writes**: 500ms debouncing to prevent excessive localStorage writes

## Store Structure

### Main Store (`index.ts`)
```typescript
export interface StoreState extends 
  AdminSlice, 
  ThemeSlice, 
  VisibilitySlice, 
  TabSlice, 
  FavoriteSlice, 
  WebSocketSlice, 
  DirectorySlice, 
  SubscriptionSlice, 
  FallbackSlice, 
  BroadcastDataSlice, 
  CacheSlice, 
  SyncSlice, 
  InactivityTimeoutSlice, 
  StartupSlice {
  setActiveTabForSubscriptions: (tabId: string) => void;
}
```

### Slice Pattern
Each slice follows a consistent pattern:
```typescript
export interface SliceName {
  // State properties
  property: Type;
  
  // Actions
  actionName: (params) => ReturnType;
}

export const createSliceName: StateCreator<StoreState, [], [], SliceName> = (set, get) => ({
  // Initial state
  property: initialValue,
  
  // Actions
  actionName: (params) => {
    set((state) => ({ /* state updates */ }));
  }
});
```

## Specialized Hooks

The store exports type-safe hooks for each slice, providing selective access to state and actions:

### Core Hooks
```typescript
// Admin management
export const useAdmin = () => useStore((state) => ({
  isAdmin: state.isAdmin,
  enterAdminMode: state.enterAdminMode,
  exitAdminMode: state.exitAdminMode,
  // ...
}));

// Theme management
export const useTheme = () => useStore((state) => ({
  theme: state.theme,
  themeData: state.themeData,
  setTheme: state.setTheme,
  toggleTheme: state.toggleTheme,
}));

// Tab management
export const useTab = () => useStore((state) => ({
  tabs: state.tabs,
  activeTab: state.activeTab,
  starredTab: state.starredTab,
  setActiveTab: state.setActiveTab,
  // ...
}));
```

### Specialized Hooks
```typescript
// WebSocket subscriptions
export const useSubscription = () => useStore((state) => ({
  subscribeToEvent: state.subscribeToEvent,
  subscribeToCoreEvent: state.subscribeToCoreEvent,
  subscribeToAdminEvent: state.subscribeToAdminEvent,
  subscribeToTabEvent: state.subscribeToTabEvent,
  // ...
}));

// Directory management
export const useDirectory = () => useStore((state) => ({
  loadDirectory: state.loadDirectory,
  loadDirectoryDeep: state.loadDirectoryDeep,
  expandDirectory: state.expandDirectory,
  // ...
}));
```

## Key Features

### 1. WebSocket Integration
The store seamlessly integrates with WebSocket communication:
- **Real-time data**: System stats, service status, power monitoring
- **Admin authentication**: Secure admin mode with encrypted payloads
- **Subscription management**: Type-safe event subscriptions with automatic cleanup
- **Fallback handling**: Graceful degradation when WebSocket fails

### 2. Admin Mode Management
```typescript
// PIN-based authentication with exponential backoff
enterAdminMode: async (pin: string) => Promise<boolean>

// Session timeout with activity tracking
updateLastActivity: () => void
checkSessionTimeout: () => boolean
```

### 3. Caching System
```typescript
// API response caching with expiration
setApiCacheEntry: <T>(key: string, data: T, duration: number) => void
getApiCacheEntry: <T>(key: string) => CacheEntry<T> | null
isApiCacheValid: (key: string) => boolean

// Admin-aware cache clearing
clearAdminApiCaches: () => void
```

### 4. Directory Management
```typescript
// Hierarchical file system navigation
loadDirectoryHierarchical: (path: string) => Promise<DirectoryEntry[]>
expandDirectory: (path: string) => Promise<DirectoryEntry[]>
toggleDirectoryExpansion: (path: string) => Promise<void>

// Intelligent caching with depth tracking
updateDirectoryTree: (path: string, entries: DirectoryEntry[], parent: string | null) => void
```

### 5. Fallback System
```typescript
// Automatic fallback activation
activateFallback: (reason: string) => void
deactivateFallback: () => void

// Fallback state preservation
lastActiveTab: string | null
fallbackActivationTime: number | null
```

## Usage Patterns

### 1. Component Integration
```typescript
import { useAdmin, useTheme, useTab } from '../store';

const MyComponent = () => {
  const { isAdmin, enterAdminMode } = useAdmin();
  const { theme, setTheme } = useTheme();
  const { activeTab, setActiveTab } = useTab();
  
  // Component logic
};
```

### 2. WebSocket Subscriptions
```typescript
import { useSubscription } from '../store';

const SystemMonitor = () => {
  const { subscribeToCoreEvent } = useSubscription();
  
  useEffect(() => {
    const unsubscribe = subscribeToCoreEvent('system_stats', (data) => {
      // Handle system stats updates
    });
    
    return unsubscribe;
  }, []);
};
```

### 3. Directory Navigation
```typescript
import { useDirectory } from '../store';

const FileBrowser = () => {
  const { loadDirectory, expandDirectory, directoryCache } = useDirectory();
  
  const handleDirectoryClick = async (path: string) => {
    await expandDirectory(path);
  };
};
```

## Advanced Features

### 1. Debounced Updates
The visibility slice uses debounced updates to prevent excessive API calls:
```typescript
const debouncedUpdate = debounce(async () => {
  await api.put('/tabs/updateElementVisibility', updates);
}, 300);
```

### 2. Memoization
The tab slice uses memoization for expensive calculations:
```typescript
// Cache visible tabs calculation
const cacheKey: VisibleTabsCacheKey = {
  isAdmin: state.isAdmin,
  visibilitySignature: JSON.stringify(/* visibility state */),
  tabsVersion: Object.keys(state.tabs).length
};
```

### 3. Queue Management
The visibility slice implements operation queuing to prevent race conditions:
```typescript
const queueStarringOperation = async (tabId: string, operation: () => Promise<void>) => {
  const existing = starringQueue.get(tabId);
  if (existing) {
    return existing.promise;
  }
  // Execute operation with proper cleanup
};
```

### 4. Error Recovery
The startup slice implements comprehensive error recovery:
```typescript
startCoreInitialization: () => Promise<{ tabs: TabsState; starredTab: string; visibility?: TabVisibility }> => {
  // Retry logic with exponential backoff
  // Fallback to default state on failure
  // Graceful degradation
}
```

## Performance Optimizations

### 1. Selective Persistence
Only UI state is persisted, excluding sensitive admin data and temporary WebSocket state.

### 2. Debounced Writes
localStorage writes are debounced to prevent performance issues during rapid state changes.

### 3. Memoized Selectors
Hooks use selective state access to prevent unnecessary re-renders.

### 4. Cache Invalidation
Intelligent cache invalidation based on data freshness and admin state changes.

## Development Guidelines

### 1. Adding New Slices
1. Create the slice file in `slices/`
2. Define the interface extending the slice type
3. Implement the slice creator function
4. Add to the main store in `index.ts`
5. Export a specialized hook for the slice

### 2. State Updates
Always use immutable updates:
```typescript
set((state) => ({
  property: { ...state.property, newValue }
}));
```

### 3. Error Handling
Implement proper error boundaries and fallback states:
```typescript
try {
  await operation();
} catch (error) {
  logger.error('Operation failed:', error);
  // Implement fallback logic
}
```

### 4. Type Safety
Maintain strict TypeScript typing throughout:
```typescript
export interface MySlice {
  // Define all state properties
  // Define all action signatures
}
```

## Testing Considerations

### 1. Store Testing
- Test each slice in isolation
- Mock external dependencies (API, WebSocket)
- Test error scenarios and fallback behavior

### 2. Integration Testing
- Test slice interactions
- Verify persistence behavior
- Test WebSocket integration

### 3. Performance Testing
- Monitor re-render frequency
- Test with large datasets
- Verify memory usage patterns

## Troubleshooting

### Common Issues

1. **State not persisting**: Check if the field is included in `partialize`
2. **Excessive re-renders**: Use selective hooks and memoization
3. **WebSocket disconnections**: Check the connection status and retry logic
4. **Admin mode issues**: Verify PIN validation and session timeout logic

### Debug Tools
- Use the debug logger: `createComponentLogger('SliceName')`
- Monitor localStorage: `localStorage.getItem('homeserver-store')`
- Check WebSocket status: `useWebSocket()` hook

## Conclusion

The HOMESERVER Zustand store provides a robust, type-safe foundation for managing complex application state. The slice-based architecture ensures maintainability while the specialized hooks provide excellent developer experience. The integration with WebSocket communication, admin authentication, and comprehensive caching makes it suitable for professional-grade applications requiring real-time updates and secure operations. 