# Premium Tab Installer - Remote Commands

This file documents the commands available in the premium tab installer for remote usage.

## Available Commands

### Install Commands (Auto-detects single vs batch)
```bash
# Install a single tab
sudo python3 installer.py install tabName

# Install multiple specific tabs (automatically uses batch mode)
sudo python3 installer.py install tab1 tab2 tab3

# Install all tabs from premium directory
sudo python3 installer.py install --all

# Install with immediate build/restart (no deferral)
sudo python3 installer.py install tab1 tab2 --no-defer-build --no-defer-restart
```

### Reinstall Commands (for development iteration)
```bash
# Reinstall a single tab
sudo python3 installer.py reinstall tabName

# Reinstall multiple tabs
sudo python3 installer.py reinstall tab1 tab2 tab3

# Reinstall with immediate operations
sudo python3 installer.py reinstall tabName --no-defer-build --no-defer-restart
```

### Uninstall Commands
```bash
# Uninstall a specific tab
sudo python3 installer.py uninstall tabName

# Uninstall all installed tabs
sudo python3 installer.py uninstall --all
```

### Validation Commands
```bash
# Validate a single tab
sudo python3 installer.py validate tabName

# Validate all tabs from directory
sudo python3 installer.py validate --all
```

### List Commands
```bash
# List available tabs in premium directory (ready to install)
python3 installer.py list --available

# List currently installed tabs
python3 installer.py list --installed

# List both available and installed tabs
python3 installer.py list --all
```

## For Website Update Integration

**Use these commands to restore premium tabs after website updates:**

- **Single tab**: `install tab_path`
- **Multiple tabs**: `install tab_path1 tab_path2 tab_path3` (automatically uses batch mode)

**Do NOT use:**
- `install --all` (would install unwanted tabs)
- `reinstall` (for reinstalling individually updated tabs)

## Key Changes in Latest Version

**Consolidated Install Command**: The `install` command now automatically detects whether you're installing one tab or multiple tabs:
- **Single tab**: Uses individual installation logic
- **Multiple tabs**: Automatically switches to batch mode with deferred operations
- **No more separate `batch` command**: Everything is handled by the smart `install` command

**New Reinstall Command**: Added for development iteration without manual uninstall/install steps

**Enhanced Validation**: New `validate` command for checking tab compatibility before installation

**Improved Listing**: More granular control over what tabs are displayed

**Benefits**:
- **Simpler CLI**: One command for all installation scenarios
- **Automatic Optimization**: Multiple tabs automatically use batch mode
- **Consistent Options**: Same flags work for both single and multiple installations
- **Backward Compatible**: Single tab installations work exactly the same