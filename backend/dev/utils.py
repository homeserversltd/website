import os
import subprocess
import json
from flask import current_app, jsonify
from backend.utils.utils import execute_command, error_response, success_response, get_config
from backend.monitors.disk import DiskMonitor

def success_response(message, data=None):
    """
    Create a standardized success response.
    
    Args:
        message (str): Success message
        data (dict, optional): Additional data to include
        
    Returns:
        tuple: (response, status_code)
    """
    response = {
        'status': 'success',
        'message': message
    }
    if data:
        response['data'] = data
    return jsonify(response), 200

def error_response(message, status_code=500, data=None):
    """
    Create a standardized error response.
    
    Args:
        message (str): Error message
        status_code (int): HTTP status code
        data (dict, optional): Additional data to include
        
    Returns:
        tuple: (response, status_code)
    """
    response = {
        'status': 'error',
        'message': message
    }
    if data:
        response['data'] = data
    return jsonify(response), status_code
