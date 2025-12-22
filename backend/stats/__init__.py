"""
System statistics and monitoring blueprint.
"""
from flask import Blueprint

bp = Blueprint('stats', __name__)

from . import routes  # noqa