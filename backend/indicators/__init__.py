"""
Service status indicators blueprint.
"""
from flask import Blueprint

bp = Blueprint('indicators', __name__)

from . import routes  # noqa
from . import tailscale  # Import tailscale routes
from . import vpn  # Import vpn routes