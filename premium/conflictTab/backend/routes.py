"""
Conflict Premium Tab Routes
Minimal blueprint for testing cross-tab validation
"""

from flask import Blueprint, jsonify

# Create blueprint for conflict tab
bp = Blueprint('conflictTab', __name__, url_prefix='/api/conflict')

@bp.route('/status')
def status():
    """Basic status endpoint for conflict tab"""
    return jsonify({
        'status': 'active',
        'tab': 'conflictTab',
        'message': 'Conflict tab is running'
    }) 