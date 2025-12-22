"""
Tab management blueprint.
"""
from flask import Blueprint

bp = Blueprint('tabman', __name__)

from . import routes  # noqa