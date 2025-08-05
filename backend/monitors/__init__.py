"""
Monitors blueprint initialization.
"""
from flask import Blueprint

bp = Blueprint('monitors', __name__)

# Remove circular imports by deferring to bottom
# from .power import PowerMonitor
# from .system import SystemStatsMonitor
# from .services import ServicesMonitor
# from .internet import InternetStatusMonitor

__all__ = [
    'PowerMonitor',
    'SystemStatsMonitor',
    'ServicesMonitor',
    'InternetStatusMonitor',
    'TailscaleMonitor',
    'VPNMonitor',
    'DiskMonitor',
    'HardDriveTestMonitor',
    'SyncMonitor'
]

# Add imports after blueprint creation to avoid circular dependencies
from .power import PowerMonitor  # noqa: E402
from .system import SystemStatsMonitor  # noqa: E402
from .services import ServicesMonitor  # noqa: E402
from .internet import InternetStatusMonitor  # noqa: E402
from .tailscale import TailscaleMonitor  # noqa: E402
from .vpn import VPNMonitor  # noqa: E402
from .disk import DiskMonitor  # noqa: E402
from .harddrivetest import HardDriveTestMonitor  # noqa: E402
from .sync import SyncMonitor  # noqa: E402