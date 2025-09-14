# HOMESERVER Premium Tab Integration Guide

## System Architecture Overview

**CRITICAL UNDERSTANDING**: Premium tabs are installed **INSIDE** the regular homeserver tab system, not as separate entities. They become integrated components of the main application.

### Installation Target Structure
Premium tabs are installed into the main homeserver directory structure:

```
/var/www/homeserver/
├── backend/
│   ├── backupTab/          # ← Premium tab backend (installed here)
│   ├── admin/
│   ├── auth/
│   └── ...
├── src/
│   ├── tablets/
│   │   ├── backupTab/      # ← Premium tab frontend (installed here)
│   │   ├── admin/
│   │   ├── portals/
│   │   └── ...
│   ├── components/         # ← Shared components (Popup, Toast, etc.)
│   ├── hooks/
│   └── ...
└── premium/                # ← Source packages (development only)
    ├── backupTab/
    │   ├── backend/
    │   ├── frontend/
    │   └── ...
    └── ...
```

**Key Points**:
- **Source**: Premium tab packages live in `/premium/` directory (development)
- **Target**: Installed tabs live in `/backend/` and `/src/tablets/` (production)
- **Integration**: Once installed, premium tabs are indistinguishable from core tabs
- **Access**: Premium tabs can access all shared components, hooks, and utilities

## Import Patterns

### Correct Import Structure
When working within premium tabs, use the following import patterns:

```typescript
// For components within premium tabs
import { ComponentName } from '../path/to/component';

// For shared utilities and hooks
import { hookName } from '../../../hooks/hookName';

// For popup manager (toasts, tooltips, modals)
import { showToast, showTooltip, showModal } from '../../../components/Popup/PopupManager';

// For CSS files
import './ComponentName.css';
```

### Directory Structure Reference
**Development Structure** (in `/premium/`):
```
premium/
├── backupTab/
│   └── frontend/
│       ├── components/
│       │   ├── ScheduleTab.tsx
│       │   └── ScheduleTab.css
│       └── hooks/
│           └── useBackupControls.ts
└── otherTab/
    └── frontend/
        └── components/
            └── SomeComponent.tsx
```

**Installed Structure** (in `/src/tablets/`):
```
src/tablets/
├── backupTab/              # ← Installed from premium/backupTab/frontend/
│   ├── components/
│   │   ├── ScheduleTab.tsx
│   │   └── ScheduleTab.css
│   └── hooks/
│       └── useBackupControls.ts
├── admin/                  # ← Core tab
├── portals/                # ← Core tab
└── ...
```

**Key Rule**: Never modify import paths once they're working. The relative path structure is:
- `../` - Go up one level from current directory
- `../../../` - Go up three levels to reach shared components
- `../../../../src/` - NEVER use this pattern

## Integration with Regular Tab System

### How Premium Tabs Become Core Components

**Installation Process**:
1. **Development**: Premium tabs are developed in `/premium/` directory
2. **Installation**: Files are copied/symlinked into main application structure
3. **Integration**: Premium tabs become indistinguishable from core tabs
4. **Runtime**: Premium tabs run as part of the main homeserver application

### Backend Integration
```python
# Premium tab backend files are installed to:
/var/www/homeserver/backend/backupTab/
├── __init__.py
├── routes.py
├── utils.py
└── ...

# And registered in the main Flask app:
# /var/www/homeserver/backend/__init__.py
from .backupTab import bp as backupTab_bp
app.register_blueprint(backupTab_bp)
```

### Frontend Integration
```typescript
// Premium tab frontend files are installed to:
/var/www/homeserver/src/tablets/backupTab/
├── index.tsx
├── types.ts
├── components/
│   ├── ScheduleTab.tsx
│   └── ScheduleTab.css
└── hooks/
    └── useBackupControls.ts

// And imported by the main application:
// /var/www/homeserver/src/tablets/admin/index.tsx
import BackupTab from '../backupTab';
```

### Configuration Integration
```json
// Premium tabs are added to main configuration:
// /var/www/homeserver/src/config/homeserver.json
{
  "tabs": {
    "admin": { ... },
    "portals": { ... },
    "backupTab": {          // ← Premium tab configuration
      "config": {
        "displayName": "Backup Management",
        "adminOnly": false,
        "order": 999,
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

### Shared Resource Access
Premium tabs have full access to all shared resources:

```typescript
// Access to shared components
import { Modal, Toast, Tooltip } from '../../../components/Popup/PopupManager';

// Access to shared hooks
import { useWebSocket, useAuth } from '../../../hooks/useWebSocket';

// Access to shared utilities
import { formatDate, validateInput } from '../../../utils/helpers';

// Access to shared types
import { User, SystemStatus } from '../../../types/api';
```

### Service Integration
Premium tabs are served by the same services as core tabs:
- **Nginx**: Serves static assets and proxies API requests
- **Gunicorn**: Runs the Flask backend with premium tab blueprints
- **React Build**: Premium tab components are included in main build
- **WebSocket**: Premium tabs can use the same WebSocket connections

## Popup Manager Integration

The Popup Manager is the centralized system for all user notifications and interactive elements.

### Toast Notifications

#### Basic Usage
```typescript
import { showToast } from '../../../components/Popup/PopupManager';

// Success toast
showToast({
  message: 'Operation completed successfully',
  variant: 'success',
  duration: 3000
});

// Error toast
showToast({
  message: 'Failed to save configuration',
  variant: 'error',
  duration: 4000
});

// Info toast
showToast({
  message: 'System is updating...',
  variant: 'info',
  duration: 2000
});

// Warning toast
showToast({
  message: 'This action cannot be undone',
  variant: 'warning',
  duration: 5000
});
```

#### Advanced Toast Options
```typescript
showToast({
  message: 'Custom toast with extended duration',
  variant: 'success',
  duration: 10000,
  // Additional options can be added here
});
```

#### Toast Variants
- `'success'` - Green, checkmark icon
- `'error'` - Red, X icon  
- `'warning'` - Yellow, warning icon
- `'info'` - Blue, info icon

### Tooltips

#### Basic Usage
```typescript
import { showTooltip } from '../../../components/Popup/PopupManager';

// Simple tooltip
showTooltip({
  content: 'This explains what this button does',
  target: buttonElement,
  placement: 'top'
});

// Rich tooltip with HTML
showTooltip({
  content: '<strong>Advanced Feature</strong><br>Click to configure settings',
  target: element,
  placement: 'right',
  html: true
});
```

#### Tooltip Placements
- `'top'` - Above the element
- `'bottom'` - Below the element
- `'left'` - To the left of the element
- `'right'` - To the right of the element
- `'auto'` - Automatically choose best placement

### Modals

#### Basic Usage
```typescript
import { showModal } from '../../../components/Popup/PopupManager';

// Simple confirmation modal
showModal({
  type: 'confirm',
  title: 'Confirm Action',
  message: 'Are you sure you want to delete this item?',
  onConfirm: () => {
    // Handle confirmation
    console.log('User confirmed');
  },
  onCancel: () => {
    // Handle cancellation
    console.log('User cancelled');
  }
});

// Custom modal with React component
showModal({
  type: 'custom',
  title: 'Advanced Settings',
  content: <AdvancedSettingsComponent />,
  size: 'large'
});
```

## Integration Examples

### Complete Component Example
```typescript
import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { showToast, showModal } from '../../../components/Popup/PopupManager';
import './MyComponent.css';

interface MyComponentProps {
  onSave?: (data: any) => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ onSave }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState({});

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await onSave?.(data);
      showToast({
        message: 'Data saved successfully',
        variant: 'success',
        duration: 3000
      });
    } catch (error) {
      showToast({
        message: 'Failed to save data',
        variant: 'error',
        duration: 4000
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    showModal({
      type: 'confirm',
      title: 'Delete Item',
      message: 'Are you sure you want to delete this item? This action cannot be undone.',
      onConfirm: () => {
        // Handle deletion
        showToast({
          message: 'Item deleted successfully',
          variant: 'success'
        });
      }
    });
  };

  return (
    <div className="my-component">
      <button 
        onClick={handleSave}
        disabled={isLoading}
        className="save-button"
      >
        {isLoading ? (
          <FontAwesomeIcon icon={faSpinner} spin />
        ) : (
          <FontAwesomeIcon icon={faSave} />
        )}
        Save
      </button>
    </div>
  );
};
```

## Best Practices

### 1. Import Management
- **NEVER** change working import paths
- Use relative paths consistently
- Keep imports organized by type (React, libraries, local components, CSS)

### 2. Toast Usage
- Use appropriate variants for different message types
- Keep messages concise but informative
- Use longer durations for important messages
- Don't spam users with too many toasts

### 3. Tooltip Usage
- Use tooltips for non-critical information
- Keep content brief and helpful
- Test tooltip placement on different screen sizes

### 4. Modal Usage
- Use modals for important confirmations
- Keep modal content focused and actionable
- Provide clear cancel/confirm options

### 5. Error Handling
- Always wrap async operations in try/catch
- Show appropriate error messages to users
- Log errors for debugging

## Common Patterns

### Loading States with Toasts
```typescript
const [isLoading, setIsLoading] = useState(false);

const handleAsyncOperation = async () => {
  setIsLoading(true);
  try {
    await someAsyncOperation();
    showToast({
      message: 'Operation completed',
      variant: 'success'
    });
  } catch (error) {
    showToast({
      message: 'Operation failed',
      variant: 'error'
    });
  } finally {
    setIsLoading(false);
  }
};
```

### Confirmation Before Destructive Actions
```typescript
const handleDestructiveAction = () => {
  showModal({
    type: 'confirm',
    title: 'Confirm Deletion',
    message: 'This action cannot be undone. Are you sure?',
    onConfirm: () => {
      // Perform the destructive action
      performDestructiveAction();
      showToast({
        message: 'Action completed',
        variant: 'success'
      });
    }
  });
};
```

This integration guide ensures consistent patterns across all premium tabs and proper use of the popup management system.
