# Modal System Overview

This directory implements the modal (popup dialog) system for the application. The design is intentionally **one-popup-at-a-time**: only a single modal can be open at any given time. This avoids stacking dialogs and simplifies user experience and state management.

## Key Files and Responsibilities

- **useModal.ts**
  - Provides the `useModal` React hook for opening and closing modals from anywhere in the app.
  - Exposes `open`, `close`, and `closeAll` methods.
  - `open` replaces any currently open modal with the new one.
  - Does **not** return a close function or modal ID; closing is always done via `close()` or `closeAll()`.

- **PopupManager.tsx**
  - Centralized popup state and rendering, using Zustand for state management.
  - Handles both modals and toasts, but only one modal is shown at a time.
  - Receives modal content from `useModal` and renders it using the `Modal` component.
  - Ensures only one modal is visible; opening a new modal replaces the previous one.

- **index.tsx** (Modal component)
  - The actual modal dialog UI and logic.
  - Handles focus, keyboard events, overlay, and accessibility.
  - Receives props and content from `PopupManager`.

## Design Rationale

- **Single Modal Principle:**
  - Prevents confusion and complexity from stacked dialogs.
  - Simplifies modal state and closing logic.
  - All modal actions (open/close) are global and replace the current modal.

- **Usage Pattern:**
  - To open a modal: `openModal(<MyModalComponent ...props />)`
  - To close: `close()` or `closeAll()`
  - No need to track modal IDs or close functions.

- **Broadcast Data:**
  - Modals that need to react to live data (e.g., progress/status) should subscribe to broadcast data from the store, not via custom WebSocket hooks.

## Example

```ts
import { useModal } from '../../hooks/useModal';
import MyModal from './MyModal';

const { open, close } = useModal();

// Open a modal
open(<MyModal someProp={value} />);

// Close the modal
close();
```

## Notes
- This system is intentionally different from libraries that allow multiple stacked modals.
- If you need to keep a modal open during fallback or system events, use the `stayOpenOnFallback` prop.
- For more details, see the implementation in `PopupManager.tsx` and `useModal.ts`.
