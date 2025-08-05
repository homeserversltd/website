# ConflictTab - HOMESERVER Premium Tab Conflict Testing Framework

> **⚠️ WARNING: This tab is for testing purposes only and should NEVER be installed in production environments.**

## Overview

ConflictTab is a specialized testing framework designed to validate HOMESERVER's premium tab conflict detection and resolution systems. This repository contains intentionally conflicting dependencies and configurations to test the platform's safeguards against incompatible tab installations.

## Purpose

This tab exists solely to test HOMESERVER's conflict detection mechanisms. It intentionally includes:

- **Version Conflicts**: Conflicting package versions with other tabs
- **Dependency Conflicts**: Incompatible dependency requirements
- **Package Conflicts**: Overlapping React dependencies and system packages
- **Configuration Conflicts**: Conflicting tab configurations and permissions

## Testing Scenarios

### 1. Dependency Resolution Testing
- Tests package manager conflict detection
- Validates version constraint enforcement
- Ensures proper error reporting for conflicts

### 2. Installation Safety Testing
- Verifies that conflicting tabs cannot be installed simultaneously
- Tests automatic rollback on conflict detection
- Validates installation blocking mechanisms

### 3. Error Handling Testing
- Tests clear conflict error messages
- Validates resolution guidance
- Ensures proper logging of conflict events

### 4. Rollback Mechanism Testing
- Tests automatic rollback on conflict detection
- Validates partial installation cleanup
- Ensures system stability during conflicts

## Architecture

### Backend Components
- **Flask Blueprint**: Minimal API endpoints for testing
- **Dependencies**: Intentionally conflicting Python packages
- **Configuration**: Overlapping system configurations

### Frontend Components
- **React Component**: Basic UI for conflict testing
- **Dependencies**: Conflicting React package versions
- **Styling**: Minimal CSS for testing purposes

### System Integration
- **Package Dependencies**: Conflicting system packages
- **Permissions**: Overlapping sudoers configurations
- **Services**: Conflicting service definitions

## Conflict Matrix

| Component | Conflict Type | Target | Expected Result |
|-----------|---------------|--------|-----------------|
| pandas | Version | testTab (2.1.0) | Installation blocked |
| numpy | Version | testTab (1.24.0) | Installation blocked |
| httpx | Version | testTab (0.25.0) | Installation blocked |
| jsonschema | Version | testTab (4.21.0) | Installation blocked |
| chart.js | Package | testTab (chart.js) | Installation blocked |
| cowsay | System | testTab (cowsay) | Installation blocked |

## Installation Testing

### Expected Behavior
1. **Conflict Detection**: System should detect conflicts during installation
2. **Installation Blocking**: Installation should be prevented
3. **Error Reporting**: Clear error messages should be displayed
4. **Rollback**: Any partial installation should be rolled back
5. **Logging**: Conflict events should be properly logged

### Testing Commands
```bash
# Test conflict detection
homeserver premium install conflictTab

# Expected output:
# ERROR: Conflict detected with existing tab 'testTab'
# - pandas: 2.0.0 conflicts with 2.1.0
# - numpy: 1.23.0 conflicts with 1.24.0
# Installation blocked for system stability
```

## Development Guidelines

### Adding New Conflicts
1. **Identify Target**: Choose existing tab to conflict with
2. **Select Component**: Choose package, version, or configuration
3. **Create Conflict**: Modify requirements or configuration
4. **Test Detection**: Verify conflict is properly detected
5. **Document**: Update this README with new conflict

### Conflict Types
- **Version Conflicts**: Different versions of same package
- **Package Conflicts**: Incompatible package combinations
- **Configuration Conflicts**: Overlapping system configurations
- **Permission Conflicts**: Conflicting sudoers rules
- **Service Conflicts**: Overlapping service definitions

## Safety Measures

### Production Protection
- **Never Install**: This tab should never be installed in production
- **Testing Only**: Use only in controlled testing environments
- **Isolation**: Test in isolated environments to prevent system impact
- **Backup**: Always backup system before testing

### Development Safety
- **Version Control**: All changes are tracked in git
- **Rollback Plan**: Always have rollback procedures ready
- **Documentation**: Document all conflicts and expected behaviors
- **Validation**: Test conflict detection before deployment

## Repository Structure

```
conflictTab/
├── backend/
│   ├── __init__.py          # Blueprint registration
│   ├── routes.py            # API endpoints
│   ├── requirements.txt     # Conflicting dependencies
│   └── index.json          # Backend configuration
├── frontend/
│   ├── index.tsx           # React component
│   ├── package.patch.json  # Conflicting npm packages
│   └── index.json          # Frontend configuration
├── system/
│   └── dependencies.json   # System package conflicts
├── permissions/
│   └── premium_conflict    # Conflicting sudoers rules
├── homeserver.patch.json   # Tab configuration
├── index.json             # Main tab definition
└── README.md              # This file
```

## Contributing

### Adding New Conflicts
1. Fork the repository
2. Create a feature branch
3. Add new conflict scenarios
4. Update documentation
5. Submit pull request

### Testing New Conflicts
1. Install target tab (e.g., testTab)
2. Attempt to install conflictTab
3. Verify conflict detection
4. Verify installation blocking
5. Verify error reporting

## License

This project is licensed under the GPL-3.0 License - see the LICENSE file for details.

## Support

For questions about conflict testing or HOMESERVER premium tab development:

- **Documentation**: [HOMESERVER Premium Tab Guide](https://github.com/homeserversltd/documentation)
- **Issues**: [Report bugs or request features](https://github.com/homeserversltd/conflictTab/issues)
- **Discussions**: [Join the community](https://github.com/homeserversltd/homeserver/discussions)

---

**Remember**: This tab is for testing purposes only. Never install in production environments.
