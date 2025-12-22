# nasLinker Premium Tab

Web-based hardlink management interface for the `/mnt/nas` directory, providing the same functionality as the linker TUI tool through a modern web interface.

## Features

- **Browse directories** within `/mnt/nas` with a modern file browser interface
- **Create hardlinks** by selecting files/directories and deploying them to a destination
- **Delete files and directories** (with safety checks for hardlinks)
- **Rename directories** through an interactive modal
- **Create new directories** with a simple dialog
- **Hardlink detection** - visual indicators for hardlinked files
- **Path restriction** - all operations are restricted to `/mnt/nas` for security

## Architecture

### Backend
- Flask blueprint providing REST API endpoints
- Wraps linker core functionality with path validation
- All paths validated to ensure they're within `/mnt/nas`

### Frontend
- React-based modern web UI
- Card-based file browser layout
- Selection system for batch operations
- Breadcrumb navigation
- Modal dialogs for rename and new directory actions

## API Endpoints

- `GET /api/nasLinker/browse?path=<path>` - Browse directory contents
- `POST /api/nasLinker/deploy` - Create hardlinks from selected items
- `DELETE /api/nasLinker/delete?path=<path>` - Delete file or directory
- `POST /api/nasLinker/rename` - Rename a directory
- `POST /api/nasLinker/newdir` - Create a new directory
- `GET /api/nasLinker/scan?path=<path>` - Scan for hardlinks
- `GET /api/nasLinker/status` - Get tab status
- `GET /api/nasLinker/config` - Get configuration

## Security

- All paths are validated to ensure they're within `/mnt/nas`
- Directory traversal attempts are blocked
- Sudo permissions required for hardlink operations (configured in permissions file)

## Dependencies

- Requires linker core modules to be available at `/usr/local/lib/linker`
- Uses existing linker infrastructure (core.py, link_index.py, permissions_helper.py, etc.)

## Installation

Install via the premium tab installer:

```bash
python3 /var/www/homeserver/premium/installer.py install nasLinker
```

## Usage

1. Navigate to the NAS Linker tab in the homeserver interface
2. Browse directories using the breadcrumb navigation or by double-clicking folders
3. Select files/directories using checkboxes
4. Use the action buttons to:
   - Deploy (create hardlinks) selected items to current directory
   - Delete files/directories
   - Rename directories
   - Create new directories

## Version

1.0.0
