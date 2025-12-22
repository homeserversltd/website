# Backup State Tracking System

## Overview

The backup state tracking system records the last backup timestamp and size for both manual and scheduled backups, making this information available to the UI for display in the header stats.

## How It Works

### State File Location
- **Path**: `/opt/homeserver-backup/backup_state.json`
- **Format**: JSON
- **Auto-created**: On first backup if it doesn't exist

### State File Structure

```json
{
  "last_backup": "2024-01-15T10:30:00",
  "last_backup_size_bytes": 1048576,
  "last_backup_size_display": "1.0 MB",
  "last_backup_type": "manual",
  "last_daily_backup": "2024-01-15T02:00:00",
  "backup_history": [
    {
      "timestamp": "2024-01-15T10:30:00",
      "type": "manual",
      "size_bytes": 1048576,
      "size_display": "1.0 MB",
      "success": true
    }
  ]
}
```

### Implementation Details

#### Frontend Changes
1. **ScheduleTab Component**:
   - Added `onHeaderStatsRefresh` prop
   - Calls `loadHeaderStats()` after successful backup completion
   - This refreshes the "Last Backup" and "Size" metrics

2. **index.tsx**:
   - Passes `loadHeaderStats` function to `ScheduleTab` component
   - Enables automatic header stats refresh after backups

#### Backend Changes

1. **EnhancedBackupCLI (`backup` file)**:
   - Added `_update_backup_state()` method
   - Tracks backup timestamp, size, and type
   - Updates state file after every successful backup
   - Maintains backup history (last 100 entries)
   - Differentiates between manual and scheduled backups

2. **Routes (`routes.py`)**:
   - Updated `get_header_stats()` endpoint
   - Reads backup size from state file
   - Returns formatted size information to frontend

### Backup Types

- **`manual`**: User-initiated backups (via "Sync Now" button)
- **`daily`**: Scheduled daily backups
- **`scheduled`**: Other scheduled backups

### State Updates

The state file is updated after each successful backup with:
- Last backup timestamp (ISO format)
- Last backup size (bytes and human-readable)
- Last backup type
- For scheduled backups: also updates `last_daily_backup`
- Backup history entry

### Automatic Size Calculation

The system automatically:
1. Gets file size in bytes
2. Converts to human-readable format (B, KB, MB, GB, TB)
3. Stores both formats for efficiency

### Display in UI

The header stats show:
- **Last Backup**: Formatted timestamp or "Never"
- **Size**: Human-readable size (e.g., "1.5 MB") or "Unknown"
- Updates automatically after manual sync via "Sync Now" button
- Updates automatically after scheduled backups

## Benefits

1. **Real-time Updates**: Stats refresh immediately after backups
2. **Accurate Sizing**: Actual backup file size, not estimated
3. **History Tracking**: Last 100 backups recorded
4. **Type Differentiation**: Manual vs scheduled backups tracked separately
5. **Persistent State**: Survives system restarts

## Testing

To test the system:

1. Click "Sync Now" button
2. Wait for backup to complete
3. Check that "Last Backup" updates with current timestamp
4. Check that "Size" updates with actual backup size
5. Run scheduled backup
6. Verify both timestamp and size update accordingly

## Troubleshooting

If stats don't update:

1. Check state file exists: `/opt/homeserver-backup/backup_state.json`
2. Check file permissions (should be readable by www-data)
3. Check backup logs for errors in `_update_backup_state()`
4. Verify state file is valid JSON
5. Check browser console for API errors