#!/usr/bin/env python3
"""
Test script for the Semantic Version Checker Utility

This script demonstrates the functionality of the version checker and can be used
to validate that the utility is working correctly.

Usage:
    python3 test_version_checker.py
"""

import sys
import tempfile
import os
from pathlib import Path

# Add the current directory to the path so we can import the version checker
sys.path.insert(0, os.path.dirname(__file__))

from version_checker import SemanticVersionChecker, SemanticVersion, PackageManager

def test_semantic_version_parsing():
    """Test semantic version parsing functionality."""
    print("Testing Semantic Version Parsing...")
    
    checker = SemanticVersionChecker()
    
    test_cases = [
        ("1.0.0", True),
        ("2.1.3", True),
        ("1.0.0-alpha", True),
        ("1.0.0-alpha.1", True),
        ("1.0.0+build.1", True),
        ("1.0.0-alpha+build.1", True),
        ("v1.0.0", True),
        ("1.0", False),
        ("1", False),
        ("1.0.0.0", False),
        ("invalid", False),
    ]
    
    for version_str, should_pass in test_cases:
        try:
            version = checker.parse_semantic_version(version_str)
            if should_pass:
                print(f"  ✓ {version_str} -> {version}")
            else:
                print(f"  ✗ {version_str} should have failed but parsed as {version}")
        except ValueError as e:
            if not should_pass:
                print(f"  ✓ {version_str} correctly failed: {e}")
            else:
                print(f"  ✗ {version_str} should have passed but failed: {e}")
    
    print()

def test_version_comparison():
    """Test version comparison functionality."""
    print("Testing Version Comparison...")
    
    checker = SemanticVersionChecker()
    
    v1_0_0 = checker.parse_semantic_version("1.0.0")
    v1_0_1 = checker.parse_semantic_version("1.0.1")
    v1_1_0 = checker.parse_semantic_version("1.1.0")
    v2_0_0 = checker.parse_semantic_version("2.0.0")
    v1_0_0_alpha = checker.parse_semantic_version("1.0.0-alpha")
    
    test_cases = [
        (v1_0_0, v1_0_0, "=="),
        (v1_0_0, v1_0_1, "<"),
        (v1_0_1, v1_0_0, ">"),
        (v1_0_0, v1_1_0, "<"),
        (v1_1_0, v1_0_0, ">"),
        (v1_0_0, v2_0_0, "<"),
        (v2_0_0, v1_0_0, ">"),
        (v1_0_0_alpha, v1_0_0, "<"),
        (v1_0_0, v1_0_0_alpha, ">"),
    ]
    
    for v1, v2, expected_op in test_cases:
        if expected_op == "==":
            result = v1 == v2
            op_str = "=="
        elif expected_op == "<":
            result = v1 < v2
            op_str = "<"
        elif expected_op == ">":
            result = v1 > v2
            op_str = ">"
        
        if result:
            print(f"  ✓ {v1} {op_str} {v2}")
        else:
            print(f"  ✗ {v1} {op_str} {v2} failed")
    
    print()

def test_package_requirement_parsing():
    """Test package requirement parsing."""
    print("Testing Package Requirement Parsing...")
    
    checker = SemanticVersionChecker()
    
    pip_test_cases = [
        ("flask==2.0.1", "flask", "==", "2.0.1"),
        ("requests>=2.25.0", "requests", ">=", "2.25.0"),
        ("numpy~=1.20.0", "numpy", "~=", "1.20.0"),
        ("# This is a comment", None, None, None),
        ("", None, None, None),
    ]
    
    print("  PIP Requirements:")
    for req_line, expected_name, expected_op, expected_version in pip_test_cases:
        req = checker.parse_package_requirement(req_line, "test", PackageManager.PIP)
        
        if req is None and expected_name is None:
            print(f"    ✓ '{req_line}' correctly ignored")
        elif req is not None and expected_name is not None:
            if (req.name == expected_name and 
                req.operator.value == expected_op and 
                str(req.version) == expected_version):
                print(f"    ✓ '{req_line}' -> {req.name} {req.operator.value} {req.version}")
            else:
                print(f"    ✗ '{req_line}' -> {req.name} {req.operator.value} {req.version} (expected {expected_name} {expected_op} {expected_version})")
        else:
            print(f"    ✗ '{req_line}' parsing mismatch")
    
    npm_test_cases = [
        ('"react": "^18.2.0"', "react", "^", "18.2.0"),
        ('"lodash": "~4.17.21"', "lodash", "~", "4.17.21"),
        ('"express": "4.18.1"', "express", "==", "4.18.1"),
    ]
    
    print("  NPM Requirements:")
    for req_line, expected_name, expected_op, expected_version in npm_test_cases:
        req = checker.parse_package_requirement(req_line, "test", PackageManager.NPM)
        
        if req is not None:
            print(f"    ✓ '{req_line}' -> {req.name} {req.operator.value} {req.version}")
        else:
            print(f"    ✗ '{req_line}' failed to parse")
    
    print()

def test_conflict_detection():
    """Test version conflict detection."""
    print("Testing Conflict Detection...")
    
    checker = SemanticVersionChecker()
    
    # Create temporary files for testing
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create a mock premium tab structure
        tab_dir = Path(temp_dir) / "test_tab"
        backend_dir = tab_dir / "backend"
        frontend_dir = tab_dir / "frontend"
        
        backend_dir.mkdir(parents=True)
        frontend_dir.mkdir(parents=True)
        
        # Create requirements.txt with conflicting versions
        requirements_content = """flask==2.0.1
requests==2.25.0
numpy==1.20.0
"""
        (backend_dir / "requirements.txt").write_text(requirements_content)
        
        # Create package.patch.json
        package_patch_content = """{
  "dependencies": {
    "react": "^18.2.0",
    "lodash": "4.17.21"
  }
}"""
        (frontend_dir / "package.patch.json").write_text(package_patch_content)
        
        # Test with mock current packages that have conflicts
        mock_pip_packages = {
            "flask": checker.parse_semantic_version("1.1.0"),  # Conflict!
            "requests": checker.parse_semantic_version("2.25.0"),  # No conflict
            "existing-package": checker.parse_semantic_version("1.0.0")
        }
        
        mock_npm_packages = {
            "react": checker.parse_semantic_version("17.0.0"),  # Potential conflict
            "existing-npm-package": checker.parse_semantic_version("1.0.0")
        }
        
        # Run validation
        is_valid, conflicts = checker.validate_premium_tab_dependencies(
            str(tab_dir), mock_pip_packages, mock_npm_packages
        )
        
        print(f"  Validation result: {'PASS' if is_valid else 'FAIL'}")
        print(f"  Conflicts found: {len(conflicts)}")
        
        if conflicts:
            print("  Conflict details:")
            for conflict in conflicts:
                print(f"    - {conflict.package_name}: {conflict.conflict_type}")
        
        # Generate and display conflict report
        if conflicts:
            report = checker.generate_conflict_report(conflicts)
            print("\n  Conflict Report:")
            print("  " + "\n  ".join(report.split("\n")))
    
    print()

def main():
    """Run all tests."""
    print("Semantic Version Checker Utility Test Suite")
    print("=" * 50)
    print()
    
    try:
        test_semantic_version_parsing()
        test_version_comparison()
        test_package_requirement_parsing()
        test_conflict_detection()
        
        print("All tests completed!")
        
    except Exception as e:
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 