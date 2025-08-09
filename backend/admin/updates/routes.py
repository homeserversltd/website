import os
import json
import time
import subprocess
import re
from flask import request, jsonify, current_app
from backend.auth.decorators import admin_required
from backend.utils.utils import execute_command, get_config, error_response, success_response, write_to_log
from .. import bp
from . import utils
import logging

# Path to homeserver config
HOMESERVER_CONFIG_PATH = '/var/www/homeserver/src/config/homeserver.json'
# Path to update manager logfile
UPDATE_LOG_PATH = '/var/log/homeserver/update.log'

# Get logger
logger = logging.getLogger('homeserver')

@bp.route('/api/admin/updates/check', methods=['GET'])
@admin_required
def check_updates():
    """
    Check for available updates without applying them.
    Non-destructive operation that queries the update system status.
    
    Returns:
        JSON response with update status and available updates
    """
    try:
        logger.info("[UPDATEMAN] Checking for available updates")
        start_time = time.time()
        
        # Execute the update manager check command
        success, message, update_info = utils.execute_update_manager("check")
        
        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] Update check completed in {operation_time:.2f} seconds")
        
        if not success:
            logger.error(f"[UPDATEMAN] Update check failed: {message}")
            return error_response(f"Failed to check updates: {message}")
        
        logger.info("[UPDATEMAN] Update check completed successfully")
        write_to_log('admin', 'Update check performed successfully', 'info')
        
        return success_response(
            message="Update check completed successfully",
            details={
                "updateAvailable": update_info.get("updates_available", False),
                "currentVersion": update_info.get("current_version", "unknown"),
                "latestVersion": update_info.get("latest_version", "unknown"),
                "updateInfo": update_info,
                "checkTime": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )
        
    except Exception as e:
        logger.error(f"[UPDATEMAN] Error checking updates: {str(e)}")
        return error_response(f"Failed to check updates: {str(e)}")

@bp.route('/api/admin/updates/apply', methods=['POST'])
@admin_required
def apply_updates():
    """
    Apply available updates to the system.
    This performs the full schema-based update process.
    
    Expected JSON payload:
    {
        "mode": "str",      # Optional - 'full' (default) or 'legacy'
        "force": bool       # Optional - force update even if no updates detected
    }
    """
    try:
        data = request.get_json() or {}
        logger.info(f"[UPDATEMAN] Apply updates request: {json.dumps(data, indent=2)}")
        start_time = time.time()
        
        # Validate mode
        mode = data.get('mode', 'full')
        if mode not in ['full', 'legacy']:
            return error_response(f"Invalid update mode: {mode}")
        
        force = data.get('force', False)
        logger.info(f"[UPDATEMAN] Applying updates - mode: {mode}, force: {force}")
        
        # Execute the update manager
        success, message, update_result = utils.execute_update_manager(mode, force=force)
        
        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] Update application completed in {operation_time:.2f} seconds")
        
        if not success:
            logger.error(f"[UPDATEMAN] Update application failed: {message}")
            write_to_log('admin', f'Update application failed: {message}', 'error')
            return error_response(f"Failed to apply updates: {message}")
        
        logger.info("[UPDATEMAN] Updates applied successfully")
        write_to_log('admin', f'Updates applied successfully using {mode} mode', 'info')
        
        return success_response(
            message="Updates applied successfully",
            details={
                "mode": mode,
                "force": force,
                "updateResult": update_result,
                "appliedAt": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )
        
    except Exception as e:
        logger.error(f"[UPDATEMAN] Error applying updates: {str(e)}")
        return error_response(f"Failed to apply updates: {str(e)}")

@bp.route('/api/admin/updates/modules', methods=['GET'])
@admin_required
def list_modules():
    """
    List all available modules with their status and details.
    
    Returns:
        JSON response with module list and status information
    """
    try:
        logger.info("[UPDATEMAN] Listing modules")
        start_time = time.time()
        
        # Execute the module list command
        success, message, modules_info = utils.execute_update_manager("list")
        if not modules_info.get("modules"): print("[UPDATEMAN-DEBUG] 0 modules; raw:\n" + (modules_info.get("raw_output", "")[:4000]), flush=True)
        
        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] Module listing completed in {operation_time:.2f} seconds")
        
        if not success:
            logger.error(f"[UPDATEMAN] Module listing failed: {message}")
            return error_response(f"Failed to list modules: {message}")
        
        logger.info(f"[UPDATEMAN] Found {len(modules_info.get('modules', []))} modules")
        
        return success_response(
            message="Modules listed successfully",
            details={
                "modules": modules_info.get("modules", []),
                "totalModules": len(modules_info.get("modules", [])),
                "enabledModules": len([m for m in modules_info.get("modules", []) if m.get("enabled", False)]),
                "disabledModules": len([m for m in modules_info.get("modules", []) if not m.get("enabled", False)]),
                "listTime": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )
        
    except Exception as e:
        logger.error(f"[UPDATEMAN] Error listing modules: {str(e)}")
        return error_response(f"Failed to list modules: {str(e)}")

@bp.route('/api/admin/updates/modules/<module_name>/status', methods=['GET'])
@admin_required
def get_module_status(module_name):
    """
    Get detailed status information for a specific module.
    
    Args:
        module_name: Name of the module to query
        
    Returns:
        JSON response with detailed module status
    """
    try:
        logger.info(f"[UPDATEMAN] Getting status for module: {module_name}")
        start_time = time.time()
        
        # Validate module name
        if not module_name or not module_name.replace('_', '').replace('-', '').isalnum():
            return error_response("Invalid module name")
        
        # Execute the module status command
        success, message, module_info = utils.execute_update_manager("status", target=module_name)
        
        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] Module status query completed in {operation_time:.2f} seconds")
        
        if not success:
            logger.error(f"[UPDATEMAN] Module status query failed: {message}")
            return error_response(f"Failed to get module status: {message}")
        
        logger.info(f"[UPDATEMAN] Module {module_name} status retrieved successfully")
        
        return success_response(
            message=f"Module {module_name} status retrieved successfully",
            details={
                "moduleName": module_name,
                "moduleInfo": module_info,
                "queryTime": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )
        
    except Exception as e:
        logger.error(f"[UPDATEMAN] Error getting module status: {str(e)}")
        return error_response(f"Failed to get module status: {str(e)}")

@bp.route('/api/admin/updates/modules/<module_name>/toggle', methods=['POST'])
@admin_required
def toggle_module(module_name):
    """
    Enable or disable a specific module.
    
    Args:
        module_name: Name of the module to toggle
        
    Expected JSON payload:
    {
        "enabled": bool     # True to enable, False to disable
    }
    """
    try:
        data = request.get_json()
        logger.info(f"[UPDATEMAN] Toggle module {module_name} request: {json.dumps(data, indent=2)}")
        start_time = time.time()
        
        if not data or 'enabled' not in data:
            return error_response("Missing 'enabled' field in request")
        
        # Validate module name
        if not module_name or not module_name.replace('_', '').replace('-', '').isalnum():
            return error_response("Invalid module name")
        
        enabled = bool(data['enabled'])
        action = "enable" if enabled else "disable"
        
        logger.info(f"[UPDATEMAN] {action.capitalize()}ing module: {module_name}")
        
        # Execute the module toggle command
        success, message, toggle_result = utils.execute_update_manager(action, target=module_name)
        
        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] Module toggle completed in {operation_time:.2f} seconds")
        
        if not success:
            logger.error(f"[UPDATEMAN] Module toggle failed: {message}")
            write_to_log('admin', f'Failed to {action} module {module_name}: {message}', 'error')
            return error_response(f"Failed to {action} module: {message}")
        
        logger.info(f"[UPDATEMAN] Module {module_name} {action}d successfully")
        write_to_log('admin', f'Module {module_name} {action}d successfully', 'info')
        
        return success_response(
            message=f"Module {module_name} {action}d successfully",
            details={
                "moduleName": module_name,
                "enabled": enabled,
                "action": action,
                "toggleResult": toggle_result,
                "toggleTime": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )
        
    except Exception as e:
        logger.error(f"[UPDATEMAN] Error toggling module: {str(e)}")
        return error_response(f"Failed to toggle module: {str(e)}")

@bp.route('/api/admin/updates/modules/<module_name>/components/<component_name>/toggle', methods=['POST'])
@admin_required
def toggle_component(module_name, component_name):
    """
    Enable or disable a specific component within a module.
    
    Args:
        module_name: Name of the module containing the component
        component_name: Name of the component to toggle
        
    Expected JSON payload:
    {
        "enabled": bool     # True to enable, False to disable
    }
    """
    try:
        data = request.get_json()
        logger.info(f"[UPDATEMAN] Toggle component {module_name}/{component_name} request: {json.dumps(data, indent=2)}")
        start_time = time.time()
        
        if not data or 'enabled' not in data:
            return error_response("Missing 'enabled' field in request")
        
        # Validate names
        if not module_name or not module_name.replace('_', '').replace('-', '').isalnum():
            return error_response("Invalid module name")
        if not component_name or not component_name.replace('_', '').replace('-', '').isalnum():
            return error_response("Invalid component name")
        
        enabled = bool(data['enabled'])
        action = "enable-component" if enabled else "disable-component"
        
        logger.info(f"[UPDATEMAN] {action.replace('-', ' ').capitalize()}ing component: {module_name}/{component_name}")
        
        # Execute the component toggle command
        success, message, toggle_result = utils.execute_update_manager(
            action, 
            target=module_name, 
            component=component_name
        )
        
        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] Component toggle completed in {operation_time:.2f} seconds")
        
        if not success:
            logger.error(f"[UPDATEMAN] Component toggle failed: {message}")
            write_to_log('admin', f'Failed to {action.replace("-", " ")} {module_name}/{component_name}: {message}', 'error')
            return error_response(f"Failed to {action.replace('-', ' ')} component: {message}")
        
        logger.info(f"[UPDATEMAN] Component {module_name}/{component_name} {action.replace('-component', '')}d successfully")
        write_to_log('admin', f'Component {module_name}/{component_name} {action.replace("-component", "")}d successfully', 'info')
        
        return success_response(
            message=f"Component {module_name}/{component_name} {action.replace('-component', '')}d successfully",
            details={
                "moduleName": module_name,
                "componentName": component_name,
                "enabled": enabled,
                "action": action,
                "toggleResult": toggle_result,
                "toggleTime": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )
        
    except Exception as e:
        logger.error(f"[UPDATEMAN] Error toggling component: {str(e)}")
        return error_response(f"Failed to toggle component: {str(e)}")

@bp.route('/api/admin/updates/logs', methods=['GET'])
@admin_required
def get_update_logs():
    """
    Retrieve recent update operation logs.
    
    Query parameters:
        limit: Number of log entries to return (default: 50, max: 200)
        level: Log level filter ('info', 'warning', 'error', 'all')
    """
    try:
        logger.info("[UPDATEMAN] Retrieving update logs")
        start_time = time.time()
        
        # Get query parameters
        limit = min(int(request.args.get('limit', 50)), 200)
        level = request.args.get('level', 'all')
        
        if level not in ['info', 'warning', 'error', 'all']:
            return error_response("Invalid log level filter")
        
        # Get update logs
        success, message, logs_info = utils.get_update_logs(limit=limit, level=level)
        
        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] Log retrieval completed in {operation_time:.2f} seconds")
        
        if not success:
            logger.error(f"[UPDATEMAN] Log retrieval failed: {message}")
            return error_response(f"Failed to retrieve logs: {message}")
        
        logger.info(f"[UPDATEMAN] Retrieved {len(logs_info.get('logs', []))} log entries")
        
        return success_response(
            message="Update logs retrieved successfully",
            details={
                "logs": logs_info.get("logs", []),
                "totalEntries": len(logs_info.get("logs", [])),
                "limit": limit,
                "level": level,
                "retrievalTime": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )
        
    except Exception as e:
        logger.error(f"[UPDATEMAN] Error retrieving logs: {str(e)}")
        return error_response(f"Failed to retrieve logs: {str(e)}")

@bp.route('/api/admin/updates/logfile', methods=['GET'])
@admin_required
def get_update_logfile():
    """
    Return the raw contents of the update manager logfile for display in the UI.
    Optional query param `lines` to limit to last N lines (default 500, max 5000).
    """
    try:
        logger.info("[UPDATEMAN] Retrieving raw update logfile contents")
        start_time = time.time()

        if not os.path.exists(UPDATE_LOG_PATH):
            logger.warning(f"[UPDATEMAN] Update logfile not found at {UPDATE_LOG_PATH}")
            return error_response("Update logfile not found")

        # Optional tail size: if provided, tail; otherwise return full file
        lines = None
        if 'lines' in request.args:
            try:
                lines_val = int(request.args.get('lines', 500))
                lines = max(1, min(lines_val, 5000))
            except Exception:
                lines = 500

        # Use sudo to ensure permission to read logfile
        success, stdout, stderr = execute_command(["sudo", "/usr/bin/cat", UPDATE_LOG_PATH])
        if not success:
            logger.error(f"[UPDATEMAN] Failed to read logfile: {stderr}")
            return error_response(f"Failed to read logfile: {stderr}")

        # Tail last N lines only if requested; otherwise return full content
        if lines is not None:
            content_lines = stdout.splitlines()
            content = '\n'.join(content_lines[-lines:])
            total_lines = len(content_lines)
            lines_returned = min(lines, total_lines)
        else:
            content = stdout
            total_lines = len(stdout.splitlines())
            lines_returned = total_lines

        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] Logfile retrieval completed in {operation_time:.2f} seconds")

        return success_response(
            message="Update logfile retrieved successfully",
            details={
                "path": UPDATE_LOG_PATH,
                "lines": lines_returned,
                "totalLines": total_lines,
                "content": content,
                "retrievalTime": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )

    except Exception as e:
        logger.error(f"[UPDATEMAN] Error retrieving logfile: {str(e)}")
        return error_response(f"Failed to retrieve logfile: {str(e)}")

@bp.route('/api/admin/updates/system-info', methods=['GET'])
@admin_required
def get_system_info():
    """
    Get system information relevant to updates, including homeserver config data.
    
    Returns:
        JSON response with system update information
    """
    try:
        logger.info("[UPDATEMAN] Getting system update information")
        start_time = time.time()
        
        # Get system information from utils
        success, message, system_info = utils.get_system_update_info()
        
        # Read homeserver config for version info
        homeserver_info = {}
        try:
            if os.path.exists(HOMESERVER_CONFIG_PATH):
                with open(HOMESERVER_CONFIG_PATH, 'r') as f:
                    config_data = json.load(f)
                    homeserver_info = config_data.get('global', {}).get('version', {})
                    logger.info(f"[UPDATEMAN] Read homeserver config version info: {homeserver_info}")
            else:
                logger.warning(f"[UPDATEMAN] Homeserver config not found at {HOMESERVER_CONFIG_PATH}")
        except Exception as config_error:
            logger.error(f"[UPDATEMAN] Error reading homeserver config: {str(config_error)}")
        
        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] System info retrieval completed in {operation_time:.2f} seconds")
        
        if not success:
            logger.error(f"[UPDATEMAN] System info retrieval failed: {message}")
            return error_response(f"Failed to get system info: {message}")
        
        logger.info("[UPDATEMAN] System update information retrieved successfully")
        
        return success_response(
            message="System update information retrieved successfully",
            details={
                "systemInfo": system_info,
                "homeserverVersion": homeserver_info,
                "retrievalTime": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )
        
    except Exception as e:
        logger.error(f"[UPDATEMAN] Error getting system info: {str(e)}")
        return error_response(f"Failed to get system info: {str(e)}")

@bp.route('/api/admin/updates/schedule', methods=['GET'])
@admin_required
def get_update_schedule():
    """
    Get the current update schedule configuration.
    
    Returns:
        JSON response with current schedule settings
    """
    try:
        logger.info("[UPDATEMAN] Getting update schedule")
        start_time = time.time()
        
        # Get current cron job configuration
        success, message, cron_data = utils.get_update_cron_job()
        
        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] Schedule retrieval completed in {operation_time:.2f} seconds")
        
        if not success:
            logger.error(f"[UPDATEMAN] Schedule retrieval failed: {message}")
            return error_response(f"Failed to get update schedule: {message}")
        
        # Convert cron data to frontend format
        schedule_config = {
            "enabled": cron_data.get("enabled", False),
            "frequency": "weekly",
            "time": "03:00",
            "dayOfWeek": 0,
            "dayOfMonth": 1
        }
        
        if cron_data.get("parsed_schedule"):
            parsed = cron_data["parsed_schedule"]
            if "error" not in parsed:
                schedule_config.update({
                    "frequency": parsed.get("frequency", "weekly"),
                    "time": parsed.get("time", "03:00"),
                    "dayOfWeek": parsed.get("dayOfWeek", 0),
                    "dayOfMonth": parsed.get("dayOfMonth", 1)
                })
        
        logger.info("[UPDATEMAN] Update schedule retrieved successfully")
        
        return success_response(
            message="Update schedule retrieved successfully",
            details={
                "schedule": schedule_config,
                "cronData": cron_data,
                "retrievalTime": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )
        
    except Exception as e:
        logger.error(f"[UPDATEMAN] Error getting update schedule: {str(e)}")
        return error_response(f"Failed to get update schedule: {str(e)}")

@bp.route('/api/admin/updates/schedule', methods=['POST'])
@admin_required
def set_update_schedule():
    """
    Set or update the automatic update schedule.
    
    Expected JSON payload:
    {
        "enabled": bool,
        "frequency": "daily"|"weekly"|"monthly",
        "time": "HH:MM",
        "dayOfWeek": int (0-6, for weekly),
        "dayOfMonth": int (1-31, for monthly)
    }
    """
    try:
        data = request.get_json() or {}
        logger.info(f"[UPDATEMAN] Set update schedule request: {json.dumps(data, indent=2)}")
        start_time = time.time()
        
        # Validate required fields
        if 'enabled' not in data:
            return error_response("Missing 'enabled' field in request")
        
        enabled = bool(data['enabled'])
        
        # If enabling, validate schedule parameters
        if enabled:
            frequency = data.get('frequency', 'weekly')
            if frequency not in ['daily', 'weekly', 'monthly']:
                return error_response(f"Invalid frequency: {frequency}")
            
            time_str = data.get('time', '03:00')
            if not re.match(r'^\d{1,2}:\d{2}$', time_str):
                return error_response(f"Invalid time format: {time_str}")
            
            # Validate time values
            try:
                hour, minute = time_str.split(':')
                hour, minute = int(hour), int(minute)
                if not (0 <= hour <= 23) or not (0 <= minute <= 59):
                    return error_response("Time values out of range")
            except ValueError:
                return error_response("Invalid time format")
            
            # Validate frequency-specific parameters
            if frequency == 'weekly':
                day_of_week = data.get('dayOfWeek', 0)
                if not isinstance(day_of_week, int) or not (0 <= day_of_week <= 6):
                    return error_response("Invalid dayOfWeek (must be 0-6)")
            elif frequency == 'monthly':
                day_of_month = data.get('dayOfMonth', 1)
                if not isinstance(day_of_month, int) or not (1 <= day_of_month <= 31):
                    return error_response("Invalid dayOfMonth (must be 1-31)")
        
        # Set the cron job
        success, message, cron_result = utils.set_update_cron_job(data)
        
        operation_time = time.time() - start_time
        logger.info(f"[UPDATEMAN] Schedule update completed in {operation_time:.2f} seconds")
        
        if not success:
            logger.error(f"[UPDATEMAN] Schedule update failed: {message}")
            write_to_log('admin', f'Update schedule configuration failed: {message}', 'error')
            return error_response(f"Failed to set update schedule: {message}")
        
        status_text = 'enabled' if enabled else 'disabled'
        logger.info(f"[UPDATEMAN] Update schedule {status_text} successfully")
        write_to_log('admin', f'Update schedule {status_text} successfully', 'info')
        
        return success_response(
            message=f"Update schedule {status_text} successfully",
            details={
                "schedule": data,
                "cronResult": cron_result,
                "setTime": int(time.time()),
                "operationTime": f"{operation_time:.2f} seconds"
            }
        )
        
    except Exception as e:
        logger.error(f"[UPDATEMAN] Error setting update schedule: {str(e)}")
        return error_response(f"Failed to set update schedule: {str(e)}")
