"""
Utility functions for premium tab management.
Handles log parsing and other helper functions.
"""
import os
import subprocess
from datetime import datetime
from typing import Dict, Any, List
from ...utils.utils import write_to_log
import logging

# Optional JSON logger (premium installer log)
try:
    from premium.utils.logger import create_category_logger  # type: ignore
except Exception:  # pragma: no cover
    create_category_logger = None  # type: ignore
import json
import tempfile


# Path to the premium installer log file
PREMIUM_LOG_PATH = "/var/log/homeserver/premium_installer.log"


def delete_premium_tab_folder(tab_name: str, get_tab_status_list_func) -> Dict[str, Any]:
    """
    Permanently delete a premium tab folder from the filesystem with safety checks.
    
    Args:
        tab_name: Name of the tab folder to delete
        get_tab_status_list_func: Function to get tab installation status
        
    Returns:
        Dict with success status and message or error
    """
    try:
        # Validate tab name to prevent path traversal
        if not tab_name or '..' in tab_name or '/' in tab_name:
            return {"success": False, "error": "Invalid tab name"}
        
        # Blacklist of protected system folders that cannot be deleted
        protected_folders = {'utils', '_old', '__pycache__'}
        if tab_name.lower() in protected_folders:
            return {
                "success": False, 
                "error": f"Cannot delete '{tab_name}' - this is a protected system folder"
            }
        
        # Additional protection against folders starting with underscore or containing system keywords
        if tab_name.startswith('_') or tab_name.startswith('.'):
            return {
                "success": False, 
                "error": f"Cannot delete '{tab_name}' - folders starting with '_' or '.' are protected"
            }
        
        # Check if tab is currently installed - prevent deletion of installed tabs
        status_result = get_tab_status_list_func()
        if status_result['success']:
            for tab in status_result.get('tabs', []):
                if tab['name'] == tab_name and tab.get('installed', False):
                    return {
                        "success": False, 
                        "error": f"Cannot delete '{tab_name}' because it is currently installed. Please uninstall the tab first."
                    }
        else:
            write_to_log('premium', f'Failed to check tab status before deletion: {status_result["error"]}', 'warning')
            return {"success": False, "error": "Failed to verify tab installation status"}
        
        premium_path = '/var/www/homeserver/premium'
        tab_path = os.path.join(premium_path, tab_name)
        
        # Check if tab folder exists
        if not os.path.exists(tab_path):
            return {"success": False, "error": f"Tab '{tab_name}' does not exist"}
        
        # Ensure we're only deleting within the premium directory
        if not tab_path.startswith(premium_path + '/'):
            return {"success": False, "error": "Invalid tab path"}
        
        write_to_log('premium', f'Permanently deleting tab folder: {tab_name}', 'info')
        
        # Use sudo to remove the folder
        cmd = ['/usr/bin/sudo', '/bin/rm', '-rf', tab_path]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            write_to_log('premium', f'Successfully deleted tab folder: {tab_name}', 'info')
            return {
                "success": True, 
                "message": f"Premium tab '{tab_name}' has been permanently deleted"
            }
        else:
            error_msg = f"Failed to delete tab folder: {result.stderr}"
            write_to_log('premium', error_msg, 'error')
            return {"success": False, "error": error_msg}
            
    except subprocess.TimeoutExpired:
        write_to_log('premium', f'Timeout deleting tab {tab_name}', 'error')
        return {"success": False, "error": "Delete operation timed out"}
    except Exception as e:
        write_to_log('premium', f'Exception deleting tab {tab_name}: {str(e)}', 'error')
        return {"success": False, "error": f"Internal server error: {str(e)}"}


def premium_json_log(category: str, message: str, level: str = 'info') -> None:
    """Write a message to the premium JSON log (premium_installer.log).
    Falls back silently if JSON logger is unavailable.
    """
    try:
        if create_category_logger is None:
            return
        logger = create_category_logger(category, logging.getLogger('homeserver'))
        lvl = (level or 'info').lower()
        if lvl == 'error':
            logger.error(message)
        elif lvl == 'warning' or lvl == 'warn':
            logger.warning(message)
        elif lvl == 'debug':
            logger.debug(message)
        else:
            logger.info(message)
    except Exception:
        # Never break flow due to logging
        pass


def get_installer_logs() -> Dict[str, Any]:
    """
    Get the last installer operation logs from JSON format.
    
    Reads the premium installer JSON log file and returns the structured data.
    
    Returns:
        Dict with logs from all categories and metadata
    """
    try:
        if not os.path.exists(PREMIUM_LOG_PATH):
            return {
                "success": True,
                "logs": {},
                "lastOperation": "none",
                "timestamp": None,
                "message": "No installer logs found",
                "error": None
            }
        
        # Read and parse JSON log file
        try:
            with open(PREMIUM_LOG_PATH, 'r') as f:
                log_data = json.load(f)
        except json.JSONDecodeError as e:
            return {
                "success": False,
                "error": f"Failed to parse JSON log file: {str(e)}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to read log file: {str(e)}"
            }
        
        # Determine last operation from timestamps
        last_operation = "none"
        latest_timestamp = None
        
        for category, data in log_data.items():
            if data.get("last_updated") and data.get("messages"):
                if not latest_timestamp or data["last_updated"] > latest_timestamp:
                    latest_timestamp = data["last_updated"]
                    last_operation = category
        
        # Get file modification time as fallback timestamp
        try:
            file_stat = os.stat(PREMIUM_LOG_PATH)
            file_timestamp = datetime.fromtimestamp(file_stat.st_mtime).isoformat() + "Z"
        except Exception:
            file_timestamp = None
        
        return {
            "success": True,
            "logs": log_data,  # Return the full JSON structure
            "lastOperation": last_operation,
            "timestamp": latest_timestamp or file_timestamp,
            "message": f"Retrieved logs for {len(log_data)} categories",
            "error": None
        }
        
    except Exception as e:
        write_to_log('premium', f'Exception in get_installer_logs: {str(e)}', 'error')
        return {
            "success": False,
            "error": f"Internal error: {str(e)}"
        }



def get_log_file_info() -> Dict[str, Any]:
    """
    Get information about the log file without reading its contents.
    
    Returns:
        Dict with file size, modification time, and existence status
    """
    try:
        if not os.path.exists(PREMIUM_LOG_PATH):
            return {
                "exists": False,
                "size": 0,
                "lastModified": None,
                "readable": False
            }
        
        file_stat = os.stat(PREMIUM_LOG_PATH)
        
        return {
            "exists": True,
            "size": file_stat.st_size,
            "lastModified": datetime.fromtimestamp(file_stat.st_mtime).isoformat() + "Z",
            "readable": os.access(PREMIUM_LOG_PATH, os.R_OK)
        }
        
    except Exception as e:
        return {
            "exists": False,
            "size": 0,
            "lastModified": None,
            "readable": False,
            "error": str(e)
        }


def format_log_line(message: str, level: str = 'info') -> str:
    """
    Format a log line with timestamp and level.
    
    This matches the format used by the installer for consistency.
    
    Args:
        message: Log message
        level: Log level (info, warning, error)
        
    Returns:
        Formatted log line
    """
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    return f"[{timestamp}] [{level.upper()}] {message}"


def parse_installer_output(output: str) -> Dict[str, Any]:
    """
    Parse output from installer.py commands to extract useful information.
    
    This can be used to extract specific details from installer output
    like which tabs were processed, any warnings, etc.
    
    Args:
        output: Raw output from installer.py
        
    Returns:
        Dict with parsed information
    """
    try:
        lines = output.strip().split('\n')
        
        # Extract basic information
        processed_tabs = []
        warnings = []
        errors = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            line_lower = line.lower()
            
            # Look for tab names being processed
            if 'processing' in line_lower or 'installing' in line_lower or 'uninstalling' in line_lower:
                # Try to extract tab name (this is heuristic)
                words = line.split()
                for word in words:
                    if word.endswith('-tab') or word.endswith('_tab'):
                        processed_tabs.append(word)
            
            # Look for warnings
            if 'warning' in line_lower or 'warn' in line_lower:
                warnings.append(line)
            
            # Look for errors
            if 'error' in line_lower or 'failed' in line_lower:
                errors.append(line)
        
        return {
            "processedTabs": list(set(processed_tabs)),  # Remove duplicates
            "warnings": warnings,
            "errors": errors,
            "totalLines": len(lines)
        }
        
    except Exception as e:
        return {
            "processedTabs": [],
            "warnings": [],
            "errors": [f"Failed to parse output: {str(e)}"],
            "totalLines": 0
        }


def update_tab_auto_update_setting(tab_name: str, enabled: bool) -> Dict[str, Any]:
    """
    Update the auto-update enabled setting in a tab's dependencies.json file.
    
    Uses sudo to handle protected file permissions.
    
    Args:
        tab_name: Name of the tab to update
        enabled: Whether auto-update should be enabled
        
    Returns:
        Dict with success status and message or error
    """
    try:
        # Validate tab name to prevent path traversal
        if not tab_name or '..' in tab_name or '/' in tab_name:
            return {"success": False, "error": "Invalid tab name"}
        
        dependencies_file = f"/var/www/homeserver/premium/{tab_name}/system/dependencies.json"
        
        # Check if dependencies file exists
        if not os.path.exists(dependencies_file):
            return {
                "success": False, 
                "error": f"Dependencies file not found for tab '{tab_name}'"
            }
        
        write_to_log('premium', f'Updating auto-update setting for {tab_name}: enabled={enabled}', 'info')
        
        # Read current dependencies.json
        try:
            with open(dependencies_file, 'r') as f:
                deps_data = json.load(f)
        except json.JSONDecodeError as e:
            return {
                "success": False,
                "error": f"Invalid JSON in dependencies file: {str(e)}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to read dependencies file: {str(e)}"
            }
        
        # Ensure metadata section exists
        if "metadata" not in deps_data:
            deps_data["metadata"] = {}
        
        # Update the auto_update_enabled setting
        deps_data["metadata"]["auto_update_enabled"] = enabled
        
        # Write to temporary file first
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as temp_file:
            json.dump(deps_data, temp_file, indent=2)
            temp_file_path = temp_file.name
        
        try:
            # Use sudo to copy the temporary file to the protected location
            copy_cmd = [
                '/usr/bin/sudo', '/bin/cp', temp_file_path, dependencies_file
            ]
            
            result = subprocess.run(copy_cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode != 0:
                return {
                    "success": False,
                    "error": f"Failed to update dependencies file: {result.stderr}"
                }
            
            # Set proper permissions
            chmod_cmd = [
                '/usr/bin/sudo', '/bin/chmod', '644', dependencies_file
            ]
            subprocess.run(chmod_cmd, capture_output=True, text=True, timeout=5)
            
            # Set proper ownership
            chown_cmd = [
                '/usr/bin/sudo', '/bin/chown', 'www-data:www-data', dependencies_file
            ]
            subprocess.run(chown_cmd, capture_output=True, text=True, timeout=5)
            
            write_to_log('premium', f'Successfully updated auto-update setting for {tab_name}', 'info')
            
            return {
                "success": True,
                "message": f"Auto-update setting updated for '{tab_name}': {'enabled' if enabled else 'disabled'}",
                "enabled": enabled
            }
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file_path)
            except Exception:
                pass
                
    except subprocess.TimeoutExpired:
        write_to_log('premium', f'Timeout updating auto-update setting for {tab_name}', 'error')
        return {"success": False, "error": "Update operation timed out"}
    except Exception as e:
        write_to_log('premium', f'Exception updating auto-update setting for {tab_name}: {str(e)}', 'error')
        return {"success": False, "error": f"Internal error: {str(e)}"}


def get_tab_auto_update_setting(tab_name: str) -> Dict[str, Any]:
    """
    Get the current auto-update setting for a tab.
    
    Args:
        tab_name: Name of the tab to check
        
    Returns:
        Dict with auto-update setting and git metadata
    """
    try:
        # Validate tab name
        if not tab_name or '..' in tab_name or '/' in tab_name:
            return {"success": False, "error": "Invalid tab name"}
        
        dependencies_file = f"/var/www/homeserver/premium/{tab_name}/system/dependencies.json"
        
        if not os.path.exists(dependencies_file):
            return {
                "success": False,
                "error": f"Dependencies file not found for tab '{tab_name}'"
            }
        
        # Read dependencies.json
        with open(dependencies_file, 'r') as f:
            deps_data = json.load(f)
        
        metadata = deps_data.get("metadata", {})
        
        return {
            "success": True,
            "tabName": tab_name,
            "autoUpdateEnabled": metadata.get("auto_update_enabled", False),
            "gitRepository": metadata.get("git_repository"),
            "gitBranch": metadata.get("git_branch", "main"),
            "hasGitMetadata": bool(metadata.get("git_repository"))
        }
        
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "error": f"Invalid JSON in dependencies file: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to read auto-update setting: {str(e)}"
        }


def get_all_tabs_auto_update_status() -> Dict[str, Any]:
    """
    Get auto-update eligibility and status for all premium tabs.
    
    Checks each tab for:
    1. Presence of .git directory (indicates git-managed)
    2. Git metadata in dependencies.json
    3. Current auto_update_enabled setting
    
    Returns:
        Dict with list of tabs and their auto-update status
    """
    try:
        premium_dir = "/var/www/homeserver/premium"
        
        if not os.path.exists(premium_dir):
            return {
                "success": True,
                "tabs": [],
                "message": "Premium directory does not exist"
            }
        
        tabs_status = []
        
        # Get all directories in premium folder
        try:
            items = os.listdir(premium_dir)
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to list premium directory: {str(e)}"
            }
        
        for item in items:
            item_path = os.path.join(premium_dir, item)
            
            # Skip if not a directory or if it's a protected system folder
            if not os.path.isdir(item_path) or item in {'utils', '_old', '__pycache__'}:
                continue
            
            # Skip hidden directories
            if item.startswith('.') or item.startswith('_'):
                continue
            
            # Check if it has an index.json (indicates it's a premium tab)
            if not os.path.exists(os.path.join(item_path, "index.json")):
                continue
            
            tab_status = {
                "tabName": item,
                "hasGitDirectory": False,
                "hasGitMetadata": False,
                "autoUpdateEnabled": False,
                "autoUpdateEligible": False,
                "gitRepository": None,
                "gitBranch": None,
                "error": None
            }
            
            # Check for .git directory
            git_dir = os.path.join(item_path, ".git")
            tab_status["hasGitDirectory"] = os.path.exists(git_dir) and os.path.isdir(git_dir)
            
            # Check dependencies.json for git metadata and auto-update setting
            dependencies_file = os.path.join(item_path, "system", "dependencies.json")
            if os.path.exists(dependencies_file):
                try:
                    with open(dependencies_file, 'r') as f:
                        deps_data = json.load(f)
                    
                    metadata = deps_data.get("metadata", {})
                    
                    # Check for git metadata
                    git_repo = metadata.get("git_repository")
                    git_branch = metadata.get("git_branch")
                    
                    if git_repo:
                        tab_status["hasGitMetadata"] = True
                        tab_status["gitRepository"] = git_repo
                        tab_status["gitBranch"] = git_branch or "main"
                    
                    # Get auto-update setting
                    tab_status["autoUpdateEnabled"] = metadata.get("auto_update_enabled", False)
                    
                except json.JSONDecodeError as e:
                    tab_status["error"] = f"Invalid JSON in dependencies.json: {str(e)}"
                except Exception as e:
                    tab_status["error"] = f"Failed to read dependencies.json: {str(e)}"
            
            # Tab is eligible for auto-update if it has both .git directory AND git metadata
            tab_status["autoUpdateEligible"] = (
                tab_status["hasGitDirectory"] and 
                tab_status["hasGitMetadata"]
            )
            
            tabs_status.append(tab_status)
        
        # Sort tabs by name for consistent output
        tabs_status.sort(key=lambda x: x["tabName"])
        
        # Generate summary
        total_tabs = len(tabs_status)
        eligible_tabs = sum(1 for tab in tabs_status if tab["autoUpdateEligible"])
        enabled_tabs = sum(1 for tab in tabs_status if tab["autoUpdateEnabled"])
        git_managed_tabs = sum(1 for tab in tabs_status if tab["hasGitDirectory"])
        
        return {
            "success": True,
            "tabs": tabs_status,
            "summary": {
                "totalTabs": total_tabs,
                "gitManagedTabs": git_managed_tabs,
                "autoUpdateEligible": eligible_tabs,
                "autoUpdateEnabled": enabled_tabs
            }
        }
        
    except Exception as e:
        write_to_log('premium', f'Exception in get_all_tabs_auto_update_status: {str(e)}', 'error')
        return {
            "success": False,
            "error": f"Internal error: {str(e)}"
        }
