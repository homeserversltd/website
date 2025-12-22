# -*- coding: utf-8 -*-
"""
Utility functions for nasLinker backend.
Wraps linker core functionality with /mnt/nas path validation.
"""

import pathlib
import sys
import os
import importlib.util
from typing import Optional, List, Dict, Any

# Hardcoded paths to linker modules
LINKER_BASE = pathlib.Path('/usr/local/lib/linker')
CORE_PATH = LINKER_BASE / 'core.py'
LINK_INDEX_PATH = LINKER_BASE / 'link_index.py'
PERMISSIONS_HELPER_PATH = LINKER_BASE / 'permissions_helper.py'
LOGGER_UTILS_PATH = LINKER_BASE / 'logger_utils.py'
CONFIG_PATH = LINKER_BASE / 'config.py'

def load_module_from_path(module_name: str, file_path: pathlib.Path):
    """Load a module directly from a file path."""
    if not file_path.exists():
        raise ImportError(f"Module file not found: {file_path}")
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Failed to create spec for {file_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

# Load linker modules directly from hardcoded paths
# Use namespaced module names to avoid conflicts
try:
    # Temporarily add linker directory to path and set up module aliases
    linker_path = str(LINKER_BASE)
    if linker_path not in sys.path:
        sys.path.insert(0, linker_path)
    
    # Save original modules if they exist
    original_modules = {}
    linker_module_names = ['config', 'logger_utils', 'permissions_helper', 'link_index', 'core']
    for name in linker_module_names:
        if name in sys.modules:
            original_modules[name] = sys.modules[name]
    
    # Load config first as 'config' so logger_utils can import it
    config_module = load_module_from_path('config', CONFIG_PATH)
    
    # Load logger_utils as 'logger_utils' so core can import it
    logger_utils_module = load_module_from_path('logger_utils', LOGGER_UTILS_PATH)
    get_logger = logger_utils_module.get_logger
    
    # Load permissions_helper as 'permissions_helper' so core can import it
    permissions_helper_module = load_module_from_path('permissions_helper', PERMISSIONS_HELPER_PATH)
    get_app_permissions_for_path = permissions_helper_module.get_app_permissions_for_path
    set_file_ownership_and_permissions = permissions_helper_module.set_file_ownership_and_permissions
    
    # Load link_index
    link_index_module = load_module_from_path('link_index', LINK_INDEX_PATH)
    scan_hardlinks = link_index_module.scan_hardlinks
    HardlinkEntry = link_index_module.HardlinkEntry
    
    # Load core (needs logger_utils and permissions_helper - will find them now)
    core_module = load_module_from_path('core', CORE_PATH)
    create_hardlink = core_module.create_hardlink
    
    # Restore original modules to avoid conflicts
    for name, module in original_modules.items():
        sys.modules[name] = module
    
    # Remove linker path from sys.path
    if linker_path in sys.path:
        sys.path.remove(linker_path)
        
except Exception as e:
    raise ImportError(f"Failed to import linker modules from {LINKER_BASE}: {e}")

logger = get_logger("nasLinker.backend")

# Base directory restriction
NAS_BASE = pathlib.Path('/mnt/nas')


def validate_nas_path(path: str | pathlib.Path) -> tuple[bool, Optional[pathlib.Path]]:
    """
    Validate that a path is within /mnt/nas directory.
    
    Args:
        path: Path string or Path object to validate
        
    Returns:
        Tuple of (is_valid, resolved_path)
        If invalid, resolved_path is None
    """
    try:
        resolved = pathlib.Path(path).resolve()
        
        # Ensure path is within /mnt/nas
        if not str(resolved).startswith(str(NAS_BASE)):
            logger.warning(f"Path outside /mnt/nas: {resolved}")
            return False, None
            
        # Ensure /mnt/nas exists and is accessible
        if not NAS_BASE.exists():
            logger.error(f"/mnt/nas does not exist")
            return False, None
            
        return True, resolved
    except Exception as e:
        logger.error(f"Error validating path {path}: {e}")
        return False, None


def browse_directory(path: str) -> Dict[str, Any]:
    """
    Browse directory contents, restricted to /mnt/nas.
    
    Args:
        path: Directory path to browse
        
    Returns:
        Dictionary with directory contents and metadata
    """
    is_valid, resolved_path = validate_nas_path(path)
    if not is_valid or resolved_path is None:
        return {
            'success': False,
            'error': 'Invalid path or path outside /mnt/nas'
        }
    
    if not resolved_path.is_dir():
        return {
            'success': False,
            'error': 'Path is not a directory'
        }
    
    try:
        entries = []
        hardlinks = scan_hardlinks(resolved_path)
        hardlink_map = {e.path.name: e for e in hardlinks if not e.is_dir}
        
        for item in resolved_path.iterdir():
            # Skip dot files and hidden files (files/directories starting with .)
            if item.name.startswith('.'):
                continue
            
            try:
                stat = item.stat()
                is_dir = item.is_dir()
                is_hardlink = False
                nlink = 1
                
                if not is_dir and item.name in hardlink_map:
                    is_hardlink = hardlink_map[item.name].is_hardlink
                    nlink = hardlink_map[item.name].nlink
                
                entries.append({
                    'name': item.name,
                    'path': str(item),
                    'is_dir': is_dir,
                    'is_hardlink': is_hardlink,
                    'nlink': nlink,
                    'size': stat.st_size if not is_dir else None,
                    'modified': stat.st_mtime
                })
            except (OSError, PermissionError) as e:
                logger.warning(f"Error accessing {item}: {e}")
                continue
        
        # Sort: directories first, then by name
        entries.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
        
        return {
            'success': True,
            'path': str(resolved_path),
            'entries': entries,
            'parent': str(resolved_path.parent) if resolved_path != NAS_BASE else None
        }
    except Exception as e:
        logger.error(f"Error browsing directory {resolved_path}: {e}")
        return {
            'success': False,
            'error': str(e)
        }


def deploy_hardlinks(sources: List[str], destination: str, conflict_strategy: str = 'rename') -> Dict[str, Any]:
    """
    Create hardlinks from source paths to destination directory.
    
    Args:
        sources: List of source file/directory paths
        destination: Destination directory path
        conflict_strategy: How to handle conflicts ('fail', 'skip', 'overwrite', 'rename')
        
    Returns:
        Dictionary with deployment results
    """
    is_valid, dest_path = validate_nas_path(destination)
    if not is_valid or dest_path is None:
        return {
            'success': False,
            'error': 'Invalid destination path or path outside /mnt/nas'
        }
    
    if not dest_path.is_dir():
        return {
            'success': False,
            'error': 'Destination is not a directory'
        }
    
    results = {
        'success': True,
        'success_count': 0,
        'fail_count': 0,
        'errors': []
    }
    
    for source_str in sources:
        is_valid, source_path = validate_nas_path(source_str)
        if not is_valid or source_path is None:
            results['fail_count'] += 1
            results['errors'].append(f"Invalid source path: {source_str}")
            continue
        
        if not source_path.exists():
            results['fail_count'] += 1
            results['errors'].append(f"Source does not exist: {source_str}")
            continue
        
        try:
            success = create_hardlink(
                source=source_path,
                destination_dir=dest_path,
                name=None,
                conflict_strategy=conflict_strategy
            )
            
            if success:
                results['success_count'] += 1
            else:
                results['fail_count'] += 1
                results['errors'].append(f"Failed to create hardlink: {source_str}")
        except Exception as e:
            logger.error(f"Error creating hardlink {source_str} -> {dest_path}: {e}")
            results['fail_count'] += 1
            results['errors'].append(f"Error: {str(e)}")
    
    return results


def delete_item(path: str) -> Dict[str, Any]:
    """
    Delete a file or directory (if empty or contains only hardlinks).
    
    Args:
        path: Path to delete
        
    Returns:
        Dictionary with deletion result
    """
    is_valid, resolved_path = validate_nas_path(path)
    if not is_valid or resolved_path is None:
        return {
            'success': False,
            'error': 'Invalid path or path outside /mnt/nas'
        }
    
    try:
        if resolved_path.is_file():
            resolved_path.unlink()
            return {'success': True, 'message': f'Deleted file: {resolved_path.name}'}
        
        elif resolved_path.is_dir():
            # Check if directory is empty or contains only hardlinks
            items = list(resolved_path.iterdir())
            
            if not items:
                resolved_path.rmdir()
                return {'success': True, 'message': f'Deleted empty directory: {resolved_path.name}'}
            
            # Check if all items are hardlinks
            only_hardlinks = True
            for item in items:
                if item.is_dir() or item.stat().st_nlink <= 1:
                    only_hardlinks = False
                    break
            
            if only_hardlinks:
                # Delete all hardlinks first
                for item in items:
                    item.unlink()
                resolved_path.rmdir()
                return {'success': True, 'message': f'Deleted directory with hardlinks: {resolved_path.name}'}
            else:
                return {
                    'success': False,
                    'error': 'Directory contains non-hardlink items. Cannot delete.'
                }
        else:
            return {
                'success': False,
                'error': 'Path is not a file or directory'
            }
    except Exception as e:
        logger.error(f"Error deleting {resolved_path}: {e}")
        return {
            'success': False,
            'error': str(e)
        }


def rename_item(path: str, new_name: str) -> Dict[str, Any]:
    """
    Rename a directory.
    
    Args:
        path: Current path
        new_name: New name
        
    Returns:
        Dictionary with rename result
    """
    is_valid, resolved_path = validate_nas_path(path)
    if not is_valid or resolved_path is None:
        return {
            'success': False,
            'error': 'Invalid path or path outside /mnt/nas'
        }
    
    if not resolved_path.is_dir():
        return {
            'success': False,
            'error': 'Can only rename directories'
        }
    
    try:
        new_path = resolved_path.parent / new_name
        
        # Validate new path is still in /mnt/nas
        is_valid, validated_new_path = validate_nas_path(new_path)
        if not is_valid:
            return {
                'success': False,
                'error': 'New name would place item outside /mnt/nas'
            }
        
        if new_path.exists():
            return {
                'success': False,
                'error': 'A file or directory with that name already exists'
            }
        
        resolved_path.rename(new_path)
        return {
            'success': True,
            'message': f'Renamed to: {new_name}',
            'new_path': str(new_path)
        }
    except Exception as e:
        logger.error(f"Error renaming {resolved_path} to {new_name}: {e}")
        return {
            'success': False,
            'error': str(e)
        }


def create_directory(parent_path: str, dir_name: str) -> Dict[str, Any]:
    """
    Create a new directory.
    
    Args:
        parent_path: Parent directory path
        dir_name: Name of new directory
        
    Returns:
        Dictionary with creation result
    """
    is_valid, parent_resolved = validate_nas_path(parent_path)
    if not is_valid or parent_resolved is None:
        return {
            'success': False,
            'error': 'Invalid parent path or path outside /mnt/nas'
        }
    
    if not parent_resolved.is_dir():
        return {
            'success': False,
            'error': 'Parent path is not a directory'
        }
    
    try:
        new_dir = parent_resolved / dir_name
        
        # Validate new directory is still in /mnt/nas
        is_valid, validated_new_dir = validate_nas_path(new_dir)
        if not is_valid:
            return {
                'success': False,
                'error': 'New directory would be outside /mnt/nas'
            }
        
        if new_dir.exists():
            return {
                'success': False,
                'error': 'A file or directory with that name already exists'
            }
        
        new_dir.mkdir()
        
        # Set permissions if needed
        perms = get_app_permissions_for_path(new_dir)
        if perms:
            set_file_ownership_and_permissions(
                new_dir,
                perms['user'],
                perms['group'],
                perms['permissions']
            )
        
        return {
            'success': True,
            'message': f'Created directory: {dir_name}',
            'path': str(new_dir)
        }
    except Exception as e:
        logger.error(f"Error creating directory {dir_name} in {parent_resolved}: {e}")
        return {
            'success': False,
            'error': str(e)
        }
