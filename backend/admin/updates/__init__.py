"""
Updates management package.

This package provides backend API endpoints for managing updates:
 - Using public git repository we compare our current schema version with the latest version
 - If the latest version is greater than the current version, we update your suite of automated update scripts
 - If the latest version is less than the current version, we do nothing
 - We can also enable and disable modules and components
 - We can also list all modules and components
 - We can also get the status of a module or component
 - We can also get the logs of a module or component
"""
from . import routes  # noqa - Import routes to register endpoints 