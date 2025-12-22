"""
Admin functionality blueprint.
"""
from flask import Blueprint

bp = Blueprint('admin', __name__)

from . import routes  # noqa
from . import diskman  # noqa
from . import keyman  # noqa
from . import controlman  # noqa
from . import premium  # noqa
from . import updates  # noqa