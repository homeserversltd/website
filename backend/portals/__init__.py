"""
Portal management blueprint.
"""
from flask import Blueprint

bp = Blueprint('portals', __name__)

from . import routes  # noqa
