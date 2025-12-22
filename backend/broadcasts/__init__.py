"""
Broadcasts blueprint initialization.
"""
from flask import Blueprint

bp = Blueprint('broadcasts', __name__)

# Remove circular imports by using delayed imports in the modules that need them 
# instead of importing everything at package level
# from . import events  # noqa
# from . import routes  # noqa
# from . import comparisons  # noqa
# from . import manager  # noqa

# Only export Blueprint instance publicly
__all__ = ['bp']