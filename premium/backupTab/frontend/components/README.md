# HOMESERVER Backup Tab Components

This directory contains the modular components for the HOMESERVER Backup Tab frontend interface. The main `index.tsx` has been refactored to use dedicated components for each subtab, improving maintainability and code organization.

## Component Structure

### Main Components

- **`OverviewTab.tsx`** - System status and key metrics display
- **`ProvidersTab.tsx`** - Cloud provider configuration and management
- **`ScheduleTab.tsx`** - Backup scheduling and automation (placeholder)
- **`ConfigTab.tsx`** - Backup configuration and file management

### Utility Components

- **`StatusUtils.ts`** - Shared utility functions for status handling and formatting
- **`BackupCard.tsx`** - Individual backup operation card display
- **`RepositoryCard.tsx`** - Individual repository management card
- **`GoogleDriveSetupModal.tsx`** - Google Drive integration setup modal
- **`GoogleCloudStorageSetupModal.tsx`** - Google Cloud Storage integration setup modal
- **`GoogleSetupModal.tsx`** - Unified Google integration setup modal

### Setup Modals

- **`GoogleDriveSetupModal.tsx`** - Step-by-step Google Drive setup
- **`GoogleCloudStorageSetupModal.tsx`** - Step-by-step Google Cloud Storage setup
- **`GoogleSetupModal.tsx`** - Unified Google provider selection and setup

## Usage

### Importing Components

```typescript
import { 
  OverviewTab,
  ProvidersTab,
  ScheduleTab,
  ConfigTab,
  getStatusColor
} from './components';
```

### Component Props

#### OverviewTab
```typescript
interface OverviewTabProps {
  status: BackupStatus | null;
  config: BackupConfig | null;
  getStatusColor: (systemStatus: string) => string;
}
```

#### ProvidersTab
```typescript
interface ProvidersTabProps {
  config: BackupConfig | null;
  updateConfig: (config: Partial<BackupConfig>) => Promise<boolean>;
}
```

#### ScheduleTab
```typescript
interface ScheduleTabProps {
  // Future props for schedule configuration
}
```

#### ConfigTab
```typescript
interface ConfigTabProps {
  config: BackupConfig | null;
  updateConfig: (config: Partial<BackupConfig>) => Promise<boolean>;
}
```

## Benefits of Modular Structure

1. **Maintainability** - Each subtab is isolated and easier to maintain
2. **Reusability** - Components can be reused in other parts of the application
3. **Testing** - Individual components can be unit tested in isolation
4. **Code Organization** - Clear separation of concerns
5. **Performance** - Smaller bundle sizes and better tree shaking

## File Organization

```
components/
├── index.ts                    # Centralized exports
├── README.md                   # This documentation
├── StatusUtils.ts              # Shared utilities
├── OverviewTab.tsx             # Overview subtab component
├── ProvidersTab.tsx            # Providers subtab component
├── ScheduleTab.tsx             # Schedule subtab component
├── ConfigTab.tsx               # Config subtab component
├── BackupCard.tsx              # Backup operation card
├── RepositoryCard.tsx          # Repository management card
├── GoogleDriveSetupModal.tsx   # Google Drive setup modal
├── GoogleCloudStorageSetupModal.tsx # GCS setup modal
├── GoogleSetupModal.tsx        # Unified Google setup modal
├── GoogleDriveSetupModal.css   # Google Drive modal styles
├── GoogleSetupModal.css        # Google setup modal styles
└── GoogleDriveSetupModal.md    # Google Drive modal documentation
```

## Future Enhancements

- **ScheduleTab** - Implement actual scheduling functionality
- **Provider Modals** - Add setup modals for other cloud providers
- **Error Boundaries** - Add error boundaries for better error handling
- **Loading States** - Improve loading state management
- **Accessibility** - Enhance accessibility features

## Dependencies

- React 16.8+ (hooks support)
- TypeScript for type safety
- CSS modules for styling
- Shared types from `../types`

## Development Guidelines

1. **Type Safety** - Always define proper TypeScript interfaces
2. **Props Validation** - Use proper prop validation and default values
3. **Error Handling** - Implement proper error handling and loading states
4. **Accessibility** - Follow accessibility best practices
5. **Performance** - Use React.memo and useCallback where appropriate
6. **Documentation** - Document complex components and utilities

---

**Copyright (C) 2024 HOMESERVER LLC - All rights reserved.**