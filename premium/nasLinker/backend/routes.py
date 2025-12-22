# -*- coding: utf-8 -*-
"""
nasLinker Premium Tab Flask Blueprint

Provides API endpoints for web-based linker functionality restricted to /mnt/nas.
"""

from flask import Blueprint, request, jsonify, current_app
from .utils import (
    browse_directory,
    deploy_hardlinks,
    delete_item,
    rename_item,
    create_directory,
    validate_nas_path,
    NAS_BASE
)
import pathlib

# Create blueprint
bp = Blueprint('nasLinker', __name__, url_prefix='/api/nasLinker')


@bp.route('/browse', methods=['GET'])
def browse():
    """Browse directory contents, restricted to /mnt/nas."""
    try:
        path = request.args.get('path', str(NAS_BASE))
        result = browse_directory(path)
        
        if not result.get('success'):
            return jsonify(result), 400
        
        return jsonify(result)
    except Exception as e:
        current_app.logger.error(f"Error in browse endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/deploy', methods=['POST'])
def deploy():
    """Create hardlinks from selected items to destination directory."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        sources = data.get('sources', [])
        destination = data.get('destination')
        conflict_strategy = data.get('conflict_strategy', 'rename')
        
        if not sources:
            return jsonify({
                'success': False,
                'error': 'No sources provided'
            }), 400
        
        if not destination:
            return jsonify({
                'success': False,
                'error': 'No destination provided'
            }), 400
        
        if conflict_strategy not in ['fail', 'skip', 'overwrite', 'rename']:
            return jsonify({
                'success': False,
                'error': 'Invalid conflict strategy'
            }), 400
        
        result = deploy_hardlinks(sources, destination, conflict_strategy)
        return jsonify(result)
    except Exception as e:
        current_app.logger.error(f"Error in deploy endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/delete', methods=['DELETE'])
def delete():
    """Delete a file or directory."""
    try:
        path = request.args.get('path')
        
        if not path:
            return jsonify({
                'success': False,
                'error': 'No path provided'
            }), 400
        
        result = delete_item(path)
        
        if not result.get('success'):
            return jsonify(result), 400
        
        return jsonify(result)
    except Exception as e:
        current_app.logger.error(f"Error in delete endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/rename', methods=['POST'])
def rename():
    """Rename a directory."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        path = data.get('path')
        new_name = data.get('new_name')
        
        if not path:
            return jsonify({
                'success': False,
                'error': 'No path provided'
            }), 400
        
        if not new_name:
            return jsonify({
                'success': False,
                'error': 'No new_name provided'
            }), 400
        
        # Validate new_name doesn't contain path separators
        if '/' in new_name or '\\' in new_name:
            return jsonify({
                'success': False,
                'error': 'New name cannot contain path separators'
            }), 400
        
        result = rename_item(path, new_name)
        
        if not result.get('success'):
            return jsonify(result), 400
        
        return jsonify(result)
    except Exception as e:
        current_app.logger.error(f"Error in rename endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/newdir', methods=['POST'])
def newdir():
    """Create a new directory."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        parent_path = data.get('parent_path')
        dir_name = data.get('dir_name')
        
        if not parent_path:
            return jsonify({
                'success': False,
                'error': 'No parent_path provided'
            }), 400
        
        if not dir_name:
            return jsonify({
                'success': False,
                'error': 'No dir_name provided'
            }), 400
        
        # Validate dir_name doesn't contain path separators
        if '/' in dir_name or '\\' in dir_name:
            return jsonify({
                'success': False,
                'error': 'Directory name cannot contain path separators'
            }), 400
        
        result = create_directory(parent_path, dir_name)
        
        if not result.get('success'):
            return jsonify(result), 400
        
        return jsonify(result)
    except Exception as e:
        current_app.logger.error(f"Error in newdir endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/scan', methods=['GET'])
def scan():
    """Scan directory for hardlinks."""
    try:
        path = request.args.get('path', str(NAS_BASE))
        
        is_valid, resolved_path = validate_nas_path(path)
        if not is_valid or resolved_path is None:
            return jsonify({
                'success': False,
                'error': 'Invalid path or path outside /mnt/nas'
            }), 400
        
        if not resolved_path.is_dir():
            return jsonify({
                'success': False,
                'error': 'Path is not a directory'
            }), 400
        
        # Import scan function
        from link_index import scan_hardlinks
        
        hardlinks = scan_hardlinks(resolved_path)
        hardlink_list = [
            {
                'path': str(e.path),
                'name': e.path.name,
                'nlink': e.nlink,
                'inode': e.inode,
                'is_hardlink': e.is_hardlink,
                'is_dir': e.is_dir
            }
            for e in hardlinks
        ]
        
        return jsonify({
            'success': True,
            'path': str(resolved_path),
            'hardlinks': hardlink_list
        })
    except Exception as e:
        current_app.logger.error(f"Error in scan endpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/status', methods=['GET'])
def status():
    """Get nasLinker status and configuration."""
    return jsonify({
        'status': 'active',
        'tab_name': 'nasLinker',
        'version': '1.0.0',
        'base_directory': str(NAS_BASE),
        'features': [
            'browse',
            'deploy_hardlinks',
            'delete',
            'rename',
            'new_directory',
            'scan_hardlinks'
        ]
    })


@bp.route('/config', methods=['GET'])
def config():
    """Get nasLinker configuration."""
    return jsonify({
        'tab_name': 'nasLinker',
        'display_name': 'NAS Linker',
        'description': 'Web-based hardlink management for /mnt/nas directory',
        'version': '1.0.0',
        'base_directory': str(NAS_BASE),
        'capabilities': {
            'browse': True,
            'hardlink_creation': True,
            'delete': True,
            'rename': True,
            'create_directory': True,
            'hardlink_detection': True
        }
    })
