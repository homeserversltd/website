# Premium Tab Utilities Package

A comprehensive suite of modular utilities for managing premium tab installation, validation, and maintenance in the homeserver ecosystem. Each module is designed with focused responsibilities, providing atomic operations with complete rollback capabilities.

## Package Overview

The `premium.utils` package contains nine specialized modules that handle every aspect of premium tab lifecycle management:

```python
from premium.utils import (
    # Core Installation & Management
    FileOperationsManager, ConfigManager, PackageManager, BatchManager,
    
    # Validation & Security
    ValidationManager, SemanticVersionChecker,
    
    # Lifecycle Management
    UninstallManager,
    
    # Service & Build Management
    ServiceManager, BuildManager,
    
    # Enhanced Logging
    PremiumJSONLogger, CategoryLogger
)
```

## Module Architecture

### 1. `__init__.py` - Package Interface
**Purpose**: Centralized package exports and version management

**Exports**:
- All utility classes with clean namespace organization
- Package version (`__version__ = '1.3.0'`)
- Organized imports by functional category

**Key Features**:
- Clean API surface for importing utilities
- Version tracking for the utilities package itself
- Logical grouping of related functionality

---

### 2. `batch_manager.py` - Batch Installation Management ⭐ NEW
**Purpose**: Intelligent batch installation with fallback strategies

**Key Classes**:
- `BatchManager`: Main batch operations controller
- `BatchInstallationState`: Comprehensive batch state tracking

**Core Capabilities**:
- **Deferred Operations**: Frontend rebuilds and service restarts are deferred until all tabs are installed
- **Intelligent Fallback**: If batch operations fail, automatically falls back to individual installation
- **Partial Success Handling**: Continues with working tabs even if some fail
- **Comprehensive State Tracking**: Tracks all aspects of batch operations for debugging and rollback
- **Performance Optimization**: Single `npm run build` instead of one per tab, single gunicorn restart

**Advanced Features**:
- **Success Rate Analysis**: Automatically determines if batch should proceed or fallback
- **Individual Reinstallation**: Can reinstall successful tabs individually when batch fails
- **Duration Tracking**: Measures and reports batch operation timing
- **Rollback Support**: Complete batch installation rollback capabilities

**Usage Example**:
```python
batch_mgr = BatchManager(logger)
success, status = batch_mgr.install_premium_tabs_batch(
    tab_paths=["/path/to/tab1", "/path/to/tab2"],
    defer_build=True,
    defer_service_restart=True
)

if success:
    print(f"Batch installation successful: {status['successful_tabs']}")
else:
    print(f"Batch failed, fallback results: {status['individual_successes']}")
```

**Fallback Strategy**:
1. **Batch First**: Attempts efficient batch installation first
2. **Failure Detection**: Monitors success rate and deferred operation failures
3. **Automatic Fallback**: If batch fails, automatically switches to individual installation
4. **Partial Success**: Continues with working tabs even if some fail
5. **No Complete Failure**: System always attempts to preserve working installations

---

### 3. `file_operations.py` - File System Operations Manager
**Purpose**: Atomic file operations with comprehensive backup and rollback capabilities

**Key Classes**:
- `FileOperationsManager`: Main file operations controller
- `FileOperation`: Dataclass representing individual file operations

**Core Capabilities**:
- **Symlink Management**: Create and manage symbolic links with proper permissions
- **File Copying**: Copy files with permission handling and backup creation
- **Content Appending**: Intelligent content injection with marker-based identification
- **Directory Management**: Create directory structures with proper ownership
- **Backup & Rollback**: Complete operation history with atomic rollback
- **Permission Handling**: Automatic www-data ownership and permission setting

**Special Features**:
- **Marker-Based Appending**: Uses configurable markers for safe content injection
- **Indentation-Aware**: Preserves code formatting when appending content
- **Security Validation**: Validates sudoers files and enforces permission policies
- **Cleanup Operations**: Removes empty directories and cleans up installation artifacts

**Usage Example**:
```python
file_ops = FileOperationsManager(logger)
operation = FileOperation(
    source="src/component.js",
    target="/var/www/homeserver/src/tablets/mytab/component.js",
    operation_type="symlink"
)
success = file_ops.perform_symlink_operation(operation, "/path/to/tab")
```

---

### 4. `config_manager.py` - Configuration & Service Management
**Purpose**: Atomic configuration operations with validation and service coordination

**Key Classes**:
- `ConfigManager`: Configuration file operations and validation
- `ServiceManager`: System service lifecycle management  
- `BuildManager`: Frontend build operations

**ConfigManager Features**:
- **Deep Merge Operations**: Intelligent merging of configuration patches
- **Factory Fallback Validation**: Integration with homeserver validation scripts
- **Permission Management**: Automatic restoration of www-data ownership
- **Atomic Operations**: Backup/restore with validation at each step
- **Configuration Reversion**: Complete rollback of configuration changes

**ServiceManager Features**:
- **Service Lifecycle**: Start, stop, restart, reload operations
- **State Tracking**: Maintains service states for rollback operations
- **Health Validation**: Verifies service status after operations
- **Batch Operations**: Coordinate multiple service operations

**BuildManager Features**:
- **Frontend Builds**: NPM build process management
- **Dependency Installation**: NPM package installation coordination
- **Build Artifact Management**: Clean and rebuild operations

**Critical Security Feature**:
```python
# CRITICAL: Premium installer runs as root but must restore www-data ownership
# to prevent permission denied errors on config update endpoints
def _restore_config_permissions(self, config_path: Optional[str] = None) -> bool:
    # Set ownership to www-data:www-data and permissions to 664
```

---

### 5. `package_manager.py` - Package Dependency Management
**Purpose**: Python and NPM package management with conflict detection and rollback

**Key Classes**:
- `PackageManager`: Main package operations controller
- `PackageInstallationState`: Tracks installations for rollback

**Core Capabilities**:
- **Python Requirements**: Install/uninstall packages from requirements.txt
- **NPM Patch Management**: Apply and revert package.json patches
- **Conflict Detection**: Identify version conflicts before installation
- **Environment Validation**: Verify Python venv and NPM environments
- **Rollback Support**: Complete package installation rollback

**Advanced Features**:
- **Version Conflict Analysis**: Pre-installation conflict detection
- **Package Tracking**: Maintains installation history for cleanup
- **Environment Isolation**: Works within Python virtual environments
- **Batch Operations**: Handle multiple package operations atomically

**Usage Example**:
```python
pkg_mgr = PackageManager(logger, "/var/www/homeserver/venv", "/var/www/homeserver/package.json")
conflicts = pkg_mgr.check_all_conflicts("requirements.txt", "package.patch.json")
if not conflicts:
    success = pkg_mgr.install_python_requirements("requirements.txt")
```

---

### 6. `validation.py` - Security & Manifest Validation
**Purpose**: Comprehensive validation engine for security and manifest integrity

**Key Classes**:
- `ValidationManager`: Main validation controller

**Security Features**:
- **Path Security**: Validates target paths against allowed directories
- **File Security**: Scans for suspicious file extensions and dangerous names
- **Manifest Completeness**: Ensures no undeclared files exist (critical security check)
- **Already Installed Detection**: Identifies tabs with `__pycache__` files

**Validation Capabilities**:
- **JSON Schema Validation**: Validates manifest structure and required fields
- **Version Consistency**: Ensures consistent versions across all index.json files
- **Name Collision Detection**: Prevents conflicts with existing tabs
- **Configuration Validation**: Integration with factory fallback validation

**Critical Security Check**:
```python
def validate_complete_file_manifest(self, tab_path: str, manifest_files: List[str]) -> bool:
    """SECURITY: Validate that directory contains ONLY files listed in manifest.
    
    This prevents undeclared files that could bypass validation and pose security risks.
    Special handling for __pycache__ files which indicate an already installed tab.
    """
```

---

### 7. `uninstall_manager.py` - Complete Uninstallation Management
**Purpose**: Comprehensive premium tab removal with complete cleanup

**Key Classes**:
- `UninstallManager`: Orchestrates complete tab removal

**Core Capabilities**:
- **Discovery-Based Uninstall**: Find installed tabs by scanning for premium tab identifiers
- **Manifest-Based Uninstall**: More thorough removal using original manifest files
- **Batch Uninstall**: Remove all premium tabs simultaneously
- **Dry Run Support**: Preview removal operations without executing
- **Development Artifact Cleanup**: Remove `__pycache__`, `.pyc`, and `node_modules`

**Uninstallation Process**:
1. Pre-validation of current configuration
2. Remove appended content using identifiers
3. Remove copied files and symlinks
4. Remove permissions files
5. Remove tab directories and clean empty directories
6. Clean development artifacts from source
7. Revert package installations (Python & NPM)
8. Revert configuration patches
9. Rebuild frontend and restart services
10. Post-validation

**Safety Features**:
- **CRITICAL**: Only discovers tabs with premium tab identifiers to prevent removing core system tabs
- **Comprehensive Cleanup**: Removes all traces including development artifacts
- **Validation Gates**: Pre and post-validation ensure system integrity

---

### 8. `version_checker.py` - Standalone Semantic Version Utility ⭐
**Purpose**: Comprehensive semantic version validation and conflict detection utility

> **Special Note**: This module is designed as a **standalone utility** that developers can use independently of the premium tab system. It provides a complete CLI interface and can be used for any semantic versioning needs.

**Key Classes**:
- `SemanticVersionChecker`: Main version validation engine
- `SemanticVersion`: Version representation with comparison operators
- `PackageRequirement`: Package requirement parsing and validation
- `VersionConflict`: Conflict representation with resolution suggestions

**Standalone Features**:
- **CLI Interface**: Complete command-line tool for version operations
- **Independent Operation**: Can be used outside the homeserver ecosystem
- **Comprehensive Reporting**: Detailed conflict reports with resolution suggestions
- **Multi-Package Support**: Handles both Python (pip) and NPM package managers

**Core Capabilities**:
- **Semantic Version Parsing**: Strict and lenient parsing modes
- **Version Comparison**: Full comparison operators with prerelease handling
- **Conflict Detection**: Cross-package and cross-tab conflict analysis
- **Batch Validation**: Validate entire directories of premium tabs
- **Environment Integration**: Compare against currently installed packages

**CLI Usage Examples**:
```bash
# Standalone version validation
python3 version_checker.py validate "1.2.3-alpha"

# Compare two versions
python3 version_checker.py compare "1.0.0" "1.0.1"

# Check single premium tab
python3 version_checker.py check /path/to/premium/tab --report

# Comprehensive validation of all tabs
python3 version_checker.py batch /path/to/premium/directory --report

# Validate manifest completeness
python3 version_checker.py manifest /path/to/premium/tab

# Check version consistency across index.json files
python3 version_checker.py index /path/to/premium/tab
```

**Advanced Features**:
- **Cross-Tab Conflict Detection**: Identifies conflicts between premium tabs
- **Environment Conflict Analysis**: Compares against current pip/npm packages
- **Comprehensive Reporting**: Detailed reports with resolution suggestions
- **Manifest Validation**: Ensures no extra files exist (security feature)
- **Version Consistency**: Validates consistent versions across all index.json files

---

### 9. `test_version_checker.py` - Version Checker Test Suite
**Purpose**: Comprehensive test suite demonstrating version checker functionality

**Test Coverage**:
- **Semantic Version Parsing**: Tests various version formats and edge cases
- **Version Comparison**: Validates all comparison operators
- **Package Requirement Parsing**: Tests pip and npm requirement formats
- **Conflict Detection**: Demonstrates conflict detection with mock data

**Usage**:
```bash
python3 test_version_checker.py
```

**Features**:
- **Demonstration Tool**: Shows how to use the version checker programmatically
- **Validation Suite**: Ensures version checker functionality works correctly
- **Example Code**: Provides usage examples for developers

---

### 10. `logger.py` - Enhanced JSON Category Logging ⭐ NEW
**Purpose**: Structured logging system with category-based organization

**Key Classes**:
- `PremiumJSONLogger`: JSON-based logging with category organization
- `CategoryLogger`: Automatic categorization and dual logging (console + JSON)

**Core Features**:
- **Category-Based Organization**: Organizes logs by operation type (install, uninstall, validate, etc.)
- **Dual Output**: Logs to both console and structured JSON files
- **Timestamp Preservation**: Maintains chronological order across operations
- **Thread Safety**: Safe concurrent logging with proper locking
- **Automatic Cleanup**: Clears category logs when starting new operations

**Usage Example**:
```python
from premium.utils import create_category_logger

# Create category logger for specific operation
install_logger = create_category_logger("install", console_logger)

# All logs automatically categorized and stored
install_logger.info("Starting installation")
install_logger.error("Installation failed")
install_logger.warning("Partial success")

# JSON logs stored at /var/log/homeserver/premium_installer.log
```

---

## Integration Architecture

### Installer Integration
The main installer (`installer.py`) now orchestrates these utilities with full integration:

```python
# Initialize all managers
file_ops = FileOperationsManager(logger)
config_mgr = ConfigManager(logger)
pkg_mgr = PackageManager(logger, venv_path, package_json_path)
validator = ValidationManager(logger)
version_checker = SemanticVersionChecker(logger)
uninstall_mgr = UninstallManager(logger)
batch_mgr = BatchManager(logger, venv_path, package_json_path, homeserver_config_path)

# Coordinated installation process
if validator.validate_package_manifest(tab_path):
    if version_checker.validate_premium_tab_dependencies(tab_path):
        # Proceed with installation using all managers
        success = batch_mgr.install_premium_tabs_batch(tab_paths, defer_build=True)
```

### Enhanced Batch Processing
The new `BatchManager` provides intelligent batch operations:

```python
# Batch installation with automatic fallback
success, status = batch_mgr.install_premium_tabs_batch(
    tab_paths=["/path/to/tab1", "/path/to/tab2"],
    defer_build=True,
    defer_service_restart=True
)

if not success and status.get('fallback_attempted'):
    print(f"Batch failed, but {len(status['individual_successes'])} tabs installed individually")
```

### Error Handling & Rollback
All modules follow consistent patterns:
- **Atomic Operations**: Each operation can be rolled back independently
- **State Tracking**: Maintain operation history for rollback
- **Validation Gates**: Pre and post-operation validation
- **Comprehensive Logging**: Detailed logging at all levels with category organization

### Security Architecture
- **Path Validation**: All target paths validated against allowed directories
- **File Security**: Comprehensive scanning for suspicious content
- **Manifest Integrity**: Ensures only declared files are present
- **Permission Management**: Automatic restoration of proper ownership

## Usage Patterns

### Basic Installation Flow
```python
# 1. Validation Phase
validator = ValidationManager(logger)
valid, manifests = validator.validate_package_manifest(tab_path)

# 2. Version Checking
version_checker = SemanticVersionChecker(logger)
valid, conflicts = version_checker.validate_premium_tab_dependencies(tab_path)

# 3. Installation Phase
file_ops = FileOperationsManager(logger)
pkg_mgr = PackageManager(logger, venv_path, package_json_path)
config_mgr = ConfigManager(logger)

# 4. Service Management
service_mgr = ServiceManager(logger)
build_mgr = BuildManager(logger)
```

### Enhanced Batch Installation Flow
```python
# Use the new BatchManager for efficient batch operations
batch_mgr = BatchManager(logger, venv_path, package_json_path, homeserver_config_path)

# Batch installation with deferred operations
success, status = batch_mgr.install_premium_tabs_batch(
    tab_paths=["/path/to/tab1", "/path/to/tab2", "/path/to/tab3"],
    defer_build=True,
    defer_service_restart=True
)

if success:
    print(f"Batch installation successful: {status['successful_tabs']}")
else:
    # Check if fallback was used
    if status.get('fallback_attempted'):
        print(f"Batch failed, but {len(status['individual_successes'])} tabs installed individually")
        print(f"Individual successes: {status['individual_successes']}")
```

### Uninstallation Flow
```python
uninstall_mgr = UninstallManager(logger)

# Discovery-based uninstall
installed_tabs = uninstall_mgr.discover_installed_tabs()
for tab in installed_tabs:
    uninstall_mgr.uninstall_premium_tab(tab)

# Or batch uninstall
uninstall_mgr.uninstall_all_premium_tabs()
```

### Standalone Version Checking
```python
# Use version checker independently
checker = SemanticVersionChecker()
version = checker.parse_semantic_version("1.2.3-alpha")
conflicts = checker.detect_conflicts(requirements_list)
report = checker.generate_conflict_report(conflicts)
```

## Testing & Validation

### Unit Testing
Each module includes comprehensive test coverage:
```bash
python -m pytest utils/test_*.py
```

### Integration Testing
Full deployment testing pipeline:
```bash
cd /home/anon/git/serverGenesis/initialization/flask/inject
sudo rsync -av --delete ./ /mnt/temp/
sshpass -p '2312' ssh anon@192.168.123.1 'cd /var/www/homeserver && npm run build && systemctl restart gunicorn.service'
```

### Validation Commands
```bash
# Validate all premium tabs
sudo python3 installer.py validate --all /path/to/premium/directory

# Install with validation
sudo python3 installer.py install /path/to/premium/tab

# Batch installation
sudo python3 installer.py batch /path/to/tab1 /path/to/tab2 --no-defer-build

# Uninstall with cleanup
sudo python3 installer.py uninstall tab_name
```

## Development Guidelines

### Adding New Functionality
1. **Follow Module Boundaries**: Keep functionality in appropriate modules
2. **Maintain Consistency**: Follow existing error handling and logging patterns
3. **Add Tests**: Include comprehensive test coverage
4. **Update Documentation**: Keep README and docstrings current
5. **Consider Rollback**: Ensure new operations support rollback

### Error Handling Standards
- **Logging**: All operations logged with appropriate levels and categories
- **Exceptions**: Critical errors raise exceptions with descriptive messages
- **Return Values**: Boolean returns for success/failure with detailed logging
- **Rollback**: All modules support rollback of their operations

### Security Considerations
- **Path Validation**: Always validate target paths
- **Permission Management**: Restore proper ownership after operations
- **Manifest Integrity**: Ensure only declared files are present
- **Input Validation**: Validate all user inputs and file contents

## Future Enhancements

### Planned Features
- **Progress Reporting**: Real-time progress updates for long operations
- **Parallel Operations**: Concurrent processing where safe
- **Configuration Templates**: Template-based configuration generation
- **Plugin System**: Extensible validation and operation plugins

### Extension Points
- **Custom Validators**: Plugin system for custom validation rules
- **Custom Operations**: Support for custom file operation types
- **Service Plugins**: Extensible service management
- **Package Sources**: Support for additional package repositories

---

## Package Version: 1.3.0

This utilities package provides the foundation for safe, atomic, and reversible premium tab management with comprehensive validation and security features. The modular design ensures each component can be used independently while providing powerful orchestration capabilities when used together.

## System Dependencies Management

### Overview
The package manager now supports system-level dependencies through `dependencies.json` files. This enables premium tabs to declare required system packages alongside their Python and NPM dependencies.

### Dependencies File Format
```json
{
    "packages": [
        {
            "name": "nginx",
            "version": "1.18.0",
            "description": "Reverse proxy server",
            "flags": ["--no-install-recommends"],
            "conflicts": ["apache2"]
        },
        {
            "name": "python3-dev",
            "description": "Required for compiling Python extensions"
        }
    ],
    "metadata": {
        "version": "1.0.0",
        "platform": "debian",
        "conflicts": ["apache2", "lighttpd"]
    }
}
```

### Supported Fields

#### Package Objects
- `name` (required): Package name
- `version` (optional): Specific version requirement
- `description` (optional): Human-readable description
- `flags` (optional): Package manager flags (e.g., `--no-install-recommends`)
- `conflicts` (optional): List of conflicting packages

#### Metadata
- `version` (required): Dependencies schema version
- `platform` (required): Target platform (`debian`, `ubuntu`, `rhel`, `centos`, `fedora`, `arch`, `any`)
- `conflicts` (optional): Global package conflicts

### Platform Support
- **Debian/Ubuntu**: `apt-get` package manager
- **RHEL/CentOS/Fedora**: `dnf` package manager  
- **Arch Linux**: `pacman` package manager

### Security Features
- Package name validation to prevent dangerous packages
- Flag validation to block unsafe installation options
- Platform compatibility checking
- Conflict detection with existing packages

### Installation Workflow
1. **Validation**: Schema and security validation of dependencies.json
2. **Platform Check**: Verify compatibility with current system
3. **Conflict Detection**: Check for package conflicts
4. **Installation**: Install packages with appropriate flags and fallback mechanism
5. **State Tracking**: Record installation state for rollback

### Version Pinning with Fallback ⭐
The package manager now includes intelligent fallback handling for pinned versions:

**Behavior**:
- **Primary Attempt**: Try to install the exact pinned version (e.g., `cowsay=3.03+dfsg2-8`)
- **Fallback Mechanism**: If the pinned version is unavailable in the repository, automatically fall back to the latest available version
- **Logging**: Clear indication of fallback behavior with version information

**Example Workflow**:
```json
{
    "packages": [
        {
            "name": "cowsay",
            "version": "3.03+dfsg2-8",
            "description": "A configurable talking cow"
        }
    ]
}
```

**Installation Process**:
1. **Attempt Pinned**: `apt-get install cowsay=3.03+dfsg2-8`
2. **If Failed**: Log warning about unavailable pinned version
3. **Fallback**: `apt-get install cowsay` (latest available)
4. **Success Logging**: Report actually installed version

**Log Output Example**:
```
[INFO] Attempting to install cowsay with pinned version 3.03+dfsg2-8
[WARN] ⚠️  Failed to install cowsay=3.03+dfsg2-8: Package not found
[INFO] 🔄 Falling back to unpinned version for cowsay
[INFO] ✅ Successfully installed cowsay (fallback version: 3.03+dfsg2-9)
```

**Benefits**:
- **Resilient Installation**: Handles repository changes and package availability
- **Version Preference**: Still attempts preferred versions when available
- **Clear Feedback**: Transparent logging of fallback behavior
- **Debian/Ubuntu Focus**: Optimized for apt-based systems (primary target platform)

### Uninstallation Behavior
System packages are **NOT automatically removed** during premium tab uninstallation for safety reasons. The uninstaller will:
1. Log all system packages that were installed
2. Warn about manual removal requirements
3. Provide package list for manual review

This conservative approach prevents accidental removal of packages that may be required by other system components.

## Usage Examples

### Basic Installation
```python
from premium.utils import PackageManager, ValidationManager

# Initialize managers
package_manager = PackageManager(logger)
validation_manager = ValidationManager(logger)

# Validate system dependencies
valid, deps_data = validation_manager.validate_system_dependencies("dependencies.json")
if valid:
    # Install system dependencies
    package_manager.install_system_dependencies("dependencies.json")
```

### Platform Detection
```python
platform = package_manager._detect_system_platform()
# Returns: "debian", "ubuntu", "rhel", "arch", etc.
```

### Conflict Checking
```python
conflicts = package_manager.check_all_conflicts(
    "requirements.txt", 
    "package.patch.json",
    "dependencies.json"  # New system dependencies parameter
)
```

## Error Handling

All utilities implement comprehensive error handling:
- **Atomic Operations**: All-or-nothing installations with automatic rollback
- **State Tracking**: Complete installation state for recovery
- **Validation**: Pre-flight checks before any system changes
- **Logging**: Detailed logging of all operations and errors

## Security Considerations

- **Path Validation**: All file operations validate target paths
- **Package Validation**: System package names and flags are validated
- **Platform Checking**: Prevents incompatible package installations
- **Conflict Detection**: Identifies potential package conflicts
- **Conservative Uninstall**: System packages are not auto-removed

## Dependencies

- Python 3.8+
- Standard library modules: `json`, `subprocess`, `shutil`, `platform`
- System package managers: `apt-get`, `dnf`, or `pacman`

## Version History

- **1.3.0**: Added BatchManager for intelligent batch processing with fallback strategies
- **1.2.1**: Added version pinning fallback mechanism for system dependencies
- **1.2.0**: Added system dependencies management
- **1.1.0**: Enhanced validation and rollback capabilities  
- **1.0.0**: Initial release with core functionality 