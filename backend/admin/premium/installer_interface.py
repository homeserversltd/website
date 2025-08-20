"""
Interface to the premium tab installer.py script.
Provides Python functions that wrap subprocess calls to installer.py.
"""
import os
from typing import Dict, Any, List
import logging
try:
    # Prefer importing the premium JSON logger to write validate details
    from premium.utils.logger import create_category_logger  # type: ignore
except Exception:  # pragma: no cover - logger import is best-effort
    create_category_logger = None  # type: ignore
from ...utils.utils import execute_command, write_to_log
# Do not write validate details from admin interface; the premium installer handles logging


# Path to the installer script and premium directory
INSTALLER_PATH = "/var/www/homeserver/premium/installer.py"
PREMIUM_DIR = "/var/www/homeserver/premium"


def install_single_tab(tab_name: str) -> Dict[str, Any]:
    """
    Install a single premium tab using installer.py.
    
    Args:
        tab_name: Name of the tab to install
        
    Returns:
        Dict with success status and message or error
    """
    try:
        write_to_log('premium', f'Executing installer.py install {tab_name}', 'info')
        
        success, stdout, stderr = execute_command([
            '/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'install', os.path.join(PREMIUM_DIR, tab_name)
        ])
        
        if success:
            return {
                "success": True,
                "tabName": tab_name,
                "message": f"Installation completed successfully for {tab_name}.",
                "error": None
            }
        else:
            return {
                "success": False,
                "tabName": tab_name,
                "message": None,
                "error": stderr.strip() if stderr else "Installation failed with unknown error"
            }
            
    except Exception as e:
        write_to_log('premium', f'Exception in install_single_tab: {str(e)}', 'error')
        return {
            "success": False,
            "tabName": tab_name,
            "message": None,
            "error": f"Internal error: {str(e)}"
        }


def uninstall_single_tab(tab_name: str) -> Dict[str, Any]:
    """
    Uninstall a single premium tab using installer.py.
    
    Args:
        tab_name: Name of the tab to uninstall
        
    Returns:
        Dict with success status and message or error
    """
    try:
        write_to_log('premium', f'Executing installer.py uninstall {tab_name}', 'info')
        
        success, stdout, stderr = execute_command([
            '/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'uninstall', tab_name
        ])
        
        if success:
            return {
                "success": True,
                "tabName": tab_name,
                "message": f"Uninstallation completed successfully for {tab_name}.",
                "error": None
            }
        else:
            return {
                "success": False,
                "tabName": tab_name,
                "message": None,
                "error": stderr.strip() if stderr else "Uninstallation failed with unknown error"
            }
            
    except Exception as e:
        write_to_log('premium', f'Exception in uninstall_single_tab: {str(e)}', 'error')
        return {
            "success": False,
            "tabName": tab_name,
            "message": None,
            "error": f"Internal error: {str(e)}"
        }


def install_all_tabs() -> Dict[str, Any]:
    """
    Install all available premium tabs using installer.py.
    
    Returns:
        Dict with success status and message or error
    """
    try:
        write_to_log('premium', 'Executing installer.py install --all', 'info')
        
        success, stdout, stderr = execute_command([
            '/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'install', '--all'
        ])
        
        if success:
            return {
                "success": True,
                "message": "Installation of all tabs completed successfully.",
                "error": None
            }
        else:
            return {
                "success": False,
                "message": None,
                "error": stderr.strip() if stderr else "Installation of all tabs failed with unknown error"
            }
            
    except Exception as e:
        write_to_log('premium', f'Exception in install_all_tabs: {str(e)}', 'error')
        return {
            "success": False,
            "message": None,
            "error": f"Internal error: {str(e)}"
        }


def uninstall_all_tabs() -> Dict[str, Any]:
    """
    Uninstall all installed premium tabs using installer.py.
    
    Returns:
        Dict with success status and message or error
    """
    try:
        write_to_log('premium', 'Executing installer.py uninstall --all', 'info')
        
        success, stdout, stderr = execute_command([
            '/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'uninstall', '--all'
        ])
        
        if success:
            return {
                "success": True,
                "message": "Uninstallation of all tabs completed successfully.",
                "error": None
            }
        else:
            return {
                "success": False,
                "message": None,
                "error": stderr.strip() if stderr else "Uninstallation of all tabs failed with unknown error"
            }
            
    except Exception as e:
        write_to_log('premium', f'Exception in uninstall_all_tabs: {str(e)}', 'error')
        return {
            "success": False,
            "message": None,
            "error": f"Internal error: {str(e)}"
        }


def get_tab_status_list() -> Dict[str, Any]:
    """
    Get all tabs with installation status and conflict information.
    
    Uses installer.py list --all and installer.py validate --all to determine:
    - Which tabs are installed/available
    - Whether there are cross-tab conflicts
    - Whether individual tabs have core system conflicts
    
    Returns:
        Dict with tabs list, summary, and success status
    """
    write_to_log('premium', 'Getting tab status list', 'info')
    
    # 1. Get all tabs using installer.py list --all
    # Use full path to premium directory for CLI commands
    try:
        success, stdout, stderr = execute_command([
            '/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'list', '--all'
        ])
        
        if not success:
            return {
                "success": False,
                "error": f"Failed to get tab list: {stderr.strip() if stderr else 'Unknown error'}"
            }
        
        # Parse the tab list
        write_to_log('premium', f'Raw stdout from list command: {repr(stdout)}', 'debug')
        available_tabs = _parse_tab_list(stdout)
        write_to_log('premium', f'Parsed {len(available_tabs)} tabs from list output', 'info')
        
        # 2. Check for cross-tab conflicts using validate --all
        validate_success, validate_stdout, validate_stderr = execute_command([
            '/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'validate', '--all'
        ])
        
        has_cross_tab_conflicts = not validate_success
        
        # Extract detailed conflict information from validation output
        conflict_details = _parse_validation_output(validate_stdout, validate_stderr)
        
        # 3. Use the already parsed tabs from the list command
        tabs = available_tabs
        
        # Parse validation output to identify which specific tabs have conflicts
        tabs_with_individual_conflicts = set()
        if validate_stdout or validate_stderr:
            full_validation_output = validate_stdout + validate_stderr
            
            # Look for tab-specific error patterns
            for line in full_validation_output.splitlines():
                line = line.strip()
                
                # Look for manifest errors: "Manifest completeness errors in tabName:"
                if "Manifest completeness errors in" in line:
                    parts = line.split("Manifest completeness errors in")
                    if len(parts) > 1:
                        tab_name = parts[1].split(":")[0].strip()
                        tabs_with_individual_conflicts.add(tab_name)
                        write_to_log('premium', f'Found manifest conflict for tab: {tab_name}', 'debug')
                
                # Look for dependency validation lines: "Validating dependencies for premium tab: /path/to/tabName"
                elif "Validating dependencies for premium tab:" in line:
                    # Extract tab name from path
                    if "/premium/" in line:
                        tab_path = line.split("/premium/")[-1]
                        tab_name = tab_path.strip()
                        # Check if the next few lines contain "Found X dependency conflicts"
                        # We'll mark this tab for conflict checking
                        current_validating_tab = tab_name
                
                # Look for dependency conflicts: "Found X dependency conflicts"
                elif "Found" in line and "dependency conflicts" in line:
                    if 'current_validating_tab' in locals():
                        tabs_with_individual_conflicts.add(current_validating_tab)
                        write_to_log('premium', f'Found dependency conflict for tab: {current_validating_tab}', 'debug')
        
        # Set conflict flags only for tabs that actually have individual conflicts
        for tab in tabs:
            if tab['name'] in tabs_with_individual_conflicts:
                tab["hasConflicts"] = True
                tab["conflictsWithCore"] = True  # Individual tab conflicts are with core system
                write_to_log('premium', f'Marked tab {tab["name"]} as having conflicts', 'debug')
        
        # Calculate summary statistics for frontend
        installed_tabs = [tab for tab in tabs if tab["installed"]]
        available_tabs = [tab for tab in tabs if not tab["installed"]]
        tabs_with_conflicts = [tab for tab in tabs if tab.get("hasConflicts", False)]
        
        summary = {
            "totalTabs": len(tabs),
            "installedTabs": len(installed_tabs),
            "availableTabs": len(available_tabs),
            "hasAnyConflicts": has_cross_tab_conflicts or len(tabs_with_conflicts) > 0,
            "canInstallAll": len(available_tabs) > 0 and not has_cross_tab_conflicts,
            "canUninstallAll": len(installed_tabs) > 0
        }
        
        write_to_log('premium', f'Summary data: {summary}', 'info')
        
        write_to_log('premium', f'Returning {len(tabs)} tabs in final result', 'info')
        return {
            "success": True,
            "tabs": tabs,
            "summary": summary,
            "has_cross_tab_conflicts": has_cross_tab_conflicts,
            "cross_tab_conflicts": conflict_details
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Error getting tab status: {str(e)}"
        }


def _parse_tab_list(stdout: str) -> List[Dict[str, Any]]:
    """
    Parse installer.py list --all output.
    
    New format (as of CLI consolidation):
    === AVAILABLE PREMIUM TABS ===
      [DIR] testTab
         Name: testTab
         Version: 1.0.4
      [DIR] conflictTab
         Name: conflict
         Version: 1.0.0
    === INSTALLED PREMIUM TABS ===
      [INSTALLED] testTab (v1.0.4)
         Installed: 2025-08-20T09:51:44.014521
    
    Args:
        stdout: Raw output from installer.py list --all
        
    Returns:
        List of tab dictionaries with name and installation status
    """
    tabs = []
    
    try:
        lines = stdout.strip().split('\n')
        current_section = None
        write_to_log('premium', f'Parsing {len(lines)} lines from stdout', 'debug')
        
        for i, line in enumerate(lines):
            original_line = line
            line = line.strip()
            write_to_log('premium', f'Line {i}: {repr(original_line)} -> {repr(line)}', 'debug')
            
            if not line:
                write_to_log('premium', f'Skipping empty line {i}', 'debug')
                continue
                
            # Detect section headers
            if line.startswith('=== AVAILABLE PREMIUM TABS'):
                current_section = 'available'
                write_to_log('premium', f'Found AVAILABLE section at line {i}', 'debug')
                continue
            elif line.startswith('=== INSTALLED PREMIUM TABS'):
                current_section = 'installed'
                write_to_log('premium', f'Found INSTALLED section at line {i}', 'debug')
                continue
            elif line.startswith('==='):
                # Skip other section headers
                write_to_log('premium', f'Skipping other section header at line {i}', 'debug')
                continue
            
            # Parse folder entries ([DIR] for available, [INSTALLED] for installed)
            if line.startswith('[DIR]') or line.startswith('[INSTALLED]'):
                write_to_log('premium', f'Found tab entry at line {i}: {line}', 'debug')
                # Extract folder name (remove indicator and leading spaces)
                folder_name = line.replace('[DIR]', '').replace('[INSTALLED]', '').strip()
                
                # Remove version info if present (e.g., "testTab (v1.0.4)" -> "testTab")
                if ' (' in folder_name:
                    folder_name = folder_name.split(' (')[0]
                
                write_to_log('premium', f'Extracted folder name: {folder_name}, section: {current_section}', 'debug')
                
                # Create tab entry
                tab = {
                    "name": folder_name,  # Use folder name as identifier
                    "folder": folder_name,
                    "installed": current_section == 'installed',
                    "hasConflicts": False,  # Will be set later
                    "conflictsWithCore": False,  # Will be set later
                    "version": None,
                    "description": None,
                    "installTime": None
                }
                
                tabs.append(tab)
                write_to_log('premium', f'Added tab: {tab}', 'debug')
                continue
            
            # Parse tab details (Name, Version, Description, Installed time)
            if ':' in line and tabs:  # Detail lines contain colons
                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()
                
                current_tab = tabs[-1]  # Get the last added tab
                
                if key == 'Name':
                    current_tab['displayName'] = value
                elif key == 'Version':
                    current_tab['version'] = value
                elif key == 'Description':
                    current_tab['description'] = value
                elif key == 'Installed':
                    current_tab['installTime'] = value
                
                write_to_log('premium', f'Updated tab detail: {key} = {value}', 'debug')
        
        write_to_log('premium', f'Before post-processing: {len(tabs)} tabs', 'debug')
        
        # Post-process to handle edge cases and ensure data consistency
        for tab in tabs:
            # If no display name was found, use the folder name
            if 'displayName' not in tab or not tab['displayName']:
                tab['displayName'] = tab['name']
            
            # Ensure required fields exist
            if 'version' not in tab:
                tab['version'] = 'unknown'
            if 'description' not in tab:
                tab['description'] = ''
            if 'installTime' not in tab:
                tab['installTime'] = None
        
        write_to_log('premium', f'After post-processing: {len(tabs)} tabs', 'debug')
        
        # Deduplicate tabs - if a tab appears in both available and installed, keep only the installed version
        unique_tabs = {}
        for tab in tabs:
            tab_name = tab['name']
            if tab_name in unique_tabs:
                # If we already have this tab, keep the installed version
                if tab['installed'] or not unique_tabs[tab_name]['installed']:
                    unique_tabs[tab_name] = tab
            else:
                unique_tabs[tab_name] = tab
        
        # Convert back to list
        tabs = list(unique_tabs.values())
        write_to_log('premium', f'After deduplication: {len(tabs)} tabs', 'debug')
                
    except Exception as e:
        write_to_log('premium', f'Error parsing tab list: {str(e)}', 'error')
        import traceback
        write_to_log('premium', f'Traceback: {traceback.format_exc()}', 'error')
    
    return tabs


def _parse_validation_output(stdout: str, stderr: str) -> Dict[str, Any]:
    """
    Parse the detailed conflict information from the output of installer.py validate --all.
    
    The new CLI output includes specific error messages for conflicts.
    This function extracts these messages.
    
    Args:
        stdout: Standard output from installer.py validate --all
        stderr: Standard error output from installer.py validate --all
        
    Returns:
        Dict containing conflict details, or an empty dict if no conflicts.
    """
    conflict_details = {}
    
    # Combine stdout and stderr for full context
    full_output = stdout + stderr
    
    # Look for lines starting with "ERROR:" or "WARNING:"
    for line in full_output.splitlines():
        line = line.strip()
        if line.startswith("ERROR:") or line.startswith("WARNING:"):
            # Extract the conflict type and message
            parts = line.split(":", 1)
            if len(parts) > 1:
                conflict_type = parts[0].strip()
                conflict_message = parts[1].strip()
                
                # Clean up the conflict type (e.g., "ERROR:" -> "Error")
                conflict_type = conflict_type.replace("ERROR:", "Error").replace("WARNING:", "Warning")
                
                conflict_details[conflict_type] = conflict_message
    
    return conflict_details


def check_installer_available() -> bool:
    """
    Check if the installer.py script is available and executable.
    
    Returns:
        True if installer is available, False otherwise
    """
    try:
        return os.path.exists(INSTALLER_PATH) and os.access(INSTALLER_PATH, os.R_OK)
    except Exception:
        return False


def reinstall_single_tab(tab_name: str) -> Dict[str, Any]:
    """
    Reinstall a single premium tab using installer.py.
    
    Args:
        tab_name: Name of the tab to reinstall
        
    Returns:
        Dict with success status and message or error
    """
    try:
        write_to_log('premium', f'Executing installer.py reinstall {tab_name}', 'info')
        
        success, stdout, stderr = execute_command([
            '/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'reinstall', tab_name
        ])
        
        if success:
            return {
                "success": True,
                "tabName": tab_name,
                "message": f"Reinstallation completed successfully for {tab_name}.",
                "error": None
            }
        else:
            return {
                "success": False,
                "tabName": tab_name,
                "message": None,
                "error": stderr.strip() if stderr else "Reinstallation failed with unknown error"
            }
            
    except Exception as e:
        write_to_log('premium', f'Exception in reinstall_single_tab: {str(e)}', 'error')
        return {
            "success": False,
            "tabName": tab_name,
            "message": None,
            "error": f"Internal error: {str(e)}"
        }


def reinstall_multiple_tabs(tab_names: List[str], 
                          defer_build: bool = True,
                          defer_service_restart: bool = True) -> Dict[str, Any]:
    """
    Reinstall multiple premium tabs using installer.py.
    
    Args:
        tab_names: List of tab names to reinstall
        defer_build: Whether to defer frontend rebuild
        defer_service_restart: Whether to defer service restart
        
    Returns:
        Dict with success status and message or error
    """
    try:
        write_to_log('premium', f'Executing installer.py reinstall for tabs: {", ".join(tab_names)}', 'info')
        
        # Build command with optional flags
        cmd = ['/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'reinstall'] + tab_names
        
        if not defer_build:
            cmd.append('--no-defer-build')
        if not defer_service_restart:
            cmd.append('--no-defer-restart')
        
        success, stdout, stderr = execute_command(cmd)
        
        if success:
            return {
                "success": True,
                "message": f"Reinstallation of {len(tab_names)} tabs completed successfully.",
                "reinstalledTabs": tab_names,
                "error": None
            }
        else:
            return {
                "success": False,
                "message": None,
                "error": stderr.strip() if stderr else "Reinstallation of multiple tabs failed with unknown error"
            }
            
    except Exception as e:
        write_to_log('premium', f'Exception in reinstall_multiple_tabs: {str(e)}', 'error')
        return {
            "success": False,
            "message": None,
            "error": f"Internal error: {str(e)}"
        }
