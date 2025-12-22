"""
File upload and management blueprint.
"""
from flask import Blueprint

bp = Blueprint('upload', __name__)

from . import routes  # noqa