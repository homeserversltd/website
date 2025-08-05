#!/usr/bin/env python3
"""
Semantic Version Checker Utility for Premium Tab System

A comprehensive utility for validating semantic versions, detecting conflicts,
and managing dependency compatibility across premium tabs and the main application.

Supports:
- Semantic version parsing and validation
- Version conflict detection for pip and npm packages
- Detailed conflict reporting with resolution suggestions
- Cross-platform package manager compatibility

Author: Homeserver Development Team
License: Apache 2.0 with Commons Clause
"""

import re
import json
import subprocess
import logging
import os
from typing import Dict, List, Tuple, Optional, Set, NamedTuple
from dataclasses import dataclass
from pathlib import Path
from enum import Enum

class PackageManager(Enum):
    """Supported package managers."""
    PIP = "pip"
    NPM = "npm"
    SYSTEM = "system"  # System package manager (apt, dnf, pacman, etc.)

class VersionOperator(Enum):
    """Version comparison operators."""
    EXACT = "=="
    GREATER_EQUAL = ">="
    GREATER = ">"
    LESS_EQUAL = "<="
    LESS = "<"
    COMPATIBLE = "~="
    CARET = "^"  # NPM caret range
    TILDE = "~"  # NPM tilde range

@dataclass
class SemanticVersion:
    """Represents a semantic version with major.minor.patch format."""
    major: int
    minor: int
    patch: int
    prerelease: Optional[str] = None
    build: Optional[str] = None
    
    def __str__(self) -> str:
        version = f"{self.major}.{self.minor}.{self.patch}"
        if self.prerelease:
            version += f"-{self.prerelease}"
        if self.build:
            version += f"+{self.build}"
        return version
    
    def __eq__(self, other) -> bool:
        if not isinstance(other, SemanticVersion):
            return False
        return (self.major, self.minor, self.patch, self.prerelease) == \
               (other.major, other.minor, other.patch, other.prerelease)
    
    def __lt__(self, other) -> bool:
        if not isinstance(other, SemanticVersion):
            return NotImplemented
        
        # Compare major.minor.patch
        self_tuple = (self.major, self.minor, self.patch)
        other_tuple = (other.major, other.minor, other.patch)
        
        if self_tuple != other_tuple:
            return self_tuple < other_tuple
        
        # Handle prerelease comparison
        if self.prerelease is None and other.prerelease is None:
            return False
        if self.prerelease is None:
            return False  # Release > prerelease
        if other.prerelease is None:
            return True   # Prerelease < release
        
        return self.prerelease < other.prerelease
    
    def __le__(self, other) -> bool:
        return self == other or self < other
    
    def __gt__(self, other) -> bool:
        return not self <= other
    
    def __ge__(self, other) -> bool:
        return not self < other

@dataclass
class PackageRequirement:
    """Represents a package requirement with version constraints."""
    name: str
    version_spec: str
    operator: VersionOperator
    version: SemanticVersion
    source: str  # Where this requirement comes from
    package_manager: PackageManager

class VersionConflict(NamedTuple):
    """Represents a version conflict between packages."""
    package_name: str
    requirements: List[PackageRequirement]
    conflict_type: str
    description: str
    suggestions: List[str]

class SemanticVersionChecker:
    """Main semantic version checker utility."""
    
    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or self._setup_default_logger()
        self.pip_packages: Dict[str, PackageRequirement] = {}
        self.npm_packages: Dict[str, PackageRequirement] = {}
        
    def _setup_default_logger(self) -> logging.Logger:
        """Set up default logger if none provided."""
        logger = logging.getLogger('version_checker')
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
        return logger
    
    def parse_semantic_version(self, version_string: str, strict: bool = True) -> SemanticVersion:
        """Parse a semantic version string into components.
        
        Args:
            version_string: Version string to parse
            strict: If True, require exact major.minor.patch format.
                   If False, be more lenient with existing package versions.
        """
        # Remove leading 'v' if present
        version_string = version_string.lstrip('v')
        
        if strict:
            # Strict parsing for new requirements - require major.minor.patch
            pattern = r'^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$'
            match = re.match(pattern, version_string)
            
            if not match:
                raise ValueError(f"Invalid semantic version format: {version_string}")
            
            major, minor, patch, prerelease, build = match.groups()
        else:
            # Lenient parsing for existing packages - handle common Python patterns
            # Handle post-release versions like 2.9.0.post0
            version_string = re.sub(r'\.post\d+$', '', version_string)
            # Handle dev versions like 1.0.0.dev0
            version_string = re.sub(r'\.dev\d+$', '', version_string)
            # Handle rc versions like 1.0.0rc1
            version_string = re.sub(r'rc\d+$', '', version_string)
            
            # Try strict format first
            pattern = r'^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$'
            match = re.match(pattern, version_string)
            
            if match:
                major, minor, patch, prerelease, build = match.groups()
            else:
                # Try major.minor format (add .0 for patch)
                pattern = r'^(\d+)\.(\d+)$'
                match = re.match(pattern, version_string)
                if match:
                    major, minor = match.groups()
                    patch = "0"
                    prerelease = None
                    build = None
                else:
                    # Try major only (add .0.0)
                    pattern = r'^(\d+)$'
                    match = re.match(pattern, version_string)
                    if match:
                        major = match.group(1)
                        minor = "0"
                        patch = "0"
                        prerelease = None
                        build = None
                    else:
                        raise ValueError(f"Cannot parse version format: {version_string}")
        
        return SemanticVersion(
            major=int(major),
            minor=int(minor),
            patch=int(patch),
            prerelease=prerelease,
            build=build
        )
    
    def parse_version_operator(self, version_spec: str, package_manager: PackageManager) -> Tuple[VersionOperator, str]:
        """Parse version specification to extract operator and version."""
        version_spec = version_spec.strip()
        
        # NPM-style operators
        if package_manager == PackageManager.NPM:
            if version_spec.startswith('^'):
                return VersionOperator.CARET, version_spec[1:]
            elif version_spec.startswith('~'):
                return VersionOperator.TILDE, version_spec[1:]
        
        # Python-style operators
        if version_spec.startswith('~='):
            return VersionOperator.COMPATIBLE, version_spec[2:]
        elif version_spec.startswith('>='):
            return VersionOperator.GREATER_EQUAL, version_spec[2:]
        elif version_spec.startswith('<='):
            return VersionOperator.LESS_EQUAL, version_spec[2:]
        elif version_spec.startswith('=='):
            return VersionOperator.EXACT, version_spec[2:]
        elif version_spec.startswith('>'):
            return VersionOperator.GREATER, version_spec[1:]
        elif version_spec.startswith('<'):
            return VersionOperator.LESS, version_spec[1:]
        else:
            # Default to exact match
            return VersionOperator.EXACT, version_spec
    
    def parse_package_requirement(self, requirement_line: str, source: str, 
                                package_manager: PackageManager) -> Optional[PackageRequirement]:
        """Parse a package requirement line."""
        requirement_line = requirement_line.strip()
        
        # Skip empty lines and comments
        if not requirement_line or requirement_line.startswith('#'):
            return None
        
        if package_manager == PackageManager.PIP:
            # Handle pip format: package==1.0.0 or package>=1.0.0
            for op in ['~=', '>=', '<=', '==', '>', '<']:
                if op in requirement_line:
                    name, version_spec = requirement_line.split(op, 1)
                    name = name.strip()
                    version_spec = op + version_spec.strip()
                    break
            else:
                # No operator found, assume exact match
                name = requirement_line
                version_spec = requirement_line
        
        elif package_manager == PackageManager.NPM:
            # Handle npm format from package.json: "package": "^1.0.0"
            if ':' in requirement_line:
                name, version_spec = requirement_line.split(':', 1)
                name = name.strip().strip('"')
                version_spec = version_spec.strip().strip('"').rstrip(',')
            else:
                return None
        
        try:
            operator, version_string = self.parse_version_operator(version_spec, package_manager)
            version = self.parse_semantic_version(version_string)
            
            return PackageRequirement(
                name=name,
                version_spec=version_spec,
                operator=operator,
                version=version,
                source=source,
                package_manager=package_manager
            )
        except ValueError as e:
            self.logger.warning(f"Failed to parse requirement '{requirement_line}' from {source}: {e}")
            return None
    
    def load_pip_requirements(self, requirements_file: str, source: str = None) -> List[PackageRequirement]:
        """Load pip requirements from a requirements.txt file."""
        if not Path(requirements_file).exists():
            return []
        
        source = source or requirements_file
        requirements = []
        
        try:
            with open(requirements_file, 'r') as f:
                for line_num, line in enumerate(f, 1):
                    req = self.parse_package_requirement(
                        line, f"{source}:{line_num}", PackageManager.PIP
                    )
                    if req:
                        requirements.append(req)
                        
        except Exception as e:
            self.logger.error(f"Error reading requirements file {requirements_file}: {e}")
        
        return requirements
    
    def load_npm_dependencies(self, package_json_file: str, source: str = None) -> List[PackageRequirement]:
        """Load NPM dependencies from package.json or package.patch.json file."""
        requirements = []
        source = source or package_json_file
        
        try:
            with open(package_json_file, 'r') as f:
                data = json.load(f)
            
            # Handle both package.json and package.patch.json formats
            for section in ["dependencies", "devDependencies"]:
                if section in data:
                    for name, version_spec in data[section].items():
                        requirement = self.parse_package_requirement(
                            f"{name}@{version_spec}", source, PackageManager.NPM
                        )
                        if requirement:
                            requirements.append(requirement)
                            
        except (FileNotFoundError, json.JSONDecodeError, ValueError) as e:
            self.logger.error(f"Error loading NPM dependencies from {package_json_file}: {e}")
            
        return requirements
    
    def load_system_dependencies(self, dependencies_file: str, source: str = None) -> List[PackageRequirement]:
        """Load system dependencies from dependencies.json file.
        
        System dependencies use a permissive version approach:
        - When a version is specified, it's treated as a minimum version requirement (>=)
        - This allows newer versions to satisfy the dependency
        - This is appropriate for system packages which are generally backward compatible
        - Security updates often bump minor/patch versions and should be acceptable
        
        Args:
            dependencies_file: Path to dependencies.json file
            source: Source identifier for tracking (defaults to file path)
            
        Returns:
            List of PackageRequirement objects with GREATER_EQUAL operators for versioned packages
        """
        requirements = []
        source = source or dependencies_file
        
        try:
            with open(dependencies_file, 'r') as f:
                data = json.load(f)
            
            packages = data.get("packages", [])
            for package in packages:
                name = package.get("name")
                version = package.get("version")
                
                if not name:
                    self.logger.warning(f"Package without name in {dependencies_file}")
                    continue
                
                # For system packages, we use a more permissive approach:
                # If a version is specified, we treat it as a minimum version requirement
                # This allows newer versions to satisfy the dependency (common for security updates)
                if version:
                    version_spec = f">={version}"
                    try:
                        parsed_version = self.parse_semantic_version(version, strict=False)
                        operator = VersionOperator.GREATER_EQUAL
                    except ValueError:
                        # If version can't be parsed as semantic version, treat as string
                        parsed_version = SemanticVersion(0, 0, 0, prerelease=version)
                        operator = VersionOperator.GREATER_EQUAL
                else:
                    version_spec = ">=0.0.0"
                    parsed_version = SemanticVersion(0, 0, 0)
                    operator = VersionOperator.GREATER_EQUAL
                
                requirement = PackageRequirement(
                    name=name,
                    version_spec=version_spec,
                    operator=operator,
                    version=parsed_version,
                    source=source,
                    package_manager=PackageManager.SYSTEM
                )
                requirements.append(requirement)
                            
        except (FileNotFoundError, json.JSONDecodeError, ValueError) as e:
            self.logger.error(f"Error loading system dependencies from {dependencies_file}: {e}")
            
        return requirements
    
    def get_current_pip_packages(self, venv_path: str = "/var/www/homeserver/venv") -> Dict[str, SemanticVersion]:
        """Get currently installed pip packages and their versions."""
        packages = {}
        
        try:
            result = subprocess.run(
                [f"{venv_path}/bin/pip", "freeze"],
                capture_output=True,
                text=True,
                check=True
            )
            
            for line in result.stdout.split('\n'):
                if '==' in line:
                    name, version = line.split('==', 1)
                    try:
                        packages[name.lower()] = self.parse_semantic_version(version, strict=False)
                    except ValueError:
                        self.logger.warning(f"Could not parse installed package version: {line}")
                        
        except Exception as e:
            self.logger.error(f"Error getting current pip packages: {e}")
        
        return packages
    
    def get_current_npm_packages(self, project_path: str = "/var/www/homeserver") -> Dict[str, SemanticVersion]:
        """Get currently installed npm packages and their versions."""
        packages = {}
        
        try:
            result = subprocess.run(
                ["npm", "list", "--json", "--depth=0"],
                cwd=project_path,
                capture_output=True,
                text=True,
                check=False  # npm list can return non-zero even on success
            )
            
            if result.stdout:
                data = json.loads(result.stdout)
                dependencies = data.get('dependencies', {})
                
                for name, info in dependencies.items():
                    version = info.get('version')
                    if version:
                        try:
                            packages[name.lower()] = self.parse_semantic_version(version, strict=False)
                        except ValueError:
                            self.logger.warning(f"Could not parse npm package version: {name}@{version}")
                            
        except Exception as e:
            self.logger.error(f"Error getting current npm packages: {e}")
        
        return packages
    
    def check_version_compatibility(self, req1: PackageRequirement, req2: PackageRequirement) -> bool:
        """Check if two package requirements are compatible."""
        if req1.name.lower() != req2.name.lower():
            return True  # Different packages, no conflict
        
        # For exact version requirements, they must match exactly
        if req1.operator == VersionOperator.EXACT and req2.operator == VersionOperator.EXACT:
            return req1.version == req2.version
        
        # For now, implement basic compatibility checking
        # This can be expanded with more sophisticated range checking
        if req1.operator == VersionOperator.EXACT:
            return self._version_satisfies_requirement(req1.version, req2)
        elif req2.operator == VersionOperator.EXACT:
            return self._version_satisfies_requirement(req2.version, req1)
        
        # Both have range operators - this requires more complex logic
        # For now, we'll be conservative and flag as potential conflict
        return False
    
    def _version_satisfies_requirement(self, version: SemanticVersion, requirement: PackageRequirement) -> bool:
        """Check if a version satisfies a requirement."""
        req_version = requirement.version
        
        if requirement.operator == VersionOperator.EXACT:
            return version == req_version
        elif requirement.operator == VersionOperator.GREATER_EQUAL:
            return version >= req_version
        elif requirement.operator == VersionOperator.GREATER:
            return version > req_version
        elif requirement.operator == VersionOperator.LESS_EQUAL:
            return version <= req_version
        elif requirement.operator == VersionOperator.LESS:
            return version < req_version
        elif requirement.operator == VersionOperator.COMPATIBLE:
            # ~= operator: compatible release
            return (version.major == req_version.major and 
                   version.minor == req_version.minor and 
                   version >= req_version)
        elif requirement.operator == VersionOperator.CARET:
            # ^ operator: compatible within major version
            return (version.major == req_version.major and version >= req_version)
        elif requirement.operator == VersionOperator.TILDE:
            # ~ operator: compatible within minor version
            return (version.major == req_version.major and 
                   version.minor == req_version.minor and 
                   version >= req_version)
        
        return False
    
    def detect_conflicts(self, requirements: List[PackageRequirement]) -> List[VersionConflict]:
        """Detect version conflicts in a list of requirements."""
        self.logger.debug(f"Analyzing {len(requirements)} requirements for conflicts")
        conflicts = []
        
        # Group requirements by package name and manager
        pip_groups: Dict[str, List[PackageRequirement]] = {}
        npm_groups: Dict[str, List[PackageRequirement]] = {}
        
        for req in requirements:
            package_name = req.name.lower()
            self.logger.debug(f"Processing requirement: {req.name} {req.version_spec} from {req.source}")
            
            if req.package_manager == PackageManager.PIP:
                if package_name not in pip_groups:
                    pip_groups[package_name] = []
                pip_groups[package_name].append(req)
            elif req.package_manager == PackageManager.NPM:
                if package_name not in npm_groups:
                    npm_groups[package_name] = []
                npm_groups[package_name].append(req)
        
        self.logger.debug(f"Grouped into {len(pip_groups)} pip packages and {len(npm_groups)} npm packages")
        
        # Check for conflicts within each group
        for package_name, reqs in pip_groups.items():
            if len(reqs) > 1:
                self.logger.debug(f"Checking pip package '{package_name}' with {len(reqs)} requirements")
                conflict = self._analyze_package_conflicts(package_name, reqs)
                if conflict:
                    self.logger.debug(f"Found conflict in pip package '{package_name}'")
                    conflicts.append(conflict)
                else:
                    self.logger.debug(f"No conflicts found in pip package '{package_name}'")
        
        for package_name, reqs in npm_groups.items():
            if len(reqs) > 1:
                self.logger.debug(f"Checking npm package '{package_name}' with {len(reqs)} requirements")
                conflict = self._analyze_package_conflicts(package_name, reqs)
                if conflict:
                    self.logger.debug(f"Found conflict in npm package '{package_name}'")
                    conflicts.append(conflict)
                else:
                    self.logger.debug(f"No conflicts found in npm package '{package_name}'")
        
        self.logger.debug(f"Conflict detection complete: {len(conflicts)} total conflicts found")
        return conflicts
    
    def _analyze_package_conflicts(self, package_name: str, requirements: List[PackageRequirement]) -> Optional[VersionConflict]:
        """Analyze conflicts for a specific package."""
        if len(requirements) < 2:
            return None
        
        # Check pairwise compatibility
        incompatible_pairs = []
        for i in range(len(requirements)):
            for j in range(i + 1, len(requirements)):
                if not self.check_version_compatibility(requirements[i], requirements[j]):
                    incompatible_pairs.append((requirements[i], requirements[j]))
        
        if not incompatible_pairs:
            return None
        
        # Generate conflict description and suggestions
        conflict_type = "version_mismatch"
        description = f"Package '{package_name}' has conflicting version requirements:"
        
        for req in requirements:
            description += f"\n  - {req.source}: {req.version_spec}"
        
        suggestions = self._generate_conflict_suggestions(package_name, requirements)
        
        return VersionConflict(
            package_name=package_name,
            requirements=requirements,
            conflict_type=conflict_type,
            description=description,
            suggestions=suggestions
        )
    
    def _generate_conflict_suggestions(self, package_name: str, requirements: List[PackageRequirement]) -> List[str]:
        """Generate suggestions for resolving conflicts."""
        suggestions = []
        
        # Find the most restrictive version
        exact_versions = [req for req in requirements if req.operator == VersionOperator.EXACT]
        
        if len(exact_versions) > 1:
            # Multiple exact versions - suggest using the latest
            latest_version = max(exact_versions, key=lambda r: r.version)
            suggestions.append(f"Use the latest exact version: {latest_version.version}")
        
        # Suggest version ranges that might work
        all_versions = [req.version for req in requirements]
        min_version = min(all_versions)
        max_version = max(all_versions)
        
        if min_version != max_version:
            suggestions.append(f"Consider using a version range: >={min_version},<={max_version}")
        
        # Suggest checking for compatible versions
        suggestions.append(f"Check if there's a version of '{package_name}' that satisfies all requirements")
        suggestions.append("Consider updating premium tabs to use compatible versions")
        
        return suggestions
    
    def validate_premium_tab_dependencies(self, tab_path: str, current_pip_packages: Dict[str, SemanticVersion] = None,
                                        current_npm_packages: Dict[str, SemanticVersion] = None) -> Tuple[bool, List[VersionConflict]]:
        """Validate dependencies for a premium tab against current environment."""
        self.logger.info(f"Validating dependencies for premium tab: {tab_path}")
        self.logger.debug(f"Starting dependency validation for tab: {tab_path}")
        
        # Check if tab directory exists
        tab_path_obj = Path(tab_path)
        if not tab_path_obj.exists():
            self.logger.error(f"Premium tab directory does not exist: {tab_path}")
            return False, []
        
        if not tab_path_obj.is_dir():
            self.logger.error(f"Premium tab path is not a directory: {tab_path}")
            return False, []
        
        self.logger.debug(f"Tab directory validated: {tab_path}")
        
        all_requirements = []
        conflicts = []
        
        # Load current packages if not provided
        if current_pip_packages is None:
            self.logger.debug("Loading current pip packages from environment")
            current_pip_packages = self.get_current_pip_packages()
            self.logger.debug(f"Found {len(current_pip_packages)} pip packages in environment")
        else:
            self.logger.debug(f"Using provided pip packages: {len(current_pip_packages)} packages")
            
        if current_npm_packages is None:
            self.logger.debug("Loading current npm packages from environment")
            current_npm_packages = self.get_current_npm_packages()
            self.logger.debug(f"Found {len(current_npm_packages)} npm packages in environment")
        else:
            self.logger.debug(f"Using provided npm packages: {len(current_npm_packages)} packages")
        
        # Load premium tab requirements
        pip_requirements_file = Path(tab_path) / "backend" / "requirements.txt"
        if pip_requirements_file.exists():
            self.logger.debug(f"Loading pip requirements from: {pip_requirements_file}")
            pip_reqs = self.load_pip_requirements(str(pip_requirements_file), f"premium_tab:{tab_path}")
            self.logger.debug(f"Loaded {len(pip_reqs)} pip requirements from tab")
            all_requirements.extend(pip_reqs)
        else:
            self.logger.debug(f"No pip requirements file found at: {pip_requirements_file}")
        
        npm_patch_file = Path(tab_path) / "frontend" / "package.patch.json"
        if npm_patch_file.exists():
            self.logger.debug(f"Loading npm dependencies from: {npm_patch_file}")
            npm_reqs = self.load_npm_dependencies(str(npm_patch_file), f"premium_tab:{tab_path}")
            self.logger.debug(f"Loaded {len(npm_reqs)} npm requirements from tab")
            all_requirements.extend(npm_reqs)
        else:
            self.logger.debug(f"No npm patch file found at: {npm_patch_file}")
        
        # Load system dependencies
        system_dependencies_file = Path(tab_path) / "system" / "dependencies.json"
        if system_dependencies_file.exists():
            self.logger.debug(f"Loading system dependencies from: {system_dependencies_file}")
            system_reqs = self.load_system_dependencies(str(system_dependencies_file), f"premium_tab:{tab_path}")
            self.logger.debug(f"Loaded {len(system_reqs)} system requirements from tab")
            all_requirements.extend(system_reqs)
        else:
            self.logger.debug(f"No system dependencies file found at: {system_dependencies_file}")
        
        # Add current environment as requirements
        self.logger.debug("Adding current environment packages as requirements for conflict detection")
        for name, version in current_pip_packages.items():
            current_req = PackageRequirement(
                name=name,
                version_spec=f"=={version}",
                operator=VersionOperator.EXACT,
                version=version,
                source="current_environment",
                package_manager=PackageManager.PIP
            )
            all_requirements.append(current_req)
            self.logger.debug(f"Added current pip package: {name}=={version}")
        
        for name, version in current_npm_packages.items():
            current_req = PackageRequirement(
                name=name,
                version_spec=str(version),
                operator=VersionOperator.EXACT,
                version=version,
                source="current_environment",
                package_manager=PackageManager.NPM
            )
            all_requirements.append(current_req)
            self.logger.debug(f"Added current npm package: {name}@{version}")
        
        # Note: We don't add current system packages to requirements because:
        # 1. System package management is additive (we can install alongside existing)
        # 2. System package conflicts are handled separately by the PackageManager
        # 3. Version conflicts at system level are less common and more complex to resolve
        
        # Detect conflicts
        self.logger.debug(f"Starting conflict detection with {len(all_requirements)} total requirements")
        conflicts = self.detect_conflicts(all_requirements)
        self.logger.debug(f"Conflict detection completed, found {len(conflicts)} conflicts")
        
        is_valid = len(conflicts) == 0
        
        if conflicts:
            self.logger.error(f"Found {len(conflicts)} dependency conflicts")
            for conflict in conflicts:
                self.logger.error(f"Conflict: {conflict.description}")
        else:
            self.logger.info("No dependency conflicts detected")
        
        return is_valid, conflicts
    
    def generate_conflict_report(self, conflicts: List[VersionConflict]) -> str:
        """Generate a detailed conflict report."""
        if not conflicts:
            return "No version conflicts detected."
        
        report = f"Version Conflict Report\n{'=' * 50}\n\n"
        report += f"Found {len(conflicts)} conflict(s):\n\n"
        
        for i, conflict in enumerate(conflicts, 1):
            report += f"{i}. Package: {conflict.package_name}\n"
            report += f"   Type: {conflict.conflict_type}\n"
            report += f"   Description: {conflict.description}\n"
            
            if conflict.suggestions:
                report += "   Suggestions:\n"
                for suggestion in conflict.suggestions:
                    report += f"     - {suggestion}\n"
            
            report += "\n"
        
        return report

    def validate_index_version_consistency(self, tab_path: str) -> Tuple[bool, List[str]]:
        """Validate that all index.json files in a premium tab have consistent versions."""
        errors = []
        tab_name = Path(tab_path).name
        
        # Load root index.json
        root_index_path = Path(tab_path) / "index.json"
        if not root_index_path.exists():
            errors.append(f"Missing root index.json in {tab_path}")
            return False, errors
        
        try:
            with open(root_index_path, 'r') as f:
                root_index = json.load(f)
            root_version = root_index.get('version')
            root_name = root_index.get('name')
            
            if not root_version:
                errors.append(f"Root index.json missing version field")
            if not root_name:
                errors.append(f"Root index.json missing name field")
            elif root_name != tab_name:
                errors.append(f"Root index.json name '{root_name}' doesn't match directory name '{tab_name}'")
                
        except (json.JSONDecodeError, FileNotFoundError) as e:
            errors.append(f"Error reading root index.json: {e}")
            return False, errors
        
        # Check backend index.json
        backend_index_path = Path(tab_path) / "backend" / "index.json"
        if backend_index_path.exists():
            try:
                with open(backend_index_path, 'r') as f:
                    backend_index = json.load(f)
                backend_version = backend_index.get('version')
                backend_name = backend_index.get('name')
                
                if backend_version != root_version:
                    errors.append(f"Backend index.json version '{backend_version}' doesn't match root version '{root_version}'")
                if backend_name != root_name:
                    errors.append(f"Backend index.json name '{backend_name}' doesn't match root name '{root_name}'")
                    
            except (json.JSONDecodeError, FileNotFoundError) as e:
                errors.append(f"Error reading backend/index.json: {e}")
        
        # Check frontend index.json
        frontend_index_path = Path(tab_path) / "frontend" / "index.json"
        if frontend_index_path.exists():
            try:
                with open(frontend_index_path, 'r') as f:
                    frontend_index = json.load(f)
                frontend_version = frontend_index.get('version')
                frontend_name = frontend_index.get('name')
                
                if frontend_version != root_version:
                    errors.append(f"Frontend index.json version '{frontend_version}' doesn't match root version '{root_version}'")
                if frontend_name != root_name:
                    errors.append(f"Frontend index.json name '{frontend_name}' doesn't match root name '{root_name}'")
                    
            except (json.JSONDecodeError, FileNotFoundError) as e:
                errors.append(f"Error reading frontend/index.json: {e}")
        
        # Validate semantic version format
        if root_version:
            try:
                self.parse_semantic_version(root_version)
            except ValueError as e:
                errors.append(f"Invalid semantic version format in root index.json: {e}")
        
        return len(errors) == 0, errors

    def validate_complete_manifest(self, tab_path: str) -> Tuple[bool, List[str]]:
        """Validate that premium tab contains only files declared in root index.json.
        
        Special handling for __pycache__ files which indicate an already installed tab.
        """
        errors = []
        
        try:
            # Load root index.json
            root_index_path = Path(tab_path) / "index.json"
            if not root_index_path.exists():
                errors.append(f"Missing root index.json in {tab_path}")
                return False, errors
            
            with open(root_index_path, 'r') as f:
                root_manifest = json.load(f)
            
            # Collect all files declared in manifest
            manifest_files = []
            
            def collect_files(files_section, base_path=""):
                if isinstance(files_section, dict):
                    for key, value in files_section.items():
                        if isinstance(value, str):
                            file_path = os.path.join(tab_path, value.lstrip('/'))
                            manifest_files.append(file_path)
                        elif isinstance(value, dict):
                            collect_files(value, base_path)
                elif isinstance(files_section, list):
                    for item in files_section:
                        if isinstance(item, str):
                            file_path = os.path.join(tab_path, item.lstrip('/'))
                            manifest_files.append(file_path)
            
            collect_files(root_manifest.get("files", {}))
            
            # Get all actual files in directory
            actual_files = []
            pycache_files = []
            
            for root, dirs, files in os.walk(tab_path):
                # Skip hidden directories
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                
                for file in files:
                    # Skip hidden files
                    if file.startswith('.'):
                        continue
                    
                    # Skip ONLY the root index.json, not all index.json files
                    file_path = os.path.join(root, file)
                    if file == "index.json" and root == tab_path:
                        continue  # Skip root index.json only
                    
                    # Separate __pycache__ files for special handling
                    if "__pycache__" in file_path:
                        pycache_files.append(file_path)
                    else:
                        actual_files.append(file_path)
            
            # Check for __pycache__ files first - indicates already installed tab
            if pycache_files:
                tab_name = os.path.basename(tab_path)
                errors.append(f"TAB ALREADY INSTALLED: Premium tab '{tab_name}' is already installed")
                errors.append(f"Found {len(pycache_files)} __pycache__ files indicating active installation:")
                
                tab_path_abs = os.path.abspath(tab_path)
                for pycache_file in sorted(pycache_files):
                    relative_path = os.path.relpath(pycache_file, tab_path_abs)
                    errors.append(f"  - {relative_path}")
                
                errors.append(f"To reinstall this tab, first uninstall it using:")
                errors.append(f"  sudo python3 installer_refactored.py uninstall {tab_name}")
                return False, errors
            
            # Normalize all paths to absolute paths for comparison
            tab_path_abs = os.path.abspath(tab_path)
            manifest_files_abs = set(os.path.abspath(f) for f in manifest_files)
            actual_files_abs = set(os.path.abspath(f) for f in actual_files)
            
            # Find extra files not in manifest
            extra_files = actual_files_abs - manifest_files_abs
            if extra_files:
                errors.append("Extra files found not declared in manifest:")
                for extra_file in sorted(extra_files):
                    relative_path = os.path.relpath(extra_file, tab_path_abs)
                    errors.append(f"  - {relative_path}")
            
            # Find missing files declared but not present
            missing_files = manifest_files_abs - actual_files_abs
            if missing_files:
                errors.append("Missing files declared in manifest:")
                for missing_file in sorted(missing_files):
                    relative_path = os.path.relpath(missing_file, tab_path_abs)
                    errors.append(f"  - {relative_path}")
            
            return len(errors) == 0, errors
            
        except Exception as e:
            errors.append(f"Error validating manifest completeness: {str(e)}")
            return False, errors

    def discover_premium_tabs(self, premium_dir: str) -> List[str]:
        """Discover all premium tabs in the premium directory."""
        premium_path = Path(premium_dir)
        if not premium_path.exists():
            return []
        
        tabs = []
        for item in premium_path.iterdir():
            if item.is_dir() and item.name != "utils":
                # Check if it has an index.json (indicates it's a premium tab)
                if (item / "index.json").exists():
                    tabs.append(str(item))
        
        return sorted(tabs)

    def validate_all_premium_tabs(self, premium_dir: str) -> Tuple[bool, Dict[str, any]]:
        """Comprehensive validation of all premium tabs in the directory."""
        self.logger.info(f"Starting comprehensive validation of all premium tabs in: {premium_dir}")
        
        results = {
            "tabs_found": [],
            "version_consistency": {},
            "dependency_conflicts": [],
            "cross_tab_conflicts": [],
            "overall_valid": True,
            "summary": {}
        }
        
        # Discover all premium tabs
        tabs = self.discover_premium_tabs(premium_dir)
        results["tabs_found"] = [Path(tab).name for tab in tabs]
        
        if not tabs:
            self.logger.warning(f"No premium tabs found in {premium_dir}")
            # Generate summary for empty directory
            results["summary"] = {
                "total_tabs": 0,
                "tabs_with_version_errors": 0,
                "tabs_with_manifest_errors": 0,
                "tabs_with_dependency_conflicts": 0,
                "cross_tab_conflicts": 0,
                "overall_status": "PASS"
            }
            return True, results
        
        self.logger.info(f"Found {len(tabs)} premium tabs: {', '.join(results['tabs_found'])}")
        
        # Load current environment packages once
        current_pip_packages = self.get_current_pip_packages()
        current_npm_packages = self.get_current_npm_packages()
        
        # Collect all requirements from all tabs for cross-tab conflict detection
        all_tab_requirements = []
        
        # Validate each tab individually
        for tab_path in tabs:
            tab_name = Path(tab_path).name
            self.logger.info(f"Validating premium tab: {tab_name}")
            
            # Check version consistency within the tab
            version_valid, version_errors = self.validate_index_version_consistency(tab_path)
            results["version_consistency"][tab_name] = {
                "valid": version_valid,
                "errors": version_errors
            }
            
            if not version_valid:
                results["overall_valid"] = False
                self.logger.error(f"Version consistency errors in {tab_name}: {version_errors}")
            
            # CRITICAL: Validate complete file manifest (no extra files)
            manifest_valid, manifest_errors = self.validate_complete_manifest(tab_path)
            if tab_name not in results["version_consistency"]:
                results["version_consistency"][tab_name] = {"valid": True, "errors": []}
            
            results["version_consistency"][tab_name]["manifest_valid"] = manifest_valid
            results["version_consistency"][tab_name]["manifest_errors"] = manifest_errors
            
            if not manifest_valid:
                results["overall_valid"] = False
                self.logger.error(f"Manifest completeness errors in {tab_name}: {manifest_errors}")
            
            # Check dependencies against current environment
            deps_valid, conflicts = self.validate_premium_tab_dependencies(
                tab_path, current_pip_packages, current_npm_packages
            )
            
            if conflicts:
                results["dependency_conflicts"].extend([
                    {"tab": tab_name, "conflict": conflict} for conflict in conflicts
                ])
                results["overall_valid"] = False
            
            # Collect requirements for cross-tab analysis
            pip_requirements_file = Path(tab_path) / "backend" / "requirements.txt"
            if pip_requirements_file.exists():
                pip_reqs = self.load_pip_requirements(str(pip_requirements_file), f"tab:{tab_name}")
                all_tab_requirements.extend(pip_reqs)
            
            npm_patch_file = Path(tab_path) / "frontend" / "package.patch.json"
            if npm_patch_file.exists():
                npm_reqs = self.load_npm_dependencies(str(npm_patch_file), f"tab:{tab_name}")
                all_tab_requirements.extend(npm_reqs)
        
        # Check for cross-tab conflicts (premium tab vs premium tab)
        self.logger.info("Checking for cross-tab dependency conflicts...")
        cross_tab_conflicts = self.detect_conflicts(all_tab_requirements)
        
        if cross_tab_conflicts:
            results["cross_tab_conflicts"] = cross_tab_conflicts
            results["overall_valid"] = False
            self.logger.error(f"Found {len(cross_tab_conflicts)} cross-tab conflicts")
        
        # Generate summary
        results["summary"] = {
            "total_tabs": len(tabs),
            "tabs_with_version_errors": len([t for t in results["version_consistency"].values() if not t["valid"]]),
            "tabs_with_manifest_errors": len([t for t in results["version_consistency"].values() if "manifest_valid" in t and not t["manifest_valid"]]),
            "tabs_with_dependency_conflicts": len(set(c["tab"] for c in results["dependency_conflicts"])),
            "cross_tab_conflicts": len(cross_tab_conflicts),
            "overall_status": "PASS" if results["overall_valid"] else "FAIL"
        }
        
        return results["overall_valid"], results

    def generate_comprehensive_report(self, results: Dict[str, any]) -> str:
        """Generate a comprehensive validation report."""
        report = f"Premium Tab Comprehensive Validation Report\n{'=' * 60}\n\n"
        
        summary = results["summary"]
        report += f"Overall Status: {summary['overall_status']}\n"
        report += f"Total Premium Tabs: {summary['total_tabs']}\n"
        report += f"Tabs Found: {', '.join(results['tabs_found'])}\n\n"
        
        # Version consistency section
        report += f"Version Consistency Check\n{'-' * 30}\n"
        if summary["tabs_with_version_errors"] == 0:
            report += "✅ All tabs have consistent version numbers across index.json files\n\n"
        else:
            report += f"❌ {summary['tabs_with_version_errors']} tabs have version consistency issues:\n"
            for tab_name, version_info in results["version_consistency"].items():
                if not version_info["valid"]:
                    report += f"  • {tab_name}:\n"
                    for error in version_info["errors"]:
                        report += f"    - {error}\n"
            report += "\n"
        
        # Manifest completeness section
        report += f"Manifest Completeness Check (Security)\n{'-' * 40}\n"
        manifest_errors = 0
        already_installed_tabs = []
        
        for tab_name, version_info in results["version_consistency"].items():
            if "manifest_valid" in version_info and not version_info["manifest_valid"]:
                manifest_errors += 1
                # Check if this is an "already installed" error
                manifest_errors_list = version_info.get("manifest_errors", [])
                if any("TAB ALREADY INSTALLED" in error for error in manifest_errors_list):
                    already_installed_tabs.append(tab_name)
        
        if manifest_errors == 0:
            report += "✅ All tabs contain only files declared in root index.json\n\n"
        else:
            # Separate already installed tabs from other manifest errors
            other_manifest_errors = manifest_errors - len(already_installed_tabs)
            
            if already_installed_tabs:
                report += f"⚠️  {len(already_installed_tabs)} tabs are already installed:\n"
                for tab_name in already_installed_tabs:
                    report += f"  • {tab_name}: Already installed (found __pycache__ files)\n"
                    report += f"    To reinstall: sudo python3 installer_refactored.py uninstall {tab_name}\n"
                report += "\n"
            
            if other_manifest_errors > 0:
                report += f"❌ {other_manifest_errors} tabs have undeclared files (SECURITY RISK):\n"
                for tab_name, version_info in results["version_consistency"].items():
                    if ("manifest_valid" in version_info and not version_info["manifest_valid"] 
                        and tab_name not in already_installed_tabs):
                        report += f"  • {tab_name}:\n"
                        for error in version_info.get("manifest_errors", []):
                            if not "TAB ALREADY INSTALLED" in error:
                                report += f"    - {error}\n"
                report += "\n"
        
        # Dependency conflicts section
        report += f"Dependency Conflicts (vs Current Environment)\n{'-' * 50}\n"
        if not results["dependency_conflicts"]:
            report += "✅ No dependency conflicts with current environment\n\n"
        else:
            report += f"❌ Found conflicts in {summary['tabs_with_dependency_conflicts']} tabs:\n"
            for conflict_info in results["dependency_conflicts"]:
                tab = conflict_info["tab"]
                conflict = conflict_info["conflict"]
                report += f"  • {tab}: {conflict.package_name} - {conflict.conflict_type}\n"
                report += f"    {conflict.description}\n"
            report += "\n"
        
        # Cross-tab conflicts section
        report += f"Cross-Tab Conflicts (Premium Tab vs Premium Tab)\n{'-' * 55}\n"
        if not results["cross_tab_conflicts"]:
            report += "✅ No conflicts between premium tabs\n\n"
        else:
            report += f"❌ Found {summary['cross_tab_conflicts']} cross-tab conflicts:\n"
            for conflict in results["cross_tab_conflicts"]:
                report += f"  • {conflict.package_name} - {conflict.conflict_type}\n"
                report += f"    {conflict.description}\n"
                if conflict.suggestions:
                    report += "    Suggestions:\n"
                    for suggestion in conflict.suggestions:
                        report += f"      - {suggestion}\n"
            report += "\n"
        
        # Recommendations
        if not results["overall_valid"]:
            report += f"Recommendations\n{'-' * 15}\n"
            report += "❌ VALIDATION FAILED - Premium tabs are not ready for release\n"
            report += "Please fix all issues above before proceeding with installation or distribution.\n\n"
        else:
            report += f"Recommendations\n{'-' * 15}\n"
            report += "✅ VALIDATION PASSED - All premium tabs are compatible and ready for release\n"
            report += "All version numbers are consistent and no dependency conflicts detected.\n\n"
        
        return report

def main():
    """CLI interface for the version checker utility."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Semantic Version Checker Utility")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Check command (single tab)
    check_parser = subparsers.add_parser("check", help="Check for version conflicts in a single premium tab")
    check_parser.add_argument("tab_path", help="Path to premium tab directory")
    check_parser.add_argument("--report", action="store_true", help="Generate detailed report")
    
    # Batch command (all tabs)
    batch_parser = subparsers.add_parser("batch", help="Comprehensive validation of all premium tabs")
    batch_parser.add_argument("premium_dir", help="Path to premium directory containing all tabs")
    batch_parser.add_argument("--report", action="store_true", help="Generate comprehensive report")
    
    # Index command (version consistency)
    index_parser = subparsers.add_parser("index", help="Validate index.json version consistency")
    index_parser.add_argument("tab_path", help="Path to premium tab directory")
    
    # Manifest command (completeness check)
    manifest_parser = subparsers.add_parser("manifest", help="Validate manifest completeness (no extra files)")
    manifest_parser.add_argument("tab_path", help="Path to premium tab directory")
    
    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate a version string")
    validate_parser.add_argument("version", help="Version string to validate")
    
    # Compare command
    compare_parser = subparsers.add_parser("compare", help="Compare two versions")
    compare_parser.add_argument("version1", help="First version")
    compare_parser.add_argument("version2", help="Second version")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    # Set up logging
    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format='[%(asctime)s] [%(levelname)s] %(message)s'
    )
    
    # Create checker with proper logging level
    logger = logging.getLogger('version_checker')
    if args.debug:
        logger.setLevel(logging.DEBUG)
    checker = SemanticVersionChecker(logger)
    
    if args.debug:
        checker.logger.debug(f"Debug mode enabled, executing command: {args.command}")
        checker.logger.debug(f"Command arguments: {vars(args)}")
    
    try:
        if args.command == "check":
            is_valid, conflicts = checker.validate_premium_tab_dependencies(args.tab_path)
            
            if args.report:
                print(checker.generate_conflict_report(conflicts))
            
            return 0 if is_valid else 1
            
        elif args.command == "batch":
            is_valid, results = checker.validate_all_premium_tabs(args.premium_dir)
            
            if args.report:
                print(checker.generate_comprehensive_report(results))
            else:
                summary = results["summary"]
                print(f"Overall Status: {summary['overall_status']}")
                print(f"Tabs: {summary['total_tabs']}, Version Errors: {summary['tabs_with_version_errors']}, "
                      f"Dependency Conflicts: {summary['tabs_with_dependency_conflicts']}, "
                      f"Cross-Tab Conflicts: {summary['cross_tab_conflicts']}")
            
            return 0 if is_valid else 1
            
        elif args.command == "index":
            is_valid, errors = checker.validate_index_version_consistency(args.tab_path)
            
            if is_valid:
                print("✅ All index.json files have consistent versions")
            else:
                print("❌ Version consistency errors found:")
                for error in errors:
                    print(f"  - {error}")
            
            return 0 if is_valid else 1
            
        elif args.command == "manifest":
            is_valid, errors = checker.validate_complete_manifest(args.tab_path)
            
            if is_valid:
                print("✅ Manifest completeness validation passed - no extra files found")
            else:
                print("❌ Manifest completeness validation failed:")
                for error in errors:
                    print(f"  - {error}")
            
            return 0 if is_valid else 1
            
        elif args.command == "validate":
            try:
                version = checker.parse_semantic_version(args.version)
                print(f"Valid semantic version: {version}")
                return 0
            except ValueError as e:
                print(f"Invalid version: {e}")
                return 1
                
        elif args.command == "compare":
            try:
                v1 = checker.parse_semantic_version(args.version1)
                v2 = checker.parse_semantic_version(args.version2)
                
                if v1 == v2:
                    print(f"{v1} == {v2}")
                elif v1 < v2:
                    print(f"{v1} < {v2}")
                else:
                    print(f"{v1} > {v2}")
                
                return 0
            except ValueError as e:
                print(f"Error: {e}")
                return 1
                
    except Exception as e:
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    import sys
    sys.exit(main()) 