# Premium Tab System - Developer Guide

## Overview

The Premium Tab System enables dynamic injection of paid features into the homeserver platform through a standardized installation process. This guide provides everything needed to create premium tabs that integrate seamlessly with the existing system.

**Key Principles:**
- **Atomic Operations**: All-or-nothing installation prevents partial failures
- **Dependency Isolation**: Cross-tab conflict detection prevents version mismatches  
- **Security First**: Strict path validation and permission management
- **Zero Downtime**: Minimal service restarts during installation
- **Development Friendly**: One-command reinstall for rapid iteration cycles

## 🚀 Quick Start for Developers

**Need to update your tab? Use the reinstall workflow:**

```bash
# 1. Sync your changes
rsync -av --delete ./myTab/ root@server:/var/www/homeserver/premium/myTab/

# 2. Reinstall (single command, single build)
sudo python3 installer.py reinstall myTab
```

**This saves 4-6 minutes per iteration by eliminating unnecessary intermediate builds!**

## System Architecture

### Installation Tools

**Two Core Utilities:**
1. **`installer.py`** - Manages tab installation/uninstallation (requires sudo)
2. **`version_checker.py`** - Analyzes dependencies and validates tabs (no sudo required)

### Privilege Model

**Installer (sudo required):**
- System file modifications
- Service restarts
- Permission management
- Configuration patching

**Version Checker (no sudo):**
- Read-only dependency analysis
- Manifest validation
- Conflict detection
- Structure verification

## Directory Structure

### Premium Tab Package Layout
```
{tabName}/
├── index.json              # Root manifest - complete file inventory
├── homeserver.patch.json   # Configuration patches
├── backend/
│   ├── index.json          # Backend installation mapping
│   ├── requirements.txt    # Python dependencies (can be empty)
│   ├── routes.py           # Flask blueprint definition
│   ├── utils.py            # Supporting utilities
│   └── __init__.py         # Blueprint integration hook
├── frontend/
│   ├── index.json          # Frontend installation mapping
│   ├── package.patch.json  # NPM dependencies (can be empty object)
│   ├── index.tsx           # Main React component
│   ├── types.ts            # TypeScript definitions
│   ├── PortalCard.css      # Component styling
│   ├── components/
│   │   └── PortalCard.tsx  # UI components
│   ├── hooks/
│   │   └── useServiceControls.ts # Custom React hooks
│   └── images/
│       └── default.png     # Assets and icons
├── system/                 # System dependencies (optional)
│   └── dependencies.json   # System package requirements
└── permissions/
    └── premium_{tabName}   # Sudoers configuration
```

## JSON Schema Specifications

### Root Manifest (index.json)

**Purpose**: Complete file inventory and validation reference. Acts as source of truth for all installation operations.

```json
{
  "name": "tabName",
  "version": "1.0.0",
  "files": {
    "config": "/tabName/homeserver.patch.json",
    "backend": {
        "index": "/tabName/backend/index.json",
        "requirements": "/tabName/backend/requirements.txt",
        "blueprint": "/tabName/backend/routes.py",
        "utils": "/tabName/backend/utils.py",
        "init": "/tabName/backend/__init__.py"
    },
    "frontend": {
      "index": "/tabName/frontend/index.json",
      "package": "/tabName/frontend/package.patch.json"
    },
    "system": {
      "dependencies": "/tabName/system/dependencies.json"
    },
    "permissions": {
      "sudoers": "/tabName/permissions/premium_tabName"
    }
  }
}
```

**Validation Rules:**
- **File Completeness**: Every file in package MUST be listed
- **Path Accuracy**: File paths must match exactly
- **Version Consistency**: Version must match all sub-components
- **Name Uniqueness**: Tab name must be unique across system
- **Extra Files**: Any unlisted files cause validation failure

### System Dependencies (system/dependencies.json)

**Purpose**: Define system-level package requirements that are installed alongside the premium tab.

```json
{
  "packages": [
    {
      "name": "nginx",
      "version": "1.18.0",
      "description": "Reverse proxy server for the service",
      "flags": ["--no-install-recommends"],
      "conflicts": ["apache2"]
    },
    {
      "name": "python3-dev",
      "description": "Required for compiling Python extensions"
    },
    {
      "name": "build-essential",
      "description": "Compilation tools for native dependencies"
    }
  ],
  "metadata": {
    "version": "1.0.0",
    "platform": "debian",
    "conflicts": ["apache2", "lighttpd"]
  }
}
```

**Package Fields:**
- `name` (required): System package name (validated for security)
- `version` (optional): Specific version requirement 
- `description` (optional): Human-readable description
- `flags` (optional): Package manager flags (e.g., `--no-install-recommends`)
- `conflicts` (optional): List of packages that conflict with this one

**Metadata Fields:**
- `version` (required): Schema version for dependencies format
- `platform` (required): Target platform (`debian`, `ubuntu`, `rhel`, `centos`, `fedora`, `arch`, `any`)
- `conflicts` (optional): Global package conflicts that apply to all packages

**Supported Platforms:**
- **Debian/Ubuntu**: Uses `apt-get` package manager
- **RHEL/CentOS/Fedora**: Uses `dnf` package manager
- **Arch Linux**: Uses `pacman` package manager

**Security Features:**
- Package names are validated against dangerous packages list
- Installation flags are checked for safety
- Platform compatibility is enforced
- Conflict detection prevents incompatible installations

**No-Op Handling**: If no system dependencies are needed, simply omit the `system/` directory entirely.

### Backend Component Manifest (backend/index.json)

**Purpose**: Define backend file operations, primarily blueprint registration.

```json
{
  "name": "test",
  "version": "1.0.0",
  "files": [
    {
      "source": "backend/__init__.py",
      "target": "/var/www/homeserver/backend/__init__.py",
      "type": "append",
      "identifier": "test",
      "marker": "PREMIUM TAB BLUEPRINTS",
      "description": "Blueprint registration injection point for test premium tab"
    }
  ]
}
```

**Marker Field**: The `marker` field is **optional** for append operations. If not specified, the installer automatically detects the default `"PREMIUM TAB BLUEPRINTS"` marker for blueprint registration. This simplifies manifest creation while maintaining flexibility for future marker types.

### Frontend Component Manifest (frontend/index.json)

**Purpose**: Define frontend file operations, primarily copy operations for React components.

```json
{
  "name": "test",
  "version": "1.0.0",
  "files": [
    {
      "source": "frontend/index.tsx",
      "target": "/var/www/homeserver/src/tablets/test/index.tsx",
      "type": "copy",
      "identifier": null,
      "description": "Main React entry point for the tablet"
    },
    {
      "source": "frontend/types.ts",
      "target": "/var/www/homeserver/src/tablets/test/types.ts",
      "type": "copy",
      "identifier": null,
      "description": "TypeScript types for the tablet"
    },
    {
      "source": "frontend/PortalCard.css",
      "target": "/var/www/homeserver/src/tablets/test/PortalCard.css",
      "type": "copy",
      "identifier": null,
      "description": "Tablet-specific CSS"
    },
    {
      "source": "frontend/components/TestCard.tsx",
      "target": "/var/www/homeserver/src/tablets/test/components/TestCard.tsx",
      "type": "copy",
      "identifier": null,
      "description": "Main card component for displaying a service/item"
    },
    {
      "source": "frontend/hooks/useTestControls.ts",
      "target": "/var/www/homeserver/src/tablets/test/hooks/useTestControls.ts",
      "type": "copy",
      "identifier": null,
      "description": "Custom hook for item actions (start/stop/restart/etc)"
    },
    {
      "source": "frontend/images/default.png",
      "target": "/var/www/homeserver/src/tablets/test/images/default.png",
      "type": "copy",
      "identifier": null,
      "description": "Default icon for the tablet"
    }
  ]
}
```

**Frontend Schema Notes:**
- **Main Entry Point (`index.tsx`)**: Must export React component as default export
- **File Paths**: Must be exact and match files present in package
- **Structure Flexibility**: Add components, hooks, or assets as needed, but all must be listed
- **Copy Operations**: All frontend files use copy type for React build compatibility

### Configuration Patches (homeserver.patch.json)

**Purpose**: Define tab configuration merged into main homeserver.json.

```json
{
  "tabs": {
    "{tabName}": {
      "config": {
        "displayName": "Human Readable Tab Name",
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

**Required Fields:**
- `displayName`: UI display name
- `adminOnly`: Admin privilege requirement
- `order`: Tab display order (higher = later)
- `isEnabled`: Tab activation state
- `visibility.tab`: Tab visibility
- `visibility.elements`: Element-specific visibility
- `data`: Tab-specific configuration

### Frontend Dependencies (package.patch.json)

**Purpose**: NPM package additions merged into main package.json.

```json
{
  "dependencies": {
    "new-package": "^1.0.0",
    "another-package": "^2.1.0"
  },
  "devDependencies": {
    "dev-package": "^1.5.0"
  }
}
```

**No-Op Handling**: Use empty object `{}` if no dependencies needed.

### Backend Dependencies (requirements.txt)

**Purpose**: Python packages installed into main venv.

```
pandas==2.1.4
numpy==1.24.3
httpx==0.25.2
```

**No-Op Handling**: Use empty file if no dependencies needed.

## File Operation Types

### 1. Copy Operations (Primary for Frontend)

**Usage**: Direct file copying with automatic directory creation.

**Why Copy for Frontend**: React build systems have compatibility issues with symlinked TypeScript/JSX files. Copy operations ensure reliable builds.

**Behavior**:
- Creates missing target directories automatically
- Tracks all created directories for rollback
- Sets `www-data:www-data 775` permissions
- Skips if identical file exists at target
- Fails fast if different file exists at target

### 2. Symlink Operations (Primary for Backend)

**Usage**: Symbolic links for backend files that don't require build processing.

**Behavior**:
- Creates target directories as needed
- Replaces broken symlinks
- Skips if correct symlink exists
- Tracks created directories for rollback
- Sets proper permissions on links and targets

### 3. Append Operations (Blueprint Registration)

**Usage**: Inject code into existing files using marker blocks.

**Marker Strategy**: Uses dedicated comment blocks rather than end-of-file appends.

```python
# === PREMIUM TAB BLUEPRINTS START ===
# Premium tab blueprints are dynamically injected here during installation
# Do not manually edit this section - it is managed by the premium installer

# PREMIUM_TAB_IDENTIFIER: test
from .test import bp as test_bp
app.register_blueprint(test_bp)
# END_PREMIUM_TAB_IDENTIFIER: test

# === PREMIUM TAB BLUEPRINTS END ===
```

**Rules**:
- Content inserted between START/END markers
- Unique identifiers prevent duplicates
- Preserves existing formatting
- Validates syntax after append
- Clean removal during uninstall

## Development Workflow: Reinstall Command

**Streamlined Development Process**: The `reinstall` command provides a one-step solution for development iterations with **optimal efficiency**:

```bash
# Traditional 3-step process (INEFFICIENT):
sudo python3 installer.py uninstall devTab
rsync -av --delete ./devTab/ root@server:/var/www/homeserver/premium/devTab/
sudo python3 installer.py install devTab

# New streamlined process (OPTIMAL):
rsync -av --delete ./devTab/ root@server:/var/www/homeserver/premium/devTab/
sudo python3 installer.py reinstall devTab
```

**Key Efficiency Improvement**: 
- **Before**: Uninstall → Build → Install → Build (2 builds, ~2-3 minutes wasted)
- **After**: Uninstall → Install → Build (1 build, optimal performance)

**Benefits**:
- **Atomic Operation**: Single command ensures consistency
- **Error Handling**: Automatic rollback if either step fails
- **Logging**: Clear separation of uninstall and install phases
- **Development Speed**: Faster iteration cycles
- **Reduced Commands**: Fewer commands to remember and execute
- **Build Efficiency**: Only one frontend build and service restart at the end

**Use Cases**:
- **Code Updates**: After syncing modified files
- **Configuration Changes**: After updating manifest files
- **Testing**: Validate changes without manual uninstall/install
- **Debugging**: Clean slate for troubleshooting

**Batch Reinstallation**: For updating multiple tabs simultaneously:

```bash
# Reinstall multiple tabs with deferred operations (recommended)
sudo python3 installer.py reinstall tab1 tab2 tab3

# Reinstall with immediate operations (faster but less efficient)
sudo python3 installer.py reinstall tab1 tab2 --no-defer-build --no-defer-restart
```

**Deferred Operations**: By default, reinstall defers frontend rebuild and service restart until all tabs are processed, improving efficiency for multiple tab updates.

### How Reinstall Optimization Works

**Technical Implementation**: The reinstall process uses a `skip_build_and_restart` flag during the uninstall phase:

1. **Uninstall Phase**: 
   - Removes files, reverts config, uninstalls packages
   - **Skips** frontend rebuild and service restart (saves ~2-3 minutes)
   - Uses `skip_build_and_restart=True` parameter

2. **Install Phase**: 
   - Copies new files, installs dependencies, applies config
   - **Skips** frontend rebuild and service restart (saves ~2-3 minutes)
   - Uses deferred operations mode

3. **Final Phase**: 
   - **Single** frontend build incorporating all changes
   - **Single** service restart loading all new blueprints
   - Total time saved: 4-6 minutes per reinstall cycle

**Why This Matters**: During development, you might reinstall a tab 10+ times per session. This optimization saves 40-60 minutes of waiting time!

## Installation Process

### Pre-Installation Validation

**Comprehensive Checks**:
1. **Manifest Validation**: All index.json files verified
2. **File Completeness**: Every listed file must exist
3. **Version Consistency**: All components must match versions
4. **Dependency Conflicts**: Cross-tab version conflict detection for Python, NPM, and system packages
5. **System Platform Validation**: Verify system dependencies are compatible with current platform
6. **Name Collisions**: Unique tab name enforcement
7. **Path Security**: Target paths within allowed directories
8. **Configuration Validation**: Config patches tested before apply

### Installation Sequence

1. **Backup Phase**: Current config backed up to `/tmp`
2. **System Dependencies**:
   - Validate platform compatibility
   - Check for package conflicts
   - Update package manager repositories
   - Install required system packages
3. **Backend Installation**:
   - Install Python requirements into venv
   - Deploy backend files (symlink operations)
   - Register blueprints (append operations)
4. **Frontend Installation**:
   - Apply NPM package patches
   - Install new dependencies
   - Deploy frontend files (copy operations)
5. **Permissions Installation**: Deploy sudoers files
6. **Configuration Patching**: Merge config changes
7. **Service Restart**: Frontend build + gunicorn restart
8. **Validation**: Verify installation success

### Atomic Guarantee

**All-or-Nothing Model**: If any step fails, complete rollback to pre-installation state.

**Rollback Triggers**:
- File operation failures
- Dependency conflicts
- System package conflicts or installation failures
- Configuration validation failures
- Service restart failures
- Permission errors

**System Package Rollback**: Only newly installed packages are removed during rollback - packages that were already installed remain to prevent system instability.

## Dependency Management

### Version Conflict Detection

**Cross-Tab Analysis**: Scans all premium tabs for version conflicts before installation.

**Python Conflicts**: Compares pinned versions in all `requirements.txt` files.
**NPM Conflicts**: Compares versions in all `package.patch.json` files.
**System Package Conflicts**: Checks for conflicting system packages across all tabs.

**Conflict Resolution**: Installation aborts with detailed conflict report showing:
- Conflicting packages
- Requested versions
- Platform compatibility issues
- Suggested resolutions

### System Dependencies Management

**Installation Behavior**:
- System packages are installed using the platform's native package manager
- Package lists are updated before installation
- Version constraints are respected where supported by the package manager
- Installation flags (like `--no-install-recommends`) are applied as specified

**Platform Detection**: Automatic detection of system platform to use appropriate package manager:
- **Debian/Ubuntu**: `apt-get` with dpkg for version checking
- **RHEL/CentOS/Fedora**: `dnf` with rpm for version checking  
- **Arch Linux**: `pacman` for installation and version checking

**Security Validation**:
- Package names validated against dangerous packages list
- Installation flags checked for safety
- Platform compatibility enforced before installation

### Dependency Cleanup

**Uninstall Behavior**: 
- **Python/NPM packages**: Removes dependencies unique to uninstalled tabs
- **System packages**: NOT automatically removed for safety reasons

**System Package Safety**: During uninstallation, system packages are:
1. **Logged**: All installed system packages are listed in uninstall logs
2. **Preserved**: Packages are NOT automatically removed
3. **Documented**: Manual removal instructions provided if needed

**Rationale**: System packages may be required by other system components, other premium tabs, or core system functionality. Manual review ensures system stability.

## Security & Permissions

### Path Validation

**Allowed Target Paths** (strictly enforced):
- `/var/www/homeserver/backend/__init__.py` (append operations)
- `/etc/sudoers.d/` (sudoers files)
- `/var/www/homeserver/src/tablets/{tabName}/` (frontend files)
- `/var/www/homeserver/src/config/homeserver.json` (config patches)

**Security Rules**:
- No `../` or paths outside allowed directories
- All operations self-contained within approved paths
- Manifest validation rejects invalid paths

### Permission Management

**Critical Requirement**: Installer runs as root but must restore proper ownership.

**Config File Permissions**: After ANY config modification:
```bash
chown www-data:www-data /var/www/homeserver/src/config/homeserver.json
chmod 664 /var/www/homeserver/src/config/homeserver.json
```

**File Permissions**:
- Premium tab files: `www-data:www-data 775`
- Sudoers files: `root:root 0440`
- Created directories: `www-data:www-data 775`

## Service Management

### Minimal Restart Strategy

**Required Services**:
1. **Frontend Build**: `npm run build` (incorporates new components)
2. **Gunicorn**: `systemctl restart gunicorn.service` (loads new blueprints)

**Not Required**:
- Nginx (serves static files, proxies to gunicorn)
- Other services (premium tabs don't affect existing services)

### Error Handling

**Build Failure**: Rollback frontend changes, preserve existing build
**Service Failure**: Automatic systemd restart, fallback to previous state
**No Cascading Failures**: Other services remain unaffected

## Command Reference

### Installer Commands (requires sudo)

```bash
# Install single tab
sudo python3 installer.py install tabName

# Install all tabs in directory
sudo python3 installer.py install --all [directory]

# Reinstall single tab (uninstall then install from same path)
sudo python3 installer.py reinstall tabName

# Reinstall multiple tabs with deferred operations
sudo python3 installer.py reinstall tab1 tab2 tab3

# Reinstall with immediate build and restart (no deferral)
sudo python3 installer.py reinstall tabName --no-defer-build --no-defer-restart

# Uninstall single tab
sudo python3 installer.py uninstall tabName

# Uninstall all tabs
sudo python3 installer.py uninstall --all

# Validate tab structure
sudo python3 installer.py validate tabName

# Cross-tab conflict detection
sudo python3 installer.py validate --all --report

# List available/installed tabs
sudo python3 installer.py list [--installed|--all]

# Preview uninstall operations
sudo python3 installer.py uninstall tabName --dry-run
```

### Version Checker Commands (no sudo required)

```bash
# Check single tab dependencies
python3 version_checker.py check tabName [--report]

# Batch dependency analysis
python3 version_checker.py batch directory [--report]

# Version consistency check
python3 version_checker.py index tabName

# File manifest validation
python3 version_checker.py manifest tabName

# Version string validation
python3 version_checker.py validate 1.0.0

# Version comparison
python3 version_checker.py compare 1.0.0 2.0.0
```

## Error Handling & Debugging

### Common Error Scenarios

**Permission Errors**: Installer not run with sudo
**File Conflicts**: Different file exists at target location
**Version Conflicts**: Multiple tabs require different package versions
**Name Collisions**: Tab name already exists in system
**Invalid Manifests**: JSON syntax errors or missing files
**Configuration Errors**: Config patches break homeserver.json

### Debug Options

**Enhanced Logging**: Use `--debug` flag for comprehensive output
**Dry Run**: Preview operations with `--dry-run` (uninstall only)
**Detailed Reports**: Use `--report` flag for verbose analysis

### Logging & Audit Trail

**Log Location**: `/var/log/homeserver/premium_installer.log`
**Log Behavior**: Clobbers per run (no perpetual append)
**Real-Time Output**: Progress displayed like package managers
**Audit Trail**: Complete record of all operations and errors

## Best Practices for Tab Authors

### Development Guidelines

1. **Version Pinning**: Always pin exact versions in dependencies
2. **Manifest Completeness**: List every file in root index.json
3. **No-Op Consistency**: Use empty files/objects when no dependencies needed, or omit directories entirely
4. **Path Compliance**: Ensure all targets within allowed paths
5. **Testing**: Validate with version checker before installation
6. **Documentation**: Describe file purposes in manifests
7. **System Dependencies**: Only include essential system packages, avoid duplicating packages available in other tabs
8. **Development Workflow**: Use `reinstall` command for rapid iteration cycles instead of manual uninstall/install

### ⚠️ CRITICAL: Naming Consistency Requirements

**ALL names must match exactly across ALL files for the tab to work properly:**

1. **Tab Directory Name**: The folder name in `/premium/` (e.g., `devTab`)
2. **Tab Name in Root index.json**: The `"name"` field (e.g., `"devTab"`)
3. **Configuration Key in homeserver.patch.json**: The key under `"tabs"` (e.g., `"devTab"`)
4. **Blueprint Name in routes.py**: The Blueprint constructor name (e.g., `Blueprint('devTab', ...)`)
5. **Backend Directory Name**: The directory created in `/backend/` (e.g., `devTab`)

**Example of CORRECT naming consistency:**
```python
# routes.py
bp = Blueprint('devTab', __name__, url_prefix='/api/dev')

# homeserver.patch.json
{
  "tabs": {
    "devTab": {  // ← Must match blueprint name exactly
      "config": { ... }
    }
  }
}

# Root index.json
{
  "name": "devTab",  // ← Must match blueprint name exactly
  ...
}
```

**What happens if names don't match:**
- ❌ **Blueprint name mismatch**: Tab won't load, "Cannot find module" errors
- ❌ **Config key mismatch**: Tab appears in UI but has no functionality
- ❌ **Directory name mismatch**: Files won't be found during installation
- ❌ **Mixed naming**: Partial functionality or complete failure

**Golden Rule**: Use the SAME name everywhere. If your tab is called `devTab`, use `devTab` in:
- Folder name
- Blueprint constructor
- Configuration keys
- Manifest names
- All references

**Common Mistakes to Avoid:**
- Using `"dev"` in config but `"devTab"` in blueprint
- Using `"test"` in config but `"testTab"` in blueprint  
- Mixing camelCase and snake_case
- Using abbreviations in one place but full names in another

### System Dependencies Best Practices

1. **Minimal Packages**: Only include packages absolutely required for your tab's functionality
2. **Platform Targeting**: Specify the most restrictive platform that covers your use case
3. **Conflict Awareness**: Check existing tabs for potential package conflicts
4. **Security Validation**: Avoid dangerous packages and unsafe installation flags
5. **Version Specificity**: Pin versions only when necessary for compatibility
6. **Flag Usage**: Use conservative flags like `--no-install-recommends` to minimize installation footprint

### Conflict Prevention

1. **Dependency Research**: Check existing tab dependencies before choosing versions
2. **Minimal Dependencies**: Only include necessary packages (Python, NPM, and system)
3. **Version Compatibility**: Choose versions compatible with main application and other tabs
4. **Cross-Tab Testing**: Test installation alongside other premium tabs
5. **Platform Testing**: Test on target platforms before distribution

### Security Considerations

1. **Path Validation**: Never use relative paths or path traversal
2. **File Integrity**: Ensure all files listed in manifests
3. **Permission Awareness**: Understand installer permission model
4. **Sudoers Syntax**: Validate sudoers files with visudo
5. **System Package Safety**: Avoid packages that could compromise system security
6. **Flag Validation**: Use only safe and necessary package manager flags

## Troubleshooting Guide

### Installation Failures

**Validation Errors**: Check manifest completeness and JSON syntax
**Permission Errors**: Ensure installer run with sudo
**Conflict Errors**: Resolve dependency version conflicts (Python, NPM, or system packages)
**Platform Errors**: Verify system dependencies match current platform
**Path Errors**: Verify all targets within allowed directories
**System Package Errors**: Check package names and platform compatibility

### System Dependencies Issues

**Platform Mismatch**: Ensure dependencies.json platform matches target system
**Package Not Found**: Verify package names are correct for the target platform
**Permission Denied**: Ensure installer is run with sudo privileges
**Conflict Errors**: Check for conflicting packages already installed
**Installation Flags**: Verify package manager flags are safe and valid
**Version Constraints**: Check if specified versions are available on target platform

### Runtime Issues

**Tab Not Appearing**: Check config patch application and service restart
**Backend Errors**: Verify blueprint registration in `__init__.py`
**Frontend Issues**: Confirm files copied and build successful
**Permission Errors**: Check file ownership and permissions
**Site Down**: Check Gunicorn logs for potential errors
**System Service Issues**: Check if system packages installed correctly and services started

### Recovery Procedures

**Partial Installation**: System automatically rolls back on failure
**Broken Configuration**: Factory fallback restores working config
**Service Issues**: Systemd automatically restarts failed services
**System Package Cleanup**: Manual removal of system packages if needed (not automatic)
**Manual Recovery**: Use uninstall command to clean up

### Development Iteration with Reinstall

**Common Development Scenario**: You've updated tab code and need to test changes:

```bash
# 1. Sync updated files to server
rsync -av --delete ./myTab/ root@server:/var/www/homeserver/premium/myTab/

# 2. Reinstall to apply changes (single command)
sudo python3 installer.py reinstall myTab

# 3. Check installation status
sudo python3 installer.py list --installed
```

**What Happens During Reinstall**:
1. **Uninstall Phase**: Current tab installation is completely removed (no build/restart)
2. **Validation**: New files are validated against manifests
3. **Install Phase**: Fresh installation from updated source (no build/restart)
4. **Build & Restart**: **Single** frontend rebuild and service restart at the end

**Benefits for Development**:
- **Clean Slate**: Eliminates accumulated state issues
- **Fast Iteration**: Single command instead of uninstall + install
- **Error Detection**: Catches issues that might be masked by existing installation
- **Consistency**: Ensures complete replacement of all files
- **Time Savings**: Eliminates 4-6 minutes of unnecessary builds per reinstall cycle
- **Developer Experience**: Focus on coding, not waiting for builds

This guide provides everything needed to create premium tabs that integrate seamlessly with the homeserver platform. Follow the specifications exactly to ensure compatibility and reliability.

## Practical Example: Tab with System Dependencies

### Example Scenario
Creating a premium tab called "monitoring" that requires nginx for reverse proxy functionality and additional build tools.

### Directory Structure
```
monitoring/
├── index.json
├── homeserver.patch.json
├── system/
│   └── dependencies.json
├── backend/
│   ├── index.json
│   ├── requirements.txt
│   └── routes.py
├── frontend/
│   ├── index.json
│   ├── package.patch.json
│   └── index.tsx
└── permissions/
    └── premium_monitoring
```

### System Dependencies (system/dependencies.json)
```json
{
  "packages": [
    {
      "name": "nginx",
      "version": "1.18.0",
      "description": "Web server for reverse proxy functionality",
      "flags": ["--no-install-recommends"]
    },
    {
      "name": "build-essential",
      "description": "Compilation tools for native modules"
    }
  ],
  "metadata": {
    "version": "1.0.0",
    "platform": "debian",
    "conflicts": ["apache2"]
  }
}
```

### Root Manifest (index.json)
```json
{
  "name": "monitoring",
  "version": "1.0.0",
  "files": {
    "config": "/monitoring/homeserver.patch.json",
    "system": {
      "dependencies": "/monitoring/system/dependencies.json"
    },
    "backend": {
      "index": "/monitoring/backend/index.json",
      "requirements": "/monitoring/backend/requirements.txt",
      "blueprint": "/monitoring/backend/routes.py"
    },
    "frontend": {
      "index": "/monitoring/frontend/index.json",
      "package": "/monitoring/frontend/package.patch.json"
    },
    "permissions": {
      "sudoers": "/monitoring/permissions/premium_monitoring"
    }
  }
}
```

### Installation Process
```bash
# Validate the tab structure first
python3 version_checker.py check monitoring

# Install the tab (requires sudo for system packages)
sudo python3 installer.py install monitoring
```

### What Happens During Installation
1. **System Dependencies**: 
   - Platform detected as Debian
   - nginx and build-essential validated and installed via apt-get
   - Packages tracked for potential rollback
2. **Backend/Frontend**: Standard premium tab installation
3. **Configuration**: Tab registered in homeserver.json
4. **Services**: Frontend rebuilt and services restarted

### Uninstallation Behavior
```bash
sudo python3 installer.py uninstall monitoring
```

**System Package Handling**:
- Python/NPM packages: Automatically removed
- System packages (nginx, build-essential): **NOT automatically removed**
- Uninstall log shows: "System packages were installed with this tab: nginx, build-essential"
- Manual removal instructions provided if needed

This example demonstrates the complete workflow for tabs requiring system-level dependencies while maintaining security and system stability.