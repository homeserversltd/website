# StatusIndicators System Design Guide

## Overview
The StatusIndicators system provides a centralized, visual representation of system-wide status across multiple network and service domains, serving both informational and interactive purposes in regular and admin modes.

## Core Design Principles
1. **Modularity**: Each indicator is a self-contained, reusable component
2. **Flexibility**: Support multiple status states
3. **Informative**: Provide detailed tooltips and clear visual feedback
4. **Performance**: Minimal render overhead, efficient state management
5. **Admin Integration**: Uses Header's admin state management
6. **Modal Integration**: Uses PopupManager for configuration windows

## Architecture

### Admin State Management
- All admin state is managed by the Header component
- Indicators access admin state via `useStore(state => state.isAdmin)`
- NEVER implement separate admin tracking in indicators
- NEVER track admin activity at the container level
- All admin interactions must use the global store

### Click Handling
- Click handlers are implemented in individual indicators
- Only active in admin mode: `onClick={isAdmin ? handleClick : undefined}`
- Use PopupManager's `showModal` for configuration interfaces
- Modal forms should follow the application's form patterns
- Configuration changes must be confirmed through the modal's onConfirm

### Container Component (index.tsx)
- Purely presentational
- NO admin state management
- NO click handling
- NO activity tracking
- Simply renders indicators in the correct layout

## Specific Indicator Requirements

### 1. Tailscale Status
#### Regular Mode:
- Show connection status (connected/disconnected)
- to verify if the conneciton is vigentiated, check the interface tailscale0 for 100.*.*.* IP verification
- Display connection status via icon color; if tailscale hasn't been linked to an account, use yellow. 

#### Admin Mode:
- Up/Down toggle for Tailscale connection
- if tailscale has yet to be bound to an account, run 'tailscale up' and return the stdin link tailscale generates so the user can link their home server to a tailscale account.
- Enable/Disable Tailscale (systemd)
- Display Tailscale IP address
- Tailnet Name Configuration 
  - Text input for Tailnet name
  - Descriptive tooltip { This unique name is used when registering DNS entries, sharing your device to other tailnets, and issuing TLS certificates. }
  - Save/Cancel buttons
  - Update /etc/caddy/Caddyfile configuration ; sed { server.**********.ts.net } with user's tailscale name

### 2. Internet Status
#### Regular Mode:
- Show internet connectivity status

#### Admin Mode:
- Display current public IP address
- Implement Speed Test Button
  - Initiate speed test
  - Display download/upload speeds
  - Show latency

### 3. OpenVPN Status
#### Regular Mode:
- Show VPN connection status
- Show Transmission running status
- Yellow if only one of them are running
- Red if neither are running
- Green if both are running

#### Admin Mode:
- set up PIA username and password using keyman suite
- set Transmission username and password via the tranmsission json - backend uses sed edits

### 4. Services Status
#### Regular Mode:
- Show overall service health
- curl individual port numbers localhost:portnumber from the /var/www/homeserver/src/config/ports.json file to determine if they are running
- yellow if not all visible services are running
- green if all visible services are running
- red if no services in list are running
- use /var/www/homeserver/src/config/homeserver.json to determine service visibility

#### Admin Mode:
no additional features 


## Components

### 1. Base Components
- `Indicator.tsx`: Generic indicator rendering
- `types.ts`: Type definitions for status states
- `index.tsx`: Aggregator component for all indicators
- `config.ts`: WebSocket event subscriptions
- `broadcastDataSlice.ts`: State management for broadcast data (referenced for status updates)

### 2. Specific Indicators
- `TailscaleIndicator.tsx`: Tailscale VPN status
- `InternetIndicator.tsx`: WAN connectivity
- `OpenVPNIndicator.tsx`: VPN tunnel status
- `ServicesIndicator.tsx`: Aggregate backend services status

## Implementation Strategy

### State Management
- Use `useStatus` hook to retrieve real-time status
- Support WebSocket streaming for live updates
- Implement connection health checks
- Manage subscription states

### Rendering
- Consistent icon and color scheme
- Tooltip with detailed status information using existing tooltip component
- Responsive design considerations
- Theme-adaptive color states
  - Up: var(--success)
  - Partial: var(--warning)
  - Down: var(--error)
  - Unknown: var(--secondary)

### Responsive Tooltip System
- Use the `useResponsiveTooltip` hook instead of directly using the `Tooltip` component
- Tooltips are automatically disabled on mobile devices (width <= 480px)
- Implementation pattern:
  ```typescript
  // 1. Create a tooltip message callback
  const getTooltipMessage = useCallback(() => {
    // Return tooltip content based on current state
    return `Status: ${status}`;
  }, [status]);

  // 2. Use the responsive tooltip hook
  const { wrapWithTooltip } = useResponsiveTooltip(getTooltipMessage);

  // 3. Create the indicator element
  const indicator = (
    <div onClick={handleClick} className="indicator">
      <FontAwesomeIcon icon={faIcon} />
    </div>
  );

  // 4. Return the indicator wrapped in a tooltip
  return wrapWithTooltip(indicator);
  ```
- Benefits:
  - Improves mobile UX by eliminating tooltips that interfere with touch interactions
  - Maintains desktop functionality with informative tooltips
  - Consistent implementation across all indicators
  - Type-safe with proper TypeScript support
  - Supports dynamic tooltip content that updates with state changes

### Error Handling
- Graceful degradation for unknown states
- Provide meaningful tooltips
- Avoid breaking UI on status retrieval failures
- Implement robust reconnection strategies

## Performance Considerations
- Memoize status computation
- Minimize re-renders
- Use efficient status retrieval mechanisms
- Implement WebSocket optimizations
- Use circular buffers for time-series data
- Throttle DOM updates

- **Modal Rendering**: 
  - Use refs to access current state in modals rather than closing over changing values
  - Define modal content inline with state ref access rather than separate render functions
  - Maintain stable function references for modal children props
  - Avoid state dependencies in modal render functions

## Best Practices for Modal Implementation

### 1. State Management
- 🔄 Use React refs to access frequently changing state in modals
- 🧊 Keep modal content functions pure where possible
- 📦 Encapsulate modal state within the indicator component

### 2. Rendering Optimization
- ⚡️ Avoid creating new function references on each render
- 📌 Use useCallback for stable click handlers
- 🔍 Access current state through refs instead of closures
- 🖼️ Keep modal JSX definitions simple and direct

### 3. Dependency Management
- 🎯 Minimize dependency arrays to essential values only
- 🔗 Use ref.current instead of state in dependency arrays
- 🚫 Avoid prop/state dependencies in modal content functions

### 4. Performance Patterns
- ⏳ Throttle frequent updates using the PopupManager's tick system
- 📊 Use derived state where possible instead of new state values
- 🧩 Break complex modals into memoized sub-components
- 🚀 Leverage WebSocket streaming for real-time data

## Interaction Modes
- Regular Mode: Informational display
- Admin Mode: Comprehensive control and configuration