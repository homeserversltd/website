import os
import subprocess
import json
import re
import time
from typing import Tuple, Dict, List, Optional, Any
from flask import current_app
from backend.utils.utils import execute_command, error_response, success_response, get_config
import logging

logger = logging.getLogger(__name__)

# Update manager script path
UPDATE_MANAGER_PATH = "/usr/local/lib/updates/updateManager.sh"

def execute_update_manager(mode: str, target: Optional[str] = None, component: Optional[str] = None, force: bool = False) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Execute the update manager with specified parameters.
    
    Args:
        mode: Operation mode ('check', 'full', 'legacy', 'enable', 'disable', 'enable-component', 'disable-component', 'list', 'status')
        target: Target module name (for module operations)
        component: Component name (for component operations)
        force: Force operation even if no updates detected
        
    Returns:
        Tuple of (success, message, result_data)
    """
    try:
        logger.info(f"[UPDATEMAN-UTILS] Executing update manager - mode: {mode}, target: {target}, component: {component}, force: {force}")
        
        # Build command with sudo for proper permissions
        cmd = ["sudo", UPDATE_MANAGER_PATH]
        
        if mode == "check":
            cmd.append("--check")
        elif mode == "legacy":
            cmd.append("--legacy")
        elif mode == "enable":
            if not target:
                return False, "Target module required for enable operation", {}
            cmd.extend(["--enable", target])
        elif mode == "disable":
            if not target:
                return False, "Target module required for disable operation", {}
            cmd.extend(["--disable", target])
        elif mode == "enable-component":
            if not target or not component:
                return False, "Both module and component required for enable-component operation", {}
            cmd.extend(["--enable-component", target, component])
        elif mode == "disable-component":
            if not target or not component:
                return False, "Both module and component required for disable-component operation", {}
            cmd.extend(["--disable-component", target, component])
        elif mode == "list":
            cmd.append("--list-modules")
        elif mode == "status":
            if target:
                cmd.extend(["--status", target])
            else:
                cmd.append("--status")
        elif mode == "full":
            # Full mode uses no additional arguments (default behavior)
            pass
        else:
            return False, f"Invalid mode: {mode}", {}
        
        logger.info(f"[UPDATEMAN-UTILS] Executing command: {' '.join(cmd)}")
        start_time = time.time()
        
        # Execute command
        success, stdout, stderr = execute_command(cmd)
        
        execution_time = time.time() - start_time
        logger.info(f"[UPDATEMAN-UTILS] Command completed in {execution_time:.2f} seconds - Success: {success}")
        
        if stderr:
            logger.warning(f"[UPDATEMAN-UTILS] Command stderr: {stderr}")
        
        # Log the raw output for debugging
        logger.info(f"[UPDATEMAN-UTILS] Raw stdout: {stdout}")
        if stderr:
            logger.info(f"[UPDATEMAN-UTILS] Raw stderr: {stderr}")
        
        # Parse output based on mode
        result_data = {}
        
        if success:
            if mode == "check":
                result_data = _parse_check_output(stdout)
            elif mode in ["full", "legacy"]:
                result_data = _parse_update_output(stdout)
            elif mode == "list":
                result_data = _parse_module_list_output(stdout)
            elif mode == "status":
                result_data = _parse_status_output(stdout, target)
            elif mode in ["enable", "disable", "enable-component", "disable-component"]:
                result_data = _parse_toggle_output(stdout, mode, target, component)
            else:
                result_data = {"raw_output": stdout, "execution_time": f"{execution_time:.2f} seconds"}
        else:
            logger.error(f"[UPDATEMAN-UTILS] Command failed: {stderr}")
            return False, stderr or "Update manager execution failed", {}
        
        result_data["execution_time"] = f"{execution_time:.2f} seconds"
        return True, "Operation completed successfully", result_data
        
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error executing update manager: {str(e)}")
        return False, f"Error executing update manager: {str(e)}", {}

def _parse_check_output(output: str) -> Dict[str, Any]:
    """Parse the output from update check operation."""
    try:
        result = {
            "updates_available": False,
            "current_version": "unknown",
            "latest_version": "unknown",
            "raw_output": output
        }
        
        # Look for update availability indicators in output
        # First check for explicit "no updates" messages
        if "No updates available" in output or "System is up to date" in output:
            result["updates_available"] = False
        # Then check for specific update patterns
        elif re.search(r"Found \d+ modules? to update", output) or "modules to update" in output:
            result["updates_available"] = True
        elif re.search(r"Module \w+ needs update:", output):
            result["updates_available"] = True
        else:
            # Default to False if no specific update indicators found
            result["updates_available"] = False
        
        # Extract version information if present
        version_pattern = r"Version:\s*([^\s]+)"
        matches = re.findall(version_pattern, output)
        if len(matches) >= 2:
            result["current_version"] = matches[0]
            result["latest_version"] = matches[1]
        elif len(matches) == 1:
            result["current_version"] = matches[0]
        
        return result
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error parsing check output: {str(e)}")
        return {"raw_output": output, "parse_error": str(e)}

def _parse_update_output(output: str) -> Dict[str, Any]:
    """Parse the output from update application operation."""
    try:
        result = {
            "success": False,
            "modules_updated": [],
            "errors": [],
            "raw_output": output
        }
        
        # Look for success indicators
        if "✓ Update system completed successfully" in output:
            result["success"] = True
        
        # Extract module update information
        module_pattern = r"Module '([^']+)' updated successfully"
        result["modules_updated"] = re.findall(module_pattern, output)
        
        # Extract error information
        error_pattern = r"✗ (.+)"
        result["errors"] = re.findall(error_pattern, output)
        
        return result
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error parsing update output: {str(e)}")
        return {"raw_output": output, "parse_error": str(e)}

def _parse_module_list_output(output: str) -> Dict[str, Any]:
    """Parse the output from module list operation."""
    try:
        result = {
            "modules": [],
            "total_modules": 0,
            "enabled_modules": 0,
            "disabled_modules": 0,
            "raw_output": output
        }
        
        # Parse module listing
        lines = output.split('\n')
        in_module_list = False
        
        for line in lines:
            if "Available modules:" in line:
                in_module_list = True
                continue
            elif "Total:" in line:
                # Extract totals from summary line
                total_match = re.search(r"Total:\s*(\d+)\s*modules\s*\((\d+)\s*enabled,\s*(\d+)\s*disabled\)", line)
                if total_match:
                    result["total_modules"] = int(total_match.group(1))
                    result["enabled_modules"] = int(total_match.group(2))
                    result["disabled_modules"] = int(total_match.group(3))
                break
            elif in_module_list and line.strip() and not line.startswith('-'):
                # Extract the actual content after the timestamp prefix
                # Format: [timestamp] [INFO] module_name    STATUS    version    description
                if "] [INFO]" in line:
                    content = line.split("] [INFO]", 1)[1].strip()
                    parts = content.split()
                    if len(parts) >= 4:
                        module_name = parts[0]
                        # Filter out backup directories
                        if not module_name.endswith('.backup'):
                            module = {
                                "name": module_name,
                                "enabled": parts[1] == "ENABLED",
                                "version": parts[2].replace('v', ''),
                                "description": ' '.join(parts[3:])
                            }
                            result["modules"].append(module)
        
        return result
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error parsing module list output: {str(e)}")
        return {"raw_output": output, "parse_error": str(e)}

def _parse_status_output(output: str, target: Optional[str] = None) -> Dict[str, Any]:
    """Parse the output from status operation."""
    try:
        result = {
            "status": "unknown",
            "details": {},
            "raw_output": output
        }
        
        if target:
            result["module_name"] = target
        
        # Parse status information
        # This is a placeholder - actual parsing will depend on the status output format
        if "ENABLED" in output:
            result["status"] = "enabled"
        elif "DISABLED" in output:
            result["status"] = "disabled"
        elif "NOT FOUND" in output:
            result["status"] = "not_found"
        
        return result
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error parsing status output: {str(e)}")
        return {"raw_output": output, "parse_error": str(e)}

def _parse_toggle_output(output: str, action: str, target: Optional[str] = None, component: Optional[str] = None) -> Dict[str, Any]:
    """Parse the output from toggle operations."""
    try:
        result = {
            "action": action,
            "target": target,
            "component": component,
            "success": False,
            "raw_output": output
        }
        
        # Look for success indicators
        success_patterns = [
            f"✓ Module '{target}' enabled",
            f"✓ Module '{target}' disabled",
            f"✓ Component '{component}' enabled in module '{target}'",
            f"✓ Component '{component}' disabled in module '{target}'",
            "✓ Module management operation completed successfully"
        ]
        
        for pattern in success_patterns:
            if pattern in output:
                result["success"] = True
                break
        
        return result
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error parsing toggle output: {str(e)}")
        return {"raw_output": output, "parse_error": str(e)}

def get_update_logs(limit: int = 50, level: str = "all") -> Tuple[bool, str, Dict[str, Any]]:
    """
    Retrieve update operation logs.
    
    Args:
        limit: Number of log entries to return
        level: Log level filter
        
    Returns:
        Tuple of (success, message, logs_data)
    """
    try:
        logger.info(f"[UPDATEMAN-UTILS] Retrieving update logs - limit: {limit}, level: {level}")
        
        # This is a placeholder implementation
        # In a real implementation, you would read from log files or a logging system
        logs_data = {
            "logs": [
                {
                    "timestamp": int(time.time()) - 3600,
                    "level": "info",
                    "message": "Update check completed successfully",
                    "module": "system"
                },
                {
                    "timestamp": int(time.time()) - 7200,
                    "level": "info", 
                    "message": "Module website enabled successfully",
                    "module": "website"
                }
            ]
        }
        
        # Filter by level if specified
        if level != "all":
            logs_data["logs"] = [log for log in logs_data["logs"] if log["level"] == level]
        
        # Apply limit
        logs_data["logs"] = logs_data["logs"][:limit]
        
        return True, "Logs retrieved successfully", logs_data
        
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error retrieving logs: {str(e)}")
        return False, f"Error retrieving logs: {str(e)}", {}

def get_system_update_info() -> Tuple[bool, str, Dict[str, Any]]:
    """
    Get system information relevant to updates.
    
    Returns:
        Tuple of (success, message, system_info)
    """
    try:
        logger.info("[UPDATEMAN-UTILS] Getting system update information")
        
        # Get basic system information
        system_info = {
            "update_manager_path": UPDATE_MANAGER_PATH,
            "update_manager_available": os.path.exists(UPDATE_MANAGER_PATH),
            "python_orchestrator_path": "/usr/local/lib/updates/index.py",
            "python_orchestrator_available": os.path.exists("/usr/local/lib/updates/index.py"),
            "git_repository_path": "/usr/local/lib/updates",
            "last_check_time": None,
            "system_version": "unknown"
        }
        
        # Check if git repository exists and get last update time
        if os.path.exists("/usr/local/lib/updates/.git"):
            try:
                # Get last commit time
                cmd = ["git", "-C", "/usr/local/lib/updates", "log", "-1", "--format=%ct"]
                success, stdout, stderr = execute_command(cmd)
                if success and stdout.strip():
                    system_info["last_check_time"] = int(stdout.strip())
            except Exception as e:
                logger.warning(f"[UPDATEMAN-UTILS] Could not get git info: {str(e)}")
        
        # Get system version from config if available
        try:
            config = get_config()
            if config and "global" in config and "version" in config["global"]:
                system_info["system_version"] = config["global"]["version"]
        except Exception as e:
            logger.warning(f"[UPDATEMAN-UTILS] Could not get system version: {str(e)}")
        
        return True, "System information retrieved successfully", system_info
        
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error getting system info: {str(e)}")
        return False, f"Error getting system info: {str(e)}", {}

def validate_module_name(module_name: str) -> bool:
    """
    Validate that a module name is safe to use.
    
    Args:
        module_name: The module name to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not module_name:
        return False
    
    # Allow alphanumeric characters, hyphens, and underscores
    if not re.match(r'^[a-zA-Z0-9_-]+$', module_name):
        return False
    
    # Prevent path traversal
    if '..' in module_name or '/' in module_name:
        return False
    
    return True

def validate_component_name(component_name: str) -> bool:
    """
    Validate that a component name is safe to use.
    
    Args:
        component_name: The component name to validate
        
    Returns:
        True if valid, False otherwise
    """
    # Use the same validation as module names
    return validate_module_name(component_name)

def get_update_cron_job() -> Tuple[bool, str, Dict[str, Any]]:
    """
    Get the current update cron job configuration.
    
    Returns:
        Tuple of (success, message, cron_data)
    """
    try:
        logger.info("[UPDATEMAN-UTILS] Getting current update cron job")
        
        # Get current crontab for root user
        success, stdout, stderr = execute_command(["sudo", "crontab", "-l"])
        
        if not success and "no crontab for root" not in stderr.lower():
            logger.error(f"[UPDATEMAN-UTILS] Failed to get crontab: {stderr}")
            return False, f"Failed to get crontab: {stderr}", {}
        
        # Parse existing cron entries for homeserver updates
        cron_entries = stdout.split('\n') if success else []
        update_cron = None
        
        for line in cron_entries:
            if line.strip() and not line.startswith('#') and 'homeserver-update' in line:
                update_cron = line.strip()
                break
        
        result = {
            "enabled": update_cron is not None,
            "cron_line": update_cron,
            "parsed_schedule": None
        }
        
        if update_cron:
            # Parse the cron line to extract schedule details
            result["parsed_schedule"] = _parse_cron_line(update_cron)
        
        logger.info(f"[UPDATEMAN-UTILS] Current cron job status: {result}")
        return True, "Cron job status retrieved successfully", result
        
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error getting cron job: {str(e)}")
        return False, f"Error getting cron job: {str(e)}", {}

def set_update_cron_job(schedule: Dict[str, Any]) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Set or update the update cron job based on schedule configuration.
    
    Args:
        schedule: Dictionary containing schedule configuration
                 {
                     "enabled": bool,
                     "frequency": "daily"|"weekly"|"monthly",
                     "time": "HH:MM",
                     "dayOfWeek": int (0-6, for weekly),
                     "dayOfMonth": int (1-31, for monthly)
                 }
    
    Returns:
        Tuple of (success, message, result_data)
    """
    try:
        logger.info(f"[UPDATEMAN-UTILS] Setting update cron job: {schedule}")
        
        # Get current crontab
        success, stdout, stderr = execute_command(["sudo", "crontab", "-l"])
        current_cron_lines = []
        
        if success:
            current_cron_lines = [line for line in stdout.split('\n') 
                                if line.strip() and not line.strip().startswith('#')]
        elif "no crontab for root" not in stderr.lower():
            logger.error(f"[UPDATEMAN-UTILS] Failed to get current crontab: {stderr}")
            return False, f"Failed to get current crontab: {stderr}", {}
        
        # Remove existing homeserver update cron jobs
        filtered_lines = [line for line in current_cron_lines 
                         if 'homeserver-update' not in line]
        
        # Add new cron job if enabled
        if schedule.get("enabled", False):
            cron_line = _build_cron_line(schedule)
            if not cron_line:
                return False, "Invalid schedule configuration", {}
            
            filtered_lines.append(cron_line)
            logger.info(f"[UPDATEMAN-UTILS] Adding cron line: {cron_line}")
        else:
            logger.info("[UPDATEMAN-UTILS] Disabling cron job (removing from crontab)")
        
        # Write new crontab using temporary file approach
        import tempfile
        
        if filtered_lines:
            new_crontab = '\n'.join(filtered_lines) + '\n'
            
            # Write to temporary file
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.cron') as temp_file:
                temp_file.write(new_crontab)
                temp_file_path = temp_file.name
            
            try:
                # Install the new crontab from the temporary file
                success, stdout, stderr = execute_command(
                    ["sudo", "crontab", temp_file_path]
                )
            finally:
                # Clean up temporary file
                import os
                try:
                    os.unlink(temp_file_path)
                except:
                    pass
        else:
            # Remove all cron jobs (empty crontab)
            success, stdout, stderr = execute_command(
                ["sudo", "crontab", "-r"]
            )
            # crontab -r returns non-zero if no crontab exists, which is fine
            if not success and "no crontab for root" in stderr.lower():
                success = True
                stderr = ""
        
        if not success:
            logger.error(f"[UPDATEMAN-UTILS] Failed to set crontab: {stderr}")
            return False, f"Failed to set crontab: {stderr}", {}
        
        # Verify the cron job was set correctly
        verify_success, verify_message, verify_data = get_update_cron_job()
        
        result = {
            "enabled": schedule.get("enabled", False),
            "schedule": schedule,
            "cron_line": _build_cron_line(schedule) if schedule.get("enabled") else None,
            "verification": verify_data if verify_success else None
        }
        
        status_text = 'enabled' if schedule.get('enabled') else 'disabled'
        logger.info(f"[UPDATEMAN-UTILS] Cron job {status_text} successfully")
        return True, f"Update schedule {status_text} successfully", result
        
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error setting cron job: {str(e)}")
        return False, f"Error setting cron job: {str(e)}", {}

def _parse_cron_line(cron_line: str) -> Dict[str, Any]:
    """Parse a cron line and extract schedule information."""
    try:
        # Remove comment and command parts, focus on timing
        parts = cron_line.split()
        if len(parts) < 5:
            return {"error": "Invalid cron format"}
        
        minute, hour, day_of_month, month, day_of_week = parts[:5]
        
        # Determine frequency based on pattern
        frequency = "daily"
        day_of_week_val = None
        day_of_month_val = None
        
        if day_of_week != "*":
            frequency = "weekly"
            day_of_week_val = int(day_of_week) if day_of_week.isdigit() else 0
        elif day_of_month != "*":
            frequency = "monthly"
            day_of_month_val = int(day_of_month) if day_of_month.isdigit() else 1
        
        # Format time
        time_str = f"{hour.zfill(2)}:{minute.zfill(2)}"
        
        return {
            "frequency": frequency,
            "time": time_str,
            "dayOfWeek": day_of_week_val,
            "dayOfMonth": day_of_month_val,
            "raw_cron": cron_line
        }
        
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error parsing cron line: {str(e)}")
        return {"error": f"Parse error: {str(e)}", "raw_cron": cron_line}

def _build_cron_line(schedule: Dict[str, Any]) -> Optional[str]:
    """Build a cron line from schedule configuration."""
    try:
        frequency = schedule.get("frequency", "weekly")
        time_str = schedule.get("time", "03:00")
        
        # Parse time
        try:
            hour, minute = time_str.split(":")
            hour = int(hour)
            minute = int(minute)
        except (ValueError, AttributeError):
            logger.error(f"[UPDATEMAN-UTILS] Invalid time format: {time_str}")
            return None
        
        # Build cron timing based on frequency
        if frequency == "daily":
            cron_time = f"{minute} {hour} * * *"
        elif frequency == "weekly":
            day_of_week = schedule.get("dayOfWeek", 0)  # Default to Sunday
            cron_time = f"{minute} {hour} * * {day_of_week}"
        elif frequency == "monthly":
            day_of_month = schedule.get("dayOfMonth", 1)  # Default to 1st
            cron_time = f"{minute} {hour} {day_of_month} * *"
        else:
            logger.error(f"[UPDATEMAN-UTILS] Invalid frequency: {frequency}")
            return None
        
        # Build complete cron line with comment for identification
        cron_line = f"{cron_time} /usr/local/lib/updates/updateManager.sh --full > /dev/null 2>&1 # homeserver-update"
        
        logger.info(f"[UPDATEMAN-UTILS] Built cron line: {cron_line}")
        return cron_line
        
    except Exception as e:
        logger.error(f"[UPDATEMAN-UTILS] Error building cron line: {str(e)}")
        return None
