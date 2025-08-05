"""
Core admin validation functions with minimal dependencies.

This module contains basic validation functions that are used by both
the HTTP routes and WebSocket authentication systems, without creating
circular dependencies.
"""
import json
import time
import os
import uuid
import hashlib
import base64
import random
from typing import Dict, Optional, Tuple
from datetime import datetime, timedelta
from flask import current_app, request

# Store for admin session tokens - in-memory cache of valid tokens
# Format: {'token': {'created': timestamp, 'expires': timestamp}}
ADMIN_TOKENS: Dict[str, Dict[str, float]] = {}
# Default token expiry time in seconds (30 minutes)
TOKEN_EXPIRY_TIME = 30 * 60

def generate_admin_token() -> str:
    """
    Generate a secure random token for admin sessions.
    
    Returns:
        str: A unique secure token string
    """
    # Create a unique token using UUID + timestamp + random bytes
    random_bytes = os.urandom(16)
    timestamp = str(time.time()).encode()
    unique_id = str(uuid.uuid4()).encode()
    
    # Create a hash of these components
    token_hash = hashlib.sha256()
    token_hash.update(random_bytes)
    token_hash.update(timestamp)
    token_hash.update(unique_id)
    
    # Return as URL-safe base64 string
    return base64.urlsafe_b64encode(token_hash.digest()).decode('utf-8')

def register_admin_token(token: str) -> None:
    """
    Register a new admin token in the token store.
    
    Args:
        token: The token to register
    """
    now = time.time()
    ADMIN_TOKENS[token] = {
        'created': now,
        'expires': now + TOKEN_EXPIRY_TIME
    }
    # Log token registration with expiry time
    current_app.logger.info(f"Registered new admin token: {token[:5]}*** (expires in {TOKEN_EXPIRY_TIME/60} minutes)")

def validate_token_expiry(token: str) -> bool:
    """
    Check if a token exists and has not expired.
    
    Args:
        token: Token to validate
        
    Returns:
        bool: True if token is valid and not expired; False otherwise
    """
    if token not in ADMIN_TOKENS:
        return False
        
    now = time.time()
    if ADMIN_TOKENS[token]['expires'] < now:
        # Token has expired, remove it
        del ADMIN_TOKENS[token]
        return False
        
    # Valid token - refresh its expiry time
    ADMIN_TOKENS[token]['expires'] = now + TOKEN_EXPIRY_TIME
    return True

def clean_expired_tokens() -> None:
    """
    Clean up any expired tokens from the token store.
    """
    now = time.time()
    expired_tokens = [token for token, data in ADMIN_TOKENS.items() if data['expires'] < now]
    
    for token in expired_tokens:
        del ADMIN_TOKENS[token]
        
    if expired_tokens:
        current_app.logger.info(f"Cleaned up {len(expired_tokens)} expired admin tokens")

def validate_pin(pin: str) -> bool:
    """
    Validate PIN against stored configuration.
    
    Args:
        pin: PIN to validate
        
    Returns:
        bool: True if PIN is valid; False otherwise
    """
    try:
        config_path = current_app.config['HOMESERVER_CONFIG']
        
        # Check if file exists
        if not os.path.exists(config_path):
            current_app.logger.error(f"Config file does not exist at path: {config_path}")
            return False
            
        with open(config_path) as f:
            config = json.load(f)
            
        stored_pin = config.get('global', {}).get('admin', {}).get('pin')
        
        if not stored_pin:
            current_app.logger.error("Admin PIN not configured in homeserver.json")
            return False
            
        # Ensure both are compared as strings
        return str(pin) == str(stored_pin)
        
    except Exception as e:
        current_app.logger.error(f"Error validating PIN: {str(e)}")
        return False

def validate_admin_token(token: str) -> bool:
    """
    Validate an admin token.
    
    First checks if it's a session token in our token store.
    If not found, falls back to checking if it's the actual PIN.
    
    Args:
        token: Token to validate
        
    Returns:
        bool: True if token is valid; False otherwise
    """
    try:
        # First check if it's a valid session token
        if validate_token_expiry(token):
            current_app.logger.debug(f"VALIDATE TOKEN: Valid session token: {token[:5]}***")
            return True
        
        # Otherwise, fall back to PIN validation for backward compatibility
        config_path = current_app.config['HOMESERVER_CONFIG']
        current_app.logger.debug(f"VALIDATE TOKEN: Falling back to PIN validation. Using config at: {config_path}")
        
        # Check if file exists
        if not os.path.exists(config_path):
            current_app.logger.error(f"VALIDATE TOKEN: Config file does not exist at path: {config_path}")
            return False
            
        with open(config_path) as f:
            config = json.load(f)
            
        stored_pin = config.get('global', {}).get('admin', {}).get('pin')
        
        # Debug logging to see what PIN is actually found
        current_app.logger.debug(f"VALIDATE TOKEN: Found PIN in config: '{stored_pin[:2]}***' (type: {type(stored_pin).__name__})")
        current_app.logger.debug(f"VALIDATE TOKEN: Comparing with token: '{token[:2]}***' (type: {type(token).__name__})")
        
        if not stored_pin:
            current_app.logger.error("VALIDATE TOKEN: Admin PIN not configured in homeserver.json")
            return False
            
        # Ensure both are compared as strings
        stored_pin_str = str(stored_pin)
        token_str = str(token)
        
        # Direct comparison
        if stored_pin_str == token_str:
            current_app.logger.debug(f"VALIDATE TOKEN: Validation result: True (direct match)")
            return True
            
        # Try to handle base64 encoded token
        try:
            # Check if token might be base64 encoded
            if len(token_str) % 4 == 0 or token_str.endswith('='):
                try:
                    # Try to decode base64
                    decoded = base64.b64decode(token_str).decode('utf-8')
                    current_app.logger.debug(f"VALIDATE TOKEN: Decoded base64 token: '{decoded[:2]}***'")
                    if stored_pin_str == decoded:
                        current_app.logger.debug(f"VALIDATE TOKEN: Validation result: True (base64 match)")
                        return True
                except:
                    pass
        except:
            pass
            
        # Check if token contains the PIN (for cases where there might be padding or extra data)
        if stored_pin_str in token_str:
            current_app.logger.debug(f"VALIDATE TOKEN: Validation result: True (PIN found in token)")
            return True
            
        # Check if the PIN is at the beginning of the token
        if token_str.startswith(stored_pin_str):
            current_app.logger.debug(f"VALIDATE TOKEN: Validation result: True (token starts with PIN)")
            return True
            
        current_app.logger.debug(f"VALIDATE TOKEN: Validation result: False")
        return False
        
    except Exception as e:
        current_app.logger.error(f"VALIDATE TOKEN: Error validating admin token: {str(e)}")
        return False
        
def validate_admin_request() -> bool:
    """
    Validate current request has valid admin credentials.
    
    Returns:
        bool: True if request has valid admin session; False otherwise
    """
    try:
        # Periodically clean expired tokens
        if random.random() < 0.1:  # 10% chance to run cleanup on each request
            clean_expired_tokens()
        
        # Check for admin token in headers
        token = request.headers.get('X-Admin-Token')
        current_app.logger.debug(f"Admin validation requested. Headers: {dict(request.headers)}")
        
        if not token:
            current_app.logger.warning("Admin validation failed: No X-Admin-Token header found")
            return False
            
        current_app.logger.debug(f"Validating admin token: {token[:5]}*** (first 5 chars shown)")
        is_valid = validate_admin_token(token)
        
        if is_valid:
            current_app.logger.debug("Admin validation succeeded")
        else:
            current_app.logger.warning("Admin validation failed: Invalid token")
            
        return is_valid
        
    except Exception as e:
        current_app.logger.error(f"Error validating admin request: {str(e)}")
        return False

def get_stored_pin() -> str:
    """
    Get the stored admin PIN from configuration.
    
    Returns:
        str: The admin PIN or empty string if not found
    """
    try:
        config_path = current_app.config['HOMESERVER_CONFIG']
        
        # Check if file exists
        if not os.path.exists(config_path):
            current_app.logger.error(f"Config file does not exist at path: {config_path}")
            return ""
            
        with open(config_path) as f:
            config = json.load(f)
            
        stored_pin = config.get('global', {}).get('admin', {}).get('pin', "")
        return str(stored_pin)
        
    except Exception as e:
        current_app.logger.error(f"Error retrieving admin PIN: {str(e)}")
        return "" 