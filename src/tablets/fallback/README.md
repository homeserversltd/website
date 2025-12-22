# Fallback Tablet

The Fallback Tablet is a critical component of the HomeServer system that provides a fallback interface when the system encounters issues or needs to display a restricted view.

## States

The Fallback Tablet can exist in several distinct states:

### 1. Restricted Access Mode (Simplified View)
- Triggered when `isFallbackOnlyAccessibleTab` is true
- Two sub-states:
  - **Connected Restricted Access**
    - Basic restricted access message
    - No reload button
    - Minimal UI with just logo and message
  - **Disconnected Restricted Access**
    - Shows connection lost message
    - Includes reload button
    - Indicates need to switch to Admin Mode

### 2. Connection Lost State
- Triggered when `websocketStatus === 'disconnected'` or `fallbackReason === 'websocket_disconnected'`
- Shows connection lost message
- May show recovery messages or errors
- Includes reload button (if not in simplified view)

### 3. Standard Fallback Mode
- Triggered when `!error && !fallbackReason`
- Basic fallback display
- May show recovery messages or errors
- Includes reload button (if not in simplified view)

### 4. System Recovery Mode
- Triggered when there's a specific error or fallback reason
- Shows detailed error information
- May include:
  - Fallback reason
  - Error message
  - Recovery status
  - Technical details (admin only)
- Includes reload button (if not in simplified view)

## Fallback Reasons

The system accepts any string as a fallback reason. Common reasons include:

- `websocket_disconnected`: When WebSocket connection is lost
- `user_inactivity`: When user is inactive for too long
- `no_visible_tabs`: When no tabs are visible
- `parse_error_timeout`: When there's a parse error with extended timeout
- `visibility_state_no_tabs`: When visibility state changes result in no visible tabs
- `ui_reset_in_progress`: When the web interface services (gunicorn & caddy) are being restarted
- `certificate_refresh_in_progress`: When the SSL certificate is being refreshed

### Activating Fallback

You can activate fallback mode with any string reason:

```typescript
// Using FallbackManager
fallbackManager.activateFallback("my_custom_reason");

// Using Store
useStore.getState().activateFallback("another_reason");
```

The system will:
1. Store the reason
2. Emit it in events
3. Display it in the fallback tablet (after replacing underscores with spaces)
4. Use it for recovery logic

## Event System

The fallback system uses custom events to communicate state changes:

- `fallback-activate`
- `fallback-deactivate`
- `fallback-recovery_attempt`
- `fallback-recovery_success`
- `fallback-recovery_failure`
- `fallback-prepare_recovery`

## State Management

The fallback state is managed by the `FallbackManager` class and includes:

```typescript
interface FallbackState {
  isActive: boolean;
  reason: string | null;
  lastActiveTab: string | null;
  activationTime: number | null;
  inRecoveryAttempt: boolean;
  lastRecoveryAttempt: number | null;
  isRecovering: boolean;
}
```

## Recovery Process

The fallback system includes a recovery process that:
1. Attempts to return to the previous state
2. Handles WebSocket reconnection
3. Manages admin mode transitions
4. Provides user feedback during recovery attempts

## Usage Notes

- The fallback tablet is automatically activated when needed
- Recovery requires admin mode for certain scenarios
- The system maintains the last active tab for recovery
- All state changes are logged for debugging purposes