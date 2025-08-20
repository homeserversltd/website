# Premium Tab Management Backend API Specification

## Overview

Simple backend API for managing premium tabs through a modal interface. Maps directly to existing `installer.py` commands.

**Core Features:**
1. **Repository Validation & Cloning** - Single route: validate git repo structure, clone if valid
2. **Individual Tab Management** - Install/uninstall single tabs
3. **Status Display** - Show all tabs with conflict status and installation state
4. **Batch Operations** - Install all (if no conflicts) / Uninstall all (if tabs installed)

---

## API Endpoints

### 1. Repository Management

#### `POST /api/admin/premium/validate-and-clone`
**Purpose**: Validate git repository structure and clone if valid (single operation)

**Request Body**:
```json
{
  "gitUrl": "https://github.com/user/premium-tab.git",
  "branch": "main"
}
```

**Response**:
```json
{
  "success": true,
  "tabName": "example-tab",
  "cloned": true,
  "error": null
}
```

**Implementation**:
```python
def validate_and_clone_repo(git_url, branch="main"):
    # 1. Clone to temporary directory for validation
    temp_dir = f"/tmp/premium_validation_{uuid.uuid4()}"
    clone_cmd = f"git clone --depth 1 --branch {branch} {git_url} {temp_dir}"
    result = subprocess.run(clone_cmd, shell=True, capture_output=True, text=True)
    
    if result.returncode != 0:
        return {"success": False, "error": "Failed to clone repository"}
    
    # 2. Check required files exist
    required_files = [
        f"{temp_dir}/index.json",
        f"{temp_dir}/backend/index.json", 
        f"{temp_dir}/frontend/index.json",
        f"{temp_dir}/homeserver.patch.json"
    ]
    
    if not all(os.path.exists(f) for f in required_files):
        shutil.rmtree(temp_dir)
        return {"success": False, "error": "Invalid premium tab structure - missing required files"}
    
    # 3. Parse root manifest
    try:
        with open(f"{temp_dir}/index.json") as f:
            manifest = json.load(f)
        tab_name = manifest["name"]
    except (json.JSONDecodeError, KeyError) as e:
        shutil.rmtree(temp_dir)
        return {"success": False, "error": f"Invalid root manifest: {str(e)}"}
    
    # 4. Validate manifest completeness - every file must be declared
    try:
        # Get all files in the package (excluding .git directory)
        all_files = []
        for root, dirs, files in os.walk(temp_dir):
            # Skip .git directory
            if '.git' in dirs:
                dirs.remove('.git')
            
            for file in files:
                file_path = os.path.relpath(os.path.join(root, file), temp_dir)
                all_files.append(file_path)
        
        # Extract all declared files from manifest
        declared_files = set()
        
        # Add root level files
        if "files" in manifest:
            for key, file_path in manifest["files"].items():
                if isinstance(file_path, str):
                    # Remove leading slash and convert to relative path
                    rel_path = file_path.lstrip('/').replace(f'{tab_name}/', '')
                    declared_files.add(rel_path)
                elif isinstance(file_path, dict):
                    # Handle nested file declarations (like backend/frontend)
                    for nested_key, nested_path in file_path.items():
                        rel_path = nested_path.lstrip('/').replace(f'{tab_name}/', '')
                        declared_files.add(rel_path)
        
        # Check for undeclared files
        undeclared_files = []
        for file_path in all_files:
            if file_path not in declared_files:
                undeclared_files.append(file_path)
        
        if undeclared_files:
            shutil.rmtree(temp_dir)
            return {
                "success": False, 
                "error": f"Undeclared files found in package: {', '.join(undeclared_files[:5])}{'...' if len(undeclared_files) > 5 else ''}"
            }
        
        # Check for missing declared files
        missing_files = []
        for declared_file in declared_files:
            if declared_file not in all_files:
                missing_files.append(declared_file)
        
        if missing_files:
            shutil.rmtree(temp_dir)
            return {
                "success": False,
                "error": f"Declared files missing from package: {', '.join(missing_files)}"
            }
            
    except Exception as e:
        shutil.rmtree(temp_dir)
        return {"success": False, "error": f"Manifest validation failed: {str(e)}"}
    
    # 5. Check if tab already exists
    target_path = f"/var/www/homeserver/premium/{tab_name}"
    if os.path.exists(target_path):
        shutil.rmtree(temp_dir)
        return {"success": False, "error": "Tab already exists"}
    
    # 6. Move to premium directory and set permissions
    shutil.move(temp_dir, target_path)
    subprocess.run(f"chown -R www-data:www-data {target_path}", shell=True)
    
    return {"success": True, "tabName": tab_name, "cloned": True}
```

### 2. Individual Tab Management

#### `POST /api/admin/premium/install/{tabName}`
**Purpose**: Install single premium tab

**Response**:
```json
{
  "success": true,
  "tabName": "test-tab",
  "message": "Installation started. Please refresh browser in 2-3 minutes.",
  "error": null
}
```

**Implementation**:
```python
def install_tab(tab_name):
    # Direct call to installer.py (runs in background)
    install_cmd = f"/usr/bin/sudo /usr/bin/python3 /var/www/homeserver/premium/installer.py install {tab_name}"
    result = subprocess.run(install_cmd, shell=True, capture_output=True, text=True)
    
    if result.returncode == 0:
        return {
            "success": True,
            "tabName": tab_name,
            "message": "Installation completed successfully."
        }
    else:
        return {
            "success": False,
            "tabName": tab_name,
            "error": result.stderr
        }
```

#### `POST /api/admin/premium/reinstall/{tabName}`
**Purpose**: Reinstall single premium tab (development iteration)

**Response**:
```json
{
  "success": true,
  "tabName": "test-tab",
  "message": "Reinstallation completed successfully for test-tab.",
  "error": null
}
```

**Implementation**:
```python
def reinstall_tab(tab_name):
    # Direct call to installer.py reinstall command
    reinstall_cmd = f"/usr/bin/sudo /usr/bin/python3 /var/www/homeserver/premium/installer.py reinstall {tab_name}"
    result = subprocess.run(reinstall_cmd, shell=True, capture_output=True, text=True)
    
    if result.returncode == 0:
        return {
            "success": True,
            "tabName": tab_name,
            "message": f"Reinstallation completed successfully for {tab_name}."
        }
    else:
        return {
            "success": False,
            "tabName": tab_name,
            "error": result.stderr
        }
```

#### `POST /api/admin/premium/reinstall-multiple`
**Purpose**: Reinstall multiple premium tabs with optional deferred operations

**Request Body**:
```json
{
  "tabNames": ["tab1", "tab2", "tab3"],
  "deferBuild": true,
  "deferServiceRestart": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Reinstallation of 3 tabs completed successfully.",
  "reinstalledTabs": ["tab1", "tab2", "tab3"],
  "error": null
}
```

#### `DELETE /api/admin/premium/uninstall/{tabName}`
**Purpose**: Uninstall single premium tab

**Response**:
```json
{
  "success": true,
  "tabName": "test-tab",
  "message": "Uninstallation started. Please refresh browser in 2-3 minutes.",
  "error": null
}
```

**Implementation**:
```python
def uninstall_tab(tab_name):
    # Direct call to installer.py (runs in background)
    uninstall_cmd = f"/usr/bin/sudo /usr/bin/python3 /var/www/homeserver/premium/installer.py uninstall {tab_name}"
    result = subprocess.run(uninstall_cmd, shell=True, capture_output=True, text=True)
    
    if result.returncode == 0:
        return {
            "success": True,
            "tabName": tab_name,
            "message": "Uninstallation completed successfully."
        }
    else:
        return {
            "success": False,
            "tabName": tab_name,
            "error": result.stderr
        }
```

### 3. Status Display

#### `GET /api/admin/premium/status`
**Purpose**: Get all tabs with installation status and conflict information

**Response**:
```json
{
  "tabs": [
    {
      "name": "test-tab",
      "installed": true,
      "hasConflicts": false,
      "conflictsWithCore": false
    }
  ],
  "summary": {
    "totalTabs": 2,
    "installedTabs": 1,
    "availableTabs": 1,
    "hasAnyConflicts": false,
    "canInstallAll": true,
    "canUninstallAll": true
  }
}
```

**Implementation**:
```python
def get_status():
    # 1. Get all tabs using installer.py list --all
    list_cmd = "/usr/bin/sudo /usr/bin/python3 /var/www/homeserver/premium/installer.py list --all"
    list_result = subprocess.run(list_cmd, shell=True, capture_output=True, text=True)
    
    # Parse output to get tab statuses
    tabs = parse_tab_list(list_result.stdout)
    
    # 2. Check for cross-tab conflicts using validate --all
    validate_cmd = "/usr/bin/sudo /usr/bin/python3 /var/www/homeserver/premium/installer.py validate --all"
    validate_result = subprocess.run(validate_cmd, shell=True, capture_output=True, text=True)
    has_conflicts = validate_result.returncode != 0
    
    # 3. For each tab, check individual conflicts
    for tab in tabs:
        if not tab["installed"]:
            # Check individual tab conflicts
            check_cmd = f"/usr/bin/sudo /usr/bin/python3 /var/www/homeserver/premium/installer.py validate {tab['name']}"
            check_result = subprocess.run(check_cmd, shell=True, capture_output=True, text=True)
            tab["conflictsWithCore"] = check_result.returncode != 0
            tab["hasConflicts"] = has_conflicts or tab["conflictsWithCore"]
    
    # 4. Generate summary
    installed_count = sum(1 for tab in tabs if tab["installed"])
    available_count = len(tabs) - installed_count
    
    summary = {
        "totalTabs": len(tabs),
        "installedTabs": installed_count,
        "availableTabs": available_count,
        "hasAnyConflicts": has_conflicts,
        "canInstallAll": not has_conflicts and available_count > 0,
        "canUninstallAll": installed_count > 0
    }
    
    return {"tabs": tabs, "summary": summary}

def parse_tab_list(stdout):
    """Parse installer.py list --all output."""
    tabs = []
    lines = stdout.split('\n')
    for line in lines:
        if ': ' in line:
            name, status = line.strip().split(': ')
            tabs.append({
                "name": name,
                "installed": status == "INSTALLED",
                "hasConflicts": False,
                "conflictsWithCore": False
            })
    return tabs
```

### 4. Batch Operations

#### `POST /api/admin/premium/install-all`
**Purpose**: Install all available tabs (only if no conflicts detected)

**Response**:
```json
{
  "success": true,
  "installed": ["tab-a", "tab-b"],
  "duration": 65.4,
  "error": null
}
```

**Implementation**:
```python
def install_all():
    # Use installer.py install --all
    install_cmd = "/usr/bin/sudo /usr/bin/python3 /var/www/homeserver/premium/installer.py install --all"
    result = subprocess.run(install_cmd, shell=True, capture_output=True, text=True)
    
    return {
        "success": result.returncode == 0,
        "error": result.stderr if result.returncode != 0 else None
    }
```

#### `POST /api/admin/premium/uninstall-all`
**Purpose**: Uninstall all installed tabs

**Response**:
```json
{
  "success": true,
  "uninstalled": ["tab-a", "tab-b"],
  "duration": 25.1,
  "error": null
}
```

**Implementation**:
```python
def uninstall_all():
    # Use installer.py uninstall --all
    uninstall_cmd = "/usr/bin/sudo /usr/bin/python3 /var/www/homeserver/premium/installer.py uninstall --all"
    result = subprocess.run(uninstall_cmd, shell=True, capture_output=True, text=True)
    
    return {
        "success": result.returncode == 0,
        "error": result.stderr if result.returncode != 0 else None
    }
```

### 5. Logs and Diagnostics

#### `GET /api/admin/premium/logs`
**Purpose**: Get the last installer operation logs

**Response**:
```json
{
  "success": true,
  "logs": [
    "[2024-02-08 18:46:36] [INFO] Starting installation of premium tab: test",
    "[2024-02-08 18:46:37] [INFO] Pre-validation completed successfully",
    "[2024-02-08 18:46:38] [INFO] Processing backend component",
    "[2024-02-08 18:46:45] [INFO] Processing frontend component",
    "[2024-02-08 18:46:52] [INFO] Premium tab 'test' installed successfully"
  ],
  "lastOperation": "install",
  "timestamp": "2024-02-08T18:46:52Z",
  "error": null
}
```

**Implementation**:
```python
def get_installer_logs():
    # Read the installer log file (clobbers per run)
    log_file = "/var/log/homeserver/premium_installer.log"
    
    try:
        if not os.path.exists(log_file):
            return {
                "success": True,
                "logs": [],
                "lastOperation": "none",
                "timestamp": None,
                "message": "No installer logs found"
            }
        
        # Read all log lines
        with open(log_file, 'r') as f:
            log_lines = [line.strip() for line in f.readlines() if line.strip()]
        
        # Determine last operation type from logs
        last_operation = "unknown"
        for line in reversed(log_lines):
            if "install" in line.lower():
                last_operation = "install"
                break
            elif "uninstall" in line.lower():
                last_operation = "uninstall"
                break
            elif "validate" in line.lower():
                last_operation = "validate"
                break
        
        # Get file modification time as timestamp
        file_stat = os.stat(log_file)
        timestamp = datetime.fromtimestamp(file_stat.st_mtime).isoformat() + "Z"
        
        return {
            "success": True,
            "logs": log_lines,
            "lastOperation": last_operation,
            "timestamp": timestamp
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to read logs: {str(e)}"
        }
```

### 6. Auto-Update Management

#### `GET /api/admin/premium/auto-update-status`
**Purpose**: Get auto-update eligibility and status for all premium tabs

**Response**:
```json
{
  "success": true,
  "tabs": [
    {
      "tabName": "test-tab",
      "hasGitDirectory": true,
      "hasGitMetadata": true,
      "autoUpdateEnabled": true,
      "autoUpdateEligible": true,
      "gitRepository": "https://github.com/user/test-tab.git",
      "gitBranch": "main",
      "error": null
    },
    {
      "tabName": "manual-tab",
      "hasGitDirectory": false,
      "hasGitMetadata": false,
      "autoUpdateEnabled": false,
      "autoUpdateEligible": false,
      "gitRepository": null,
      "gitBranch": null,
      "error": null
    }
  ],
  "summary": {
    "totalTabs": 2,
    "gitManagedTabs": 1,
    "autoUpdateEligible": 1,
    "autoUpdateEnabled": 1
  }
}
```

**Eligibility Logic**:
- `autoUpdateEligible` = `hasGitDirectory` AND `hasGitMetadata`
- Only eligible tabs can have auto-update enabled
- Frontend should disable checkbox for non-eligible tabs

#### `GET /api/admin/premium/auto-update/{tabName}`
**Purpose**: Get current auto-update setting and git metadata for a tab

**Response**:
```json
{
  "success": true,
  "tabName": "test-tab",
  "autoUpdateEnabled": true,
  "gitRepository": "https://github.com/user/test-tab.git",
  "gitBranch": "main",
  "hasGitMetadata": true
}
```

#### `POST /api/admin/premium/auto-update/{tabName}`
**Purpose**: Toggle auto-update setting for a premium tab

**Request Body**:
```json
{
  "enabled": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Auto-update setting updated for 'test-tab': enabled",
  "enabled": true
}
```

**Implementation Notes**:
- Uses sudo to modify protected dependencies.json files
- Automatically adds git metadata when cloning repositories
- Only tabs with git metadata can have auto-update enabled
- Setting is stored in `metadata.auto_update_enabled` field

---

## Implementation Architecture

### Backend Structure
```
backend/admin/premium/
├── __init__.py              # Blueprint registration
├── routes.py                # Main API routes (5 routes total)
├── git_manager.py           # Git clone and validation
├── installer_interface.py   # Subprocess wrapper for installer.py
└── utils.py                 # Output parsing utilities
```

### Route Summary

| Route | Method | Purpose | Installer Command |
|-------|--------|---------|-------------------|
| `/validate-and-clone` | POST | Validate & clone repo | Git operations only |
| `/install/{tabName}` | POST | Install single tab | `installer.py install {tab}` |
| `/reinstall/{tabName}` | POST | Reinstall single tab | `installer.py reinstall {tab}` |
| `/reinstall-multiple` | POST | Reinstall multiple tabs | `installer.py reinstall {tab1} {tab2}...` |
| `/uninstall/{tabName}` | DELETE | Uninstall single tab | `installer.py uninstall {tab}` |
| `/status` | GET | Get all tab statuses | `installer.py list --all` + `installer.py validate --all` |
| `/install-all` | POST | Install all tabs | `installer.py install --all` |
| `/uninstall-all` | POST | Uninstall all tabs | `installer.py uninstall --all` |
| `/logs` | GET | Get installer logs | Read `/var/log/homeserver/premium_installer.log` |
| `/auto-update-status` | GET | Get auto-update eligibility for all tabs | Check `.git` + `dependencies.json` |
| `/auto-update/{tabName}` | GET | Get auto-update setting | Read `dependencies.json` |
| `/auto-update/{tabName}` | POST | Toggle auto-update setting | Modify `dependencies.json` |

**Total: 12 routes - 7 that map to installer commands + 5 for log viewing and auto-update management.**

This is clean, simple, and does exactly what you need without any overcomplicated simulation or extra features.
