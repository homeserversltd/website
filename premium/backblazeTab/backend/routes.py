from flask import Blueprint

backblazeTab_bp = Blueprint('backblazeTab', __name__)

@backblazeTab_bp.route('/api/backblazeTab/status', methods=['GET'])
def status():
    return {"status": "stub"}