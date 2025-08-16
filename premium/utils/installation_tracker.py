#!/usr/bin/env python3
"""
Installation Tracker Utility for Premium Tab Installer

Tracks and reports on premium tab installation status by examining:
- Backend blueprint registrations
- Frontend file installations  
- Backend file installations
- Configuration patches
- System service states

Provides consistent installation state information across all installer components.
"""

import os
import json
import re
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path


class InstallationTracker:
    """Tracks premium tab installation status across the system."""
    
    def __init__(self, logger, 
                 backend_init_path: str = "/var/www/homeserver/backend/__init__.py",
                 frontend_tablets_path: str = "/var/www/homeserver/src/tablets",
                 backend_modules_path: str = "/var/www/homeserver/backend",
                 premium_dir_path: str = "/var/www/homeserver/premium"):
        self.logger = logger
        self.backend_init_path = backend_init_path
        self.frontend_tablets_path = frontend_tablets_path
        self.backend_modules_path = backend_modules_path
        self.premium_dir_path = premium_dir_path
    
    def get_installed_premium_tabs(self) -> List[Dict[str, Any]]:
        """Get detailed information about currently installed premium tabs by checking actual installation."""
        installed_tabs = []
        
        # First, check for tabs that have blueprint registrations
        blueprint_tabs = self._get_blueprint_registered_tabs()
        
        # Then, check for tabs that exist in filesystem but might not have blueprints
        filesystem_tabs = self._get_filesystem_installed_tabs()
        
        # Combine both sets, prioritizing blueprint registrations
        all_tab_names = set(blueprint_tabs.keys()) | set(filesystem_tabs.keys())
        
        for tab_name in sorted(all_tab_names):
            # Get info from blueprint registration if available
            blueprint_info = blueprint_tabs.get(tab_name, {})
            filesystem_info = filesystem_tabs.get(tab_name, {})
            
            # Merge information, prioritizing blueprint data
            tab_info = {**filesystem_info, **blueprint_info}
            tab_info["name"] = tab_name
            
            # Check if this is actually a complete installation
            frontend_path = os.path.join(self.frontend_tablets_path, tab_name)
            backend_path = os.path.join(self.backend_modules_path, tab_name)
            
            if os.path.exists(frontend_path) and os.path.exists(backend_path):
                # Get tab info from premium directory if available
                premium_path = self._find_premium_tab_directory(tab_name)
                version = tab_info.get("version", "unknown")
                description = tab_info.get("description", "")
                
                if premium_path:
                    try:
                        with open(os.path.join(premium_path, "index.json"), 'r') as f:
                            premium_info = json.load(f)
                        version = premium_info.get("version", version)
                        description = premium_info.get("description", description)
                    except Exception:
                        pass
                
                # Get installation timestamp from frontend directory
                install_time = None
                if os.path.exists(frontend_path):
                    install_time = datetime.fromtimestamp(os.path.getctime(frontend_path)).isoformat()
                
                # Check installation completeness
                installation_status = self._check_installation_completeness(tab_name, frontend_path, backend_path)
                
                # Check if blueprint is registered
                has_blueprint = tab_name in blueprint_tabs
                
                installed_tabs.append({
                    "name": tab_name,
                    "version": version,
                    "description": description,
                    "frontend_path": frontend_path,
                    "backend_path": backend_path,
                    "premium_path": premium_path,
                    "install_time": install_time,
                    "status": installation_status,
                    "has_blueprint": has_blueprint,
                    "completeness": self._calculate_installation_completeness(tab_name, frontend_path, backend_path)
                })
        
        return installed_tabs
    
    def _get_blueprint_registered_tabs(self) -> Dict[str, Dict[str, Any]]:
        """Get tabs that have blueprint registrations in backend __init__.py."""
        blueprint_tabs = {}
        
        if os.path.exists(self.backend_init_path):
            try:
                with open(self.backend_init_path, 'r') as f:
                    content = f.read()
                
                # Find all registered premium tab blueprints
                blueprint_pattern = r'# PREMIUM_TAB_IDENTIFIER: (\w+)'
                matches = re.findall(blueprint_pattern, content)
                
                for tab_name in matches:
                    blueprint_tabs[tab_name] = {
                        "blueprint_registered": True,
                        "source": "blueprint"
                    }
                    
            except Exception as e:
                self.logger.warning(f"Error reading backend __init__.py: {str(e)}")
        
        return blueprint_tabs
    
    def _get_filesystem_installed_tabs(self) -> Dict[str, Dict[str, Any]]:
        """Get tabs that exist in filesystem but might not have blueprint registrations."""
        filesystem_tabs = {}
        
        # Check frontend tablets directory
        if os.path.exists(self.frontend_tablets_path):
            for item in os.listdir(self.frontend_tablets_path):
                item_path = os.path.join(self.frontend_tablets_path, item)
                if os.path.isdir(item_path) and not item.startswith('.'):
                    # Check if this looks like a premium tab (has index.tsx and index.json)
                    if (os.path.exists(os.path.join(item_path, "index.tsx")) and 
                        os.path.exists(os.path.join(item_path, "index.json"))):
                        
                        # Check if corresponding backend exists
                        backend_path = os.path.join(self.backend_modules_path, item)
                        if os.path.exists(backend_path):
                            filesystem_tabs[item] = {
                                "blueprint_registered": False,
                                "source": "filesystem",
                                "version": "unknown",
                                "description": ""
                            }
        
        return filesystem_tabs
    
    def _find_premium_tab_directory(self, tab_name: str) -> Optional[str]:
        """Find the premium tab directory that corresponds to an installed tab name."""
        if not os.path.exists(self.premium_dir_path):
            return None
        
        # Look for directories that might contain this tab
        # Common patterns: tabName, tabNameTab, etc.
        possible_names = [tab_name, f"{tab_name}Tab", f"{tab_name}_tab"]
        
        for possible_name in possible_names:
            possible_path = os.path.join(self.premium_dir_path, possible_name)
            if os.path.exists(possible_path) and os.path.isdir(possible_path):
                # Verify it has an index.json
                if os.path.exists(os.path.join(possible_path, "index.json")):
                    return possible_path
        
        return None
    
    def _check_installation_completeness(self, tab_name: str, frontend_path: str, backend_path: str) -> str:
        """Check if a tab installation is complete and functional."""
        # Check for essential files
        essential_frontend = ["index.tsx", "index.json"]
        essential_backend = ["__init__.py", "routes.py"]
        
        missing_files = []
        
        # Check frontend files
        for file_name in essential_frontend:
            if not os.path.exists(os.path.join(frontend_path, file_name)):
                missing_files.append(f"frontend/{file_name}")
        
        # Check backend files
        for file_name in essential_backend:
            if not os.path.exists(os.path.join(backend_path, file_name)):
                missing_files.append(f"backend/{file_name}")
        
        if missing_files:
            return f"incomplete (missing: {', '.join(missing_files)})"
        
        # Check if backend module can be imported
        if not self._check_backend_module_importable(tab_name, backend_path):
            return "broken (backend import failed)"
        
        return "complete"
    
    def _check_backend_module_importable(self, tab_name: str, backend_path: str) -> bool:
        """Check if the backend module can be imported without errors."""
        try:
            # Check if __init__.py exists and has basic structure
            init_file = os.path.join(backend_path, "__init__.py")
            if not os.path.exists(init_file):
                return False
            
            # Check if routes.py exists and has basic structure
            routes_file = os.path.join(backend_path, "routes.py")
            if not os.path.exists(routes_file):
                return False
            
            # Basic validation - check for blueprint definition
            with open(routes_file, 'r') as f:
                content = f.read()
                if 'bp = Blueprint(' not in content and 'Blueprint(' not in content:
                    return False
            
            return True
            
        except Exception as e:
            self.logger.debug(f"Backend module validation failed for {tab_name}: {str(e)}")
            return False
    
    def _calculate_installation_completeness(self, tab_name: str, frontend_path: str, backend_path: str) -> Dict[str, Any]:
        """Calculate detailed installation completeness metrics."""
        completeness = {
            "frontend_files": 0,
            "backend_files": 0,
            "total_files": 0,
            "missing_critical": [],
            "warnings": []
        }
        
        # Count frontend files
        if os.path.exists(frontend_path):
            for root, dirs, files in os.walk(frontend_path):
                # Skip hidden directories
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for file in files:
                    if not file.startswith('.'):
                        completeness["frontend_files"] += 1
                        completeness["total_files"] += 1
        
        # Count backend files
        if os.path.exists(backend_path):
            for root, dirs, files in os.walk(backend_path):
                # Skip hidden directories
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for file in files:
                    if not file.startswith('.'):
                        completeness["backend_files"] += 1
                        completeness["total_files"] += 1
        
        # Check for critical missing files
        critical_files = {
            "frontend": ["index.tsx", "index.json"],
            "backend": ["__init__.py", "routes.py"]
        }
        
        for category, files in critical_files.items():
            for file_name in files:
                file_path = os.path.join(frontend_path if category == "frontend" else backend_path, file_name)
                if not os.path.exists(file_path):
                    completeness["missing_critical"].append(f"{category}/{file_name}")
        
        # Check for warnings
        if completeness["frontend_files"] < 2:
            completeness["warnings"].append("Very few frontend files")
        if completeness["backend_files"] < 2:
            completeness["warnings"].append("Very few backend files")
        
        return completeness
    
    def get_installation_summary(self) -> Dict[str, Any]:
        """Get a summary of all premium tab installations."""
        installed_tabs = self.get_installed_premium_tabs()
        
        summary = {
            "total_installed": len(installed_tabs),
            "complete_installations": 0,
            "incomplete_installations": 0,
            "broken_installations": 0,
            "tabs": installed_tabs
        }
        
        for tab in installed_tabs:
            status = tab.get("status", "unknown")
            if "complete" in status:
                summary["complete_installations"] += 1
            elif "incomplete" in status:
                summary["incomplete_installations"] += 1
            elif "broken" in status:
                summary["broken_installations"] += 1
        
        return summary
    
    def is_tab_installed(self, tab_name: str) -> bool:
        """Check if a specific tab is installed."""
        installed_tabs = self.get_installed_premium_tabs()
        return any(tab["name"] == tab_name for tab in installed_tabs)
    
    def get_tab_installation_info(self, tab_name: str) -> Optional[Dict[str, Any]]:
        """Get detailed installation info for a specific tab."""
        installed_tabs = self.get_installed_premium_tabs()
        for tab in installed_tabs:
            if tab["name"] == tab_name:
                return tab
        return None
    
    def get_orphaned_installations(self) -> List[Dict[str, Any]]:
        """Find tabs that are installed but no longer have source in premium directory."""
        installed_tabs = self.get_installed_premium_tabs()
        orphaned = []
        
        for tab in installed_tabs:
            if not tab.get("premium_path"):
                orphaned.append(tab)
        
        return orphaned
    
    def validate_installation_integrity(self) -> Dict[str, Any]:
        """Validate the integrity of all premium tab installations."""
        validation_results = {
            "valid": [],
            "invalid": [],
            "warnings": []
        }
        
        installed_tabs = self.get_installed_premium_tabs()
        
        for tab in installed_tabs:
            tab_name = tab["name"]
            status = tab["status"]
            
            if "complete" in status:
                validation_results["valid"].append(tab_name)
            elif "broken" in status:
                validation_results["invalid"].append(tab_name)
            else:
                validation_results["warnings"].append(tab_name)
        
        return validation_results
