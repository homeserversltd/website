"""
Premium tab management routes.
"""
from flask import request, jsonify
from .. import bp
from ...auth.decorators import admin_required
from .git_manager import validate_and_clone_repository
from .installer_interface import (
    install_single_tab, uninstall_single_tab,
    install_all_tabs, uninstall_all_tabs,
    get_tab_status_list, reinstall_single_tab, reinstall_multiple_tabs
)
from .utils import get_installer_logs, delete_premium_tab_folder, update_tab_auto_update_setting
from ...utils.utils import write_to_log


@bp.route('/api/admin/premium/validate-and-clone', methods=['POST'])
@admin_required
def validate_and_clone():
    """Validate git repository structure and clone if valid."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "Request body is required"}), 400
        
        git_url = data.get('gitUrl')
        branch = data.get('branch', 'main')
        
        if not git_url:
            return jsonify({"success": False, "error": "gitUrl is required"}), 400
        
        write_to_log('premium', f'Validating and cloning repository: {git_url}', 'info')
        
        result = validate_and_clone_repository(git_url, branch)
        
        if result['success']:
            write_to_log('premium', f'Successfully cloned tab: {result["tabName"]}', 'info')
            return jsonify(result), 200
        else:
            write_to_log('premium', f'Failed to clone repository: {result["error"]}', 'error')
            # If validation provided details, log them explicitly for operator visibility
            try:
                if 'undeclared_files' in result:
                    count = len(result.get('undeclared_files', []))
                    write_to_log('premium', f"Undeclared files reported by validator: {count}", 'error')
                    # Log top offenders to avoid log spam; full list already logged in validator
                    for fp in sorted(result.get('undeclared_files', [])[:25]):
                        write_to_log('premium', f"(sample) Undeclared file: {fp}", 'error')
                if 'missing_files' in result:
                    write_to_log('premium', f"Declared-but-missing files: {len(result.get('missing_files', []))}", 'error')
                    for fp in sorted(result.get('missing_files', [])[:25]):
                        write_to_log('premium', f"(sample) Missing declared file: {fp}", 'error')
            except Exception:
                pass
            return jsonify(result), 400
            
    except Exception as e:
        write_to_log('premium', f'Exception in validate-and-clone: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/install/<tab_name>', methods=['POST'])
@admin_required
def install_tab(tab_name):
    """Install a single premium tab."""
    try:
        
        result = install_single_tab(tab_name)
        
        if result['success']:
            write_to_log('premium', f'Successfully installed tab: {tab_name}', 'info')
            return jsonify(result), 200
        else:
            write_to_log('premium', f'Failed to install tab {tab_name}: {result["error"]}', 'error')
            return jsonify(result), 400
            
    except Exception as e:
        write_to_log('premium', f'Exception installing tab {tab_name}: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/uninstall/<tab_name>', methods=['DELETE'])
@admin_required
def uninstall_tab(tab_name):
    """Uninstall a single premium tab."""
    try:
        
        result = uninstall_single_tab(tab_name)
        
        if result['success']:
            write_to_log('premium', f'Successfully uninstalled tab: {tab_name}', 'info')
            return jsonify(result), 200
        else:
            write_to_log('premium', f'Failed to uninstall tab {tab_name}: {result["error"]}', 'error')
            return jsonify(result), 400
            
    except Exception as e:
        write_to_log('premium', f'Exception uninstalling tab {tab_name}: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/reinstall/<tab_name>', methods=['POST'])
@admin_required
def reinstall_tab(tab_name):
    """Reinstall a single premium tab."""
    try:
        write_to_log('premium', f'Starting reinstallation of tab: {tab_name}', 'info')
        
        result = reinstall_single_tab(tab_name)
        
        if result['success']:
            write_to_log('premium', f'Successfully reinstalled tab: {tab_name}', 'info')
            return jsonify(result), 200
        else:
            write_to_log('premium', f'Failed to reinstall tab {tab_name}: {result["error"]}', 'error')
            return jsonify(result), 400
            
    except Exception as e:
        write_to_log('premium', f'Exception reinstalling tab {tab_name}: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/reinstall-multiple', methods=['POST'])
@admin_required
def reinstall_multiple_tabs():
    """Reinstall multiple premium tabs."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "Request body is required"}), 400
        
        tab_names = data.get('tabNames', [])
        defer_build = data.get('deferBuild', True)
        defer_service_restart = data.get('deferServiceRestart', True)
        
        if not tab_names:
            return jsonify({"success": False, "error": "tabNames array is required"}), 400
        
        write_to_log('premium', f'Starting reinstallation of tabs: {", ".join(tab_names)}', 'info')
        
        result = reinstall_multiple_tabs(tab_names, defer_build, defer_service_restart)
        
        if result['success']:
            write_to_log('premium', f'Successfully started reinstallation of tabs: {", ".join(tab_names)}', 'info')
            return jsonify(result), 200
        else:
            write_to_log('premium', f'Failed to reinstall tabs: {result["error"]}', 'error')
            return jsonify(result), 400
            
    except Exception as e:
        write_to_log('premium', f'Exception reinstalling multiple tabs: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/delete/<tab_name>', methods=['DELETE'])
@admin_required
def delete_tab(tab_name):
    """Permanently delete a premium tab folder from the filesystem."""
    try:
        result = delete_premium_tab_folder(tab_name, get_tab_status_list)
        
        if result['success']:
            return jsonify(result), 200
        else:
            # Check if it's a permission/security error (403) or validation error (400)
            if 'protected' in result.get('error', '').lower():
                return jsonify(result), 403
            elif 'installed' in result.get('error', '').lower():
                return jsonify(result), 400
            elif 'does not exist' in result.get('error', '').lower():
                return jsonify(result), 404
            else:
                return jsonify(result), 500
            
    except Exception as e:
        write_to_log('premium', f'Exception in delete_tab route: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/status', methods=['GET'])
@admin_required
def get_status():
    """Get all tabs with installation status and conflict information."""
    try:
        
        result = get_tab_status_list()
        
        if result['success']:
            return jsonify(result), 200
        else:
            write_to_log('premium', f'Failed to get status: {result["error"]}', 'error')
            return jsonify(result), 500
            
    except Exception as e:
        write_to_log('premium', f'Exception getting status: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/install-all', methods=['POST'])
@admin_required
def install_all():
    """Install all available premium tabs."""
    try:
        write_to_log('premium', 'Starting installation of all tabs', 'info')
        
        result = install_all_tabs()
        
        if result['success']:
            write_to_log('premium', 'Successfully started installation of all tabs', 'info')
            return jsonify(result), 200
        else:
            write_to_log('premium', f'Failed to install all tabs: {result["error"]}', 'error')
            return jsonify(result), 400
            
    except Exception as e:
        write_to_log('premium', f'Exception installing all tabs: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/uninstall-all', methods=['POST'])
@admin_required
def uninstall_all():
    """Uninstall all installed premium tabs."""
    try:
        write_to_log('premium', 'Starting uninstallation of all tabs', 'info')
        
        result = uninstall_all_tabs()
        
        if result['success']:
            write_to_log('premium', 'Successfully started uninstallation of all tabs', 'info')
            return jsonify(result), 200
        else:
            write_to_log('premium', f'Failed to uninstall all tabs: {result["error"]}', 'error')
            return jsonify(result), 400
            
    except Exception as e:
        write_to_log('premium', f'Exception uninstalling all tabs: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/logs', methods=['GET'])
@admin_required
def get_logs():
    """Get the last installer operation logs."""
    try:
        result = get_installer_logs()
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        write_to_log('premium', f'Exception getting logs: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/auto-update/<tab_name>', methods=['GET'])
@admin_required
def get_auto_update_setting(tab_name):
    """Get auto-update setting for a premium tab."""
    try:
        from .utils import get_tab_auto_update_setting
        result = get_tab_auto_update_setting(tab_name)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
            
    except Exception as e:
        write_to_log('premium', f'Exception getting auto-update setting for {tab_name}: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/auto-update/<tab_name>', methods=['POST'])
@admin_required
def toggle_auto_update(tab_name):
    """Toggle auto-update setting for a premium tab."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "Request body is required"}), 400
        
        enabled = data.get('enabled')
        if enabled is None:
            return jsonify({"success": False, "error": "enabled field is required"}), 400
        
        write_to_log('premium', f'Toggling auto-update for {tab_name}: {enabled}', 'info')
        
        result = update_tab_auto_update_setting(tab_name, enabled)
        
        if result['success']:
            write_to_log('premium', f'Successfully updated auto-update setting for {tab_name}', 'info')
            return jsonify(result), 200
        else:
            write_to_log('premium', f'Failed to update auto-update setting for {tab_name}: {result["error"]}', 'error')
            return jsonify(result), 400
            
    except Exception as e:
        write_to_log('premium', f'Exception toggling auto-update for {tab_name}: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500


@bp.route('/api/admin/premium/auto-update-status', methods=['GET'])
@admin_required
def get_auto_update_status():
    """Get auto-update eligibility and status for all premium tabs."""
    try:
        write_to_log('premium', 'Getting auto-update status for all tabs', 'info')
        
        from .utils import get_all_tabs_auto_update_status
        result = get_all_tabs_auto_update_status()
        
        if result['success']:
            return jsonify(result), 200
        else:
            write_to_log('premium', f'Failed to get auto-update status: {result["error"]}', 'error')
            return jsonify(result), 500
            
    except Exception as e:
        write_to_log('premium', f'Exception getting auto-update status: {str(e)}', 'error')
        return jsonify({"success": False, "error": f"Internal server error: {str(e)}"}), 500