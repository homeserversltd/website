"""
Interface to the premium tab installer.py script.
Provides Python functions that wrap subprocess calls to installer.py.
"""
import os
from typing import Dict, Any, List
from ...utils.utils import execute_command, write_to_log


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
    try:
        write_to_log('premium', 'Getting tab status list', 'info')
        
        # 1. Get all tabs using installer.py list --all
        success, stdout, stderr = execute_command([
            '/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'list', '--all'
        ])
        
        if not success:
            return {
                "success": False,
                "error": f"Failed to get tab list: {stderr.strip() if stderr else 'Unknown error'}"
            }
        
        # Parse the tab list
        tabs = _parse_tab_list(stdout)
        
        # 2. Check for cross-tab conflicts using validate --all
        validate_success, validate_stdout, validate_stderr = execute_command([
            '/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'validate', '--all'
        ])
        
        has_cross_tab_conflicts = not validate_success
        
        # 3. For each uninstalled tab, check individual conflicts with core system
        for tab in tabs:
            if not tab["installed"]:
                # Check individual tab conflicts with core system
                check_success, check_stdout, check_stderr = execute_command([
                    '/usr/bin/sudo', '/usr/bin/python3', INSTALLER_PATH, 'validate', os.path.join(PREMIUM_DIR, tab['name'])
                ])
                
                tab["conflictsWithCore"] = not check_success
                tab["hasConflicts"] = tab["conflictsWithCore"]
            else:
                # Installed tabs don't have conflicts (they're already resolved)
                tab["conflictsWithCore"] = False
                tab["hasConflicts"] = False
        
        # 4. Generate summary
        installed_count = sum(1 for tab in tabs if tab["installed"])
        available_count = len(tabs) - installed_count
        
        summary = {
            "totalTabs": len(tabs),
            "installedTabs": installed_count,
            "availableTabs": available_count,
            "hasAnyConflicts": has_cross_tab_conflicts,
            "canInstallAll": not has_cross_tab_conflicts and available_count > 0,
            "canUninstallAll": installed_count > 0
        }
        
        return {
            "success": True,
            "tabs": tabs,
            "summary": summary,
            "error": None
        }
        
    except Exception as e:
        write_to_log('premium', f'Exception in get_tab_status_list: {str(e)}', 'error')
        return {
            "success": False,
            "error": f"Internal error: {str(e)}"
        }


def _parse_tab_list(stdout: str) -> List[Dict[str, Any]]:
    """
    Parse installer.py list --all output.
    
    Expected format:
    tab-name: INSTALLED
    another-tab: AVAILABLE
    
    Args:
        stdout: Raw output from installer.py list --all
        
    Returns:
        List of tab dictionaries with name and installation status
    """
    tabs = []
    
    try:
        lines = stdout.strip().split('\n')
        for line in lines:
            line = line.strip()
            if ': ' in line:
                name, status = line.split(': ', 1)
                tabs.append({
                    "name": name.strip(),
                    "installed": status.strip().upper() == "INSTALLED",
                    "hasConflicts": False,  # Will be set later
                    "conflictsWithCore": False  # Will be set later
                })
    except Exception as e:
        write_to_log('premium', f'Error parsing tab list: {str(e)}', 'error')
    
    return tabs


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
