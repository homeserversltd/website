"""
Dev tools package.
"""
from flask import Blueprint

bp = Blueprint('dev', __name__)

from . import routes  # noqa 