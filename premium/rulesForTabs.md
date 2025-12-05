# Premium Tab Rules and Validation Requirements

This document defines the complete set of rules and requirements that premium tabs must follow to be successfully installed by the homeserver premium tab installer.

## Table of Contents
1. [Directory Structure](#directory-structure)
2. [Manifest Files](#manifest-files)
3. [File Security Rules](#file-security-rules)
4. [Package Dependencies](#package-dependencies)
5. [Configuration Requirements](#configuration-requirements)
6. [Installation Process](#installation-process)
7. [Validation Checks](#validation-checks)
8. [Common Pitfalls](#common-pitfalls)

## Directory Structure

### Required Root Structure
```
tabName/
├── index.json                    # Root manifest (REQUIRED)
├── backend/                      # Backend components (optional)
│   ├── index.json               # Backend manifest (optional)
│   ├── *.py                     # Python modules
│   └── requirements.txt         # Python dependencies (optional)
├── frontend/                     # Frontend components (optional)
│   ├── index.json               # Frontend manifest (optional)
│   ├── *.tsx, *.ts, *.css       # React components
│   └── package.patch.json       # NPM dependencies (optional)
├── system/                       # System-level components (optional)
│   └── dependencies.json        # System package dependencies (optional)
├── permissions/                  # Sudo permissions (optional)
│   └── *.sudoers                # Sudoers files
└── homeserver.patch.json        # Configuration patches (optional)
```

### Critical Rules
- **NO extra files**: Directory must contain ONLY files declared in manifests
- **NO __pycache__**: Presence indicates already installed tab (will fail validation)
- **NO hidden files**: Files starting with '.' are ignored (except .git metadata)
- **Git metadata allowed**: .git directory and git dotfiles are permitted

## Manifest Files

### Root index.json (REQUIRED)
```json
{
  "name": "tabName",              // Must match folder name
  "version": "1.0.0",            // Semantic versioning (x.y.z format)
  "description": "Tab description",
  "files": {
    "backend": { ... },          // Backend file mappings (ALL backend files must be listed)
    "frontend": { ... },         // Frontend file mappings (ALL frontend files must be listed)
    "permissions": { ... },      // Sudo permissions files (ALL permission files must be listed)
    "config": "config.json"      // Root-level files (ALL root files must be listed)
  },
  "config": {                    // Optional configuration
    "repository": {
      "url": "https://github.com/user/repo",
      "branch": "main"
    },
    "git_managed": true
  }
}
```

**CRITICAL DISTINCTION:**
- **Root index.json**: Lists ALL files that exist in the directory (comprehensive manifest)
- **Component index.json**: Lists only the files you want to install from that component (selective installation instructions)

### Backend index.json (Optional)
```json
{
  "name": "tabName",             // Must match root name
  "files": [
    {
      "source": "module.py",
      "target": "/var/www/homeserver/backend/tabName/module.py",
      "type": "copy",            // copy, append, symlink
      "identifier": "tabName",
      "description": "Backend module"
    }
  ]
}
```
**Purpose**: Tells installer which files to install and HOW to install them (selective from root manifest)

### Frontend index.json (Optional)
```json
{
  "name": "tabName",             // Must match root name
  "files": [
    {
      "source": "frontend/component.tsx",
      "target": "/var/www/homeserver/src/tablets/tabName/component.tsx",
      "type": "copy"
    }
  ]
}
```
**Purpose**: Tells installer which files to install and HOW to install them (selective from root manifest)

## File Security Rules

### Allowed Target Paths
Files can only be installed to these secure locations:
- `/var/www/homeserver/backend/__init__.py`
- `/etc/sudoers.d/`
- `/var/www/homeserver/src/tablets/`
- `/var/www/homeserver/src/config/homeserver.json`
- `/var/www/homeserver/backend`
- `/usr/local/bin`
- `/usr/local/sbin`

### Prohibited File Types
- **Executable files**: `.exe`, `.bat`, `.cmd`, `.com`, `.scr`, `.pif`, `.vbs`, `.vbe`, `.js`, `.jse`, `.wsf`, `.wsh`, `.msi`, `.msp`, `.hta`, `.cpl`, `.jar`, `.app`, `.deb`, `.rpm`, `.dmg`, `.pkg`, `.run`
- **Dangerous names**: `passwd`, `shadow`, `sudoers`, `hosts`, `crontab`, `authorized_keys`, `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, `.ssh`, `.gnupg`

### File Operation Types
- **copy**: Standard file copy operation
- **append**: Append content to existing file (with marker comments)
- **symlink**: Create symbolic link

## Package Dependencies

### Python Requirements (backend/requirements.txt)
```txt
# Format: package_name[>=version]
flask>=2.0.0
requests>=2.25.0
```

### NPM Dependencies (frontend/package.patch.json)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "socket.io-client": "^4.7.4"
  },
  "devDependencies": {
    "@types/react": "^18.0.0"
  }
}
```

### System Dependencies (system/dependencies.json)
```json
{
  "metadata": {
    "platform": "debian",        // debian, ubuntu, rhel, centos, fedora, arch, any
    "version": "1.0.0"           // Optional
  },
  "packages": [
    {
      "name": "curl",            // Package name
      "version": "7.68.0",       // Optional version
      "flags": ["--no-install-recommends"], // Optional install flags
      "conflicts": ["wget"]      // Optional conflicting packages
    }
  ]
}
```

### Prohibited System Packages
These packages are blocked for security:
- `rm`, `rmdir`, `dd`, `fdisk`, `mkfs`, `format`
- `shutdown`, `reboot`, `halt`, `init`, `systemctl`
- `iptables`, `ufw`, `firewalld`, `selinux`, `apparmor`

### Allowed Package Flags
- `--no-install-recommends`, `--no-install-suggests`
- `--allow-unauthenticated`, `--allow-downgrades`
- `--assume-yes`, `-y`, `--quiet`, `-q`
- `--verbose`, `-v`, `--dry-run`, `--simulate`
- `--reinstall`, `--fix-broken`, `--fix-missing`

## Configuration Requirements

### Configuration Patches (homeserver.patch.json)
```json
{
  "tabs": {
    "tabName": {
      "enabled": true,
      "config": {
        "setting": "value"
      }
    }
  }
}
```

### Prohibited Config Keys
- `__proto__`, `constructor`, `prototype`

### Sudo Permissions (permissions/*.sudoers)
```sudoers
www-data ALL=(ALL) NOPASSWD: /usr/local/bin/tabCommand
www-data ALL=(root) NOPASSWD: /usr/bin/another-command
```

**CRITICAL: No Comments Allowed**
- Sudoers files must contain ONLY rule lines
- Comments (lines starting with `#`) are NOT allowed and will cause syntax errors
- Each line must be a valid sudoers rule
- Format: `user ALL=(target_user) NOPASSWD: command`

## Installation Process

### Phase 1: Pre-Validation
1. Validate current homeserver configuration
2. Validate package manifest structure
3. Check for name collisions with existing tabs
4. Validate version compatibility
5. Check for already installed tabs (__pycache__ detection)

### Phase 2: File Operations
1. Process backend files (with blueprint registration)
2. Process frontend files (React components)
3. Process permissions files (sudoers)
4. Process root-level configuration files

### Phase 3: Package Installation
1. Install Python requirements
2. Apply NPM patches
3. Install system dependencies

### Phase 4: Configuration
1. Apply configuration patches to homeserver.json

### Phase 5: Post-Installation
1. Rebuild frontend (unless deferred)
2. Restart homeserver services (unless deferred)

## Validation Checks

### Manifest Validation
- **Required fields**: name, version, files
- **Version format**: Must match semantic versioning (x.y.z)
- **Name consistency**: All manifests must use same name
- **File existence**: All declared files must exist
- **No extra files**: Directory must contain only declared files

### Security Validation
- **Target path security**: Files can only go to allowed locations
- **Package security**: No dangerous system packages
- **File security**: No dangerous file types or names
- **Config security**: No dangerous configuration keys

### Dependency Validation
- **Python requirements**: Valid package names and versions
- **NPM dependencies**: Valid package.json structure
- **System dependencies**: Valid platform and package specifications

## Common Pitfalls

### ❌ Common Mistakes
1. **Extra files**: Including files not declared in manifest
2. **Wrong target paths**: Using paths outside allowed directories
3. **Name mismatches**: Different names in root vs component manifests
4. **Already installed**: Trying to install tab with __pycache__ files
5. **Dangerous packages**: Using prohibited system packages
6. **Invalid versions**: Non-semantic version numbers
7. **Missing required fields**: Incomplete manifest files

### ✅ Best Practices
1. **Use manifest-driven approach**: Declare all files explicitly
2. **Follow naming conventions**: Consistent names across all manifests
3. **Test validation first**: Run `python3 installer.py validate tabName` before install
4. **Clean directory**: Ensure no __pycache__ or extra files
5. **Use allowed paths**: Stick to the approved target directories
6. **Semantic versioning**: Use proper x.y.z version format
7. **Security first**: Avoid dangerous packages and file types

## Validation Commands

```bash
# Validate single tab
python3 installer.py validate /path/to/tab

# Validate all tabs
python3 installer.py validate --all

# List available tabs
python3 installer.py list --available

# List installed tabs
python3 installer.py list --installed
```

## Error Messages Reference

### Critical Errors (Installation Blocked)
- `TAB ALREADY INSTALLED`: Found __pycache__ files
- `SECURITY VIOLATION`: Extra files not in manifest
- `Target path not allowed`: File targets restricted location
- `Invalid or dangerous package name`: Prohibited system package
- `Name mismatch`: Inconsistent names across manifests

### Warnings (Installation Continues)
- `Suspicious file extension detected`: Potentially dangerous file type
- `Unknown config fields`: Unrecognized configuration options
- `Unknown package flag`: Unrecognized package manager flag

This document serves as the definitive reference for premium tab development and validation requirements.
