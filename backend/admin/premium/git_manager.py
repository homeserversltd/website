"""
Git repository management for premium tabs.
Handles validation and cloning of premium tab repositories.
"""
import os
import json
import shutil
import subprocess
import uuid
from typing import Dict, Any
from ...utils.utils import execute_command, write_to_log


def validate_and_clone_repository(git_url: str, branch: str = "main") -> Dict[str, Any]:
    """
    Validate git repository structure and clone if valid.
    
    This function performs comprehensive validation:
    1. Clone to temporary directory for validation
    2. Check required files exist
    3. Parse and validate root manifest
    4. Ensure all files are declared in manifest (security)
    5. Check for missing declared files
    6. Move to premium directory if valid
    
    Args:
        git_url: Git repository URL to clone
        branch: Git branch to clone (default: main)
        
    Returns:
        Dict with success status, tab name if successful, or error message
    """
    temp_dir = None
    
    try:
        # 1. Clone to temporary directory for validation
        temp_dir = f"/tmp/premium_validation_{uuid.uuid4()}"
        write_to_log('premium', f'Cloning to temporary directory: {temp_dir}', 'info')
        
        success, stdout, stderr = execute_command([
            'git', 'clone', '--depth', '1', '--branch', branch, git_url, temp_dir
        ])
        
        if not success:
            return {
                "success": False, 
                "error": f"Failed to clone repository: {stderr}"
            }
        
        # 2. Check required files exist
        required_files = [
            f"{temp_dir}/index.json",
            f"{temp_dir}/backend/index.json", 
            f"{temp_dir}/frontend/index.json",
            f"{temp_dir}/homeserver.patch.json"
        ]
        
        missing_files = [f for f in required_files if not os.path.exists(f)]
        if missing_files:
            _cleanup_temp_dir(temp_dir)
            missing_names = [os.path.basename(f) for f in missing_files]
            return {
                "success": False, 
                "error": f"Invalid premium tab structure - missing required files: {', '.join(missing_names)}"
            }
        
        # 3. Parse root manifest
        try:
            with open(f"{temp_dir}/index.json") as f:
                manifest = json.load(f)
            tab_name = manifest.get("name")
            
            if not tab_name:
                _cleanup_temp_dir(temp_dir)
                return {
                    "success": False, 
                    "error": "Invalid root manifest: 'name' field is required"
                }
                
        except json.JSONDecodeError as e:
            _cleanup_temp_dir(temp_dir)
            return {
                "success": False, 
                "error": f"Invalid root manifest JSON: {str(e)}"
            }
        except KeyError as e:
            _cleanup_temp_dir(temp_dir)
            return {
                "success": False, 
                "error": f"Invalid root manifest: missing required field {str(e)}"
            }
        
        # 4. Validate manifest completeness - every file must be declared
        validation_result = _validate_manifest_completeness(temp_dir, manifest, tab_name)
        if not validation_result["success"]:
            _cleanup_temp_dir(temp_dir)
            return validation_result
        
        # 5. Check if tab already exists
        target_path = f"/var/www/homeserver/premium/{tab_name}"
        if os.path.exists(target_path):
            _cleanup_temp_dir(temp_dir)
            return {
                "success": False, 
                "error": f"Tab '{tab_name}' already exists"
            }
        
        # 6. Move to premium directory and set permissions
        write_to_log('premium', f'Moving validated repository to: {target_path}', 'info')
        
        # Ensure premium directory exists
        os.makedirs("/var/www/homeserver/premium", exist_ok=True)
        
        # Move the validated repository
        shutil.move(temp_dir, target_path)
        
        # 7. Update dependencies.json with git metadata if it exists
        dependencies_file = os.path.join(target_path, "system", "dependencies.json")
        if os.path.exists(dependencies_file):
            try:
                write_to_log('premium', f'Adding git metadata to dependencies.json for {tab_name}', 'info')
                
                # Read current dependencies.json
                with open(dependencies_file, 'r') as f:
                    deps_data = json.load(f)
                
                # Add git metadata to the metadata section
                if "metadata" not in deps_data:
                    deps_data["metadata"] = {}
                
                deps_data["metadata"]["git_repository"] = git_url
                deps_data["metadata"]["git_branch"] = branch
                
                # Write back the updated dependencies.json
                with open(dependencies_file, 'w') as f:
                    json.dump(deps_data, f, indent=2)
                
                write_to_log('premium', f'Successfully added git metadata to {tab_name}', 'info')
                
            except Exception as e:
                write_to_log('premium', f'Warning: Failed to update dependencies.json with git metadata: {str(e)}', 'warning')
                # Don't fail the entire operation for this
        
        # 8. Set proper permissions
        success, stdout, stderr = execute_command([
            'chown', '-R', 'www-data:www-data', target_path
        ])
        
        if not success:
            write_to_log('premium', f'Warning: Failed to set permissions on {target_path}: {stderr}', 'warning')
        
        write_to_log('premium', f'Successfully cloned and validated tab: {tab_name}', 'info')
        
        return {
            "success": True, 
            "tabName": tab_name, 
            "cloned": True,
            "error": None
        }
        
    except Exception as e:
        if temp_dir:
            _cleanup_temp_dir(temp_dir)
        write_to_log('premium', f'Exception in validate_and_clone_repository: {str(e)}', 'error')
        return {
            "success": False, 
            "error": f"Validation failed: {str(e)}"
        }


def _validate_manifest_completeness(temp_dir: str, manifest: Dict[str, Any], tab_name: str) -> Dict[str, Any]:
    """
    Validate that all files in the package are declared in the manifest.
    This is a security measure to ensure no undeclared files are included.
    """
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
                        if isinstance(nested_path, str):
                            rel_path = nested_path.lstrip('/').replace(f'{tab_name}/', '')
                            declared_files.add(rel_path)
        
        # Check for undeclared files
        undeclared_files = []
        for file_path in all_files:
            if file_path not in declared_files:
                undeclared_files.append(file_path)
        
        if undeclared_files:
            # Return detailed information about undeclared files
            return {
                "success": False, 
                "error": "Security violation: Undeclared files found in package",
                "undeclared_files": undeclared_files,
                "total_undeclared": len(undeclared_files),
                "declared_files": list(declared_files),
                "all_files": all_files
            }
        
        # Check for missing declared files
        missing_files = []
        for declared_file in declared_files:
            if declared_file not in all_files:
                missing_files.append(declared_file)
        
        if missing_files:
            return {
                "success": False,
                "error": f"Declared files missing from package: {', '.join(missing_files)}",
                "missing_files": missing_files
            }
        
        return {"success": True}
        
    except Exception as e:
        return {
            "success": False,
            "error": f"Manifest validation failed: {str(e)}"
        }


def _cleanup_temp_dir(temp_dir: str) -> None:
    """Safely remove temporary directory."""
    try:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
            write_to_log('premium', f'Cleaned up temporary directory: {temp_dir}', 'info')
    except Exception as e:
        write_to_log('premium', f'Failed to cleanup temporary directory {temp_dir}: {str(e)}', 'warning')
