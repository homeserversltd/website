"""
Premium tab management package.

This package provides backend API endpoints for managing premium tabs:
- Repository validation and cloning
- Individual tab installation/uninstallation  
- Batch operations (install-all/uninstall-all)
- Status monitoring and conflict detection
- Operation logs and diagnostics

All operations are performed through the existing installer.py script
to maintain consistency with the atomic installation philosophy.
"""
from . import routes  # noqa - Import routes to register endpoints 