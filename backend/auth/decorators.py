"""
Socket admin decorator.

Provides the @socket_admin_required decorator to protect WebSocket handlers,
the @admin_required decorator for HTTP routes, and the @visibility_required
decorator to control access based on UI element visibility settings.

======================================================================
HOW TO INTERFACE WITH DECORATORS:

1. @socket_admin_required:
   - Purpose: Ensures a WebSocket event handler executes only if the
     socket connection has an active, valid admin session. Protects
     admin-only events by verifying prior authentication via 'admin_auth'.
   - Session Validation: Retrieves SID via `request.sid`, calls
     `validate_socket(sid)` on `SocketAuthManager`.
   - Error Handling: Raises `ConnectionRefusedError` if session is
     missing/expired or SID is absent.
   - Usage: Apply `@socket_admin_required` above WebSocket event
     handlers needing admin restriction.

2. @admin_required:
   - Purpose: Restricts access to HTTP routes to admin-authenticated
     users.
   - Validation: Uses `validate_admin_request()` to check for a valid
     admin session (typically cookie-based).
   - Error Handling: Returns a JSON error with HTTP status 401 if
     authentication fails, or 500 for internal errors during validation.
   - Usage: Apply `@admin_required` to HTTP route functions that
     should only be accessible by administrators.

3. @visibility_required(tab_id: str, element_id: str):
   - Purpose: Restricts access to HTTP routes based on the visibility
     configuration of a specific UI element. If the requesting user is
     admin-authenticated, the visibility check is bypassed.
   - Configuration: Reads visibility status from `homeserver.json`
     (path from `current_app.config['HOMESERVER_CONFIG']`).
     Checks `tabs[tab_id].visibility.elements[element_id]` and
     `tabs[tab_id].visibility.tab`.
   - Admin Bypass: If `validate_admin_request()` returns true, the user
     is granted access regardless of visibility settings.
   - Error Handling: Returns a JSON error with HTTP status 403 if the
     element is not visible and the user is not an admin.
   - Usage: Apply `@visibility_required(tab_id="...", element_id="...")`
     to HTTP route functions. This decorator should typically be placed
     *after* an authentication decorator like `@admin_required` if both
     are used, to ensure auth is checked first.

General Guidelines:
   - Ensure client-side applications handle authentication flows correctly
     before attempting to access protected resources.
   - These decorators centralize access control logic. Avoid redundant
     checks within your handlers/routes.
======================================================================
"""
from functools import wraps
from flask import request, current_app, jsonify
from backend.auth.socket_auth import SocketAuthManager
from backend.auth.validation import validate_admin_request
from backend.auth.utils import _is_element_visible
import json

# Use a global instance to validate admin sessions.
global_socket_auth_manager = SocketAuthManager()

def socket_admin_required(f):
    """Decorator to ensure that the socket connection is authenticated as admin.
    
    Raises:
        ConnectionRefusedError: If the socket's admin session is invalid or expired.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        sid = getattr(request, 'sid', None)
        if not sid:
            current_app.logger.error("No SID found in request for admin-only event")
            raise ConnectionRefusedError("Admin authentication required")
        if not global_socket_auth_manager.validate_socket(sid):
            current_app.logger.warning(f"Admin auth required for SID: {sid}")
            raise ConnectionRefusedError("Admin authentication required")
        return f(*args, **kwargs)
    return wrapper

def admin_required(f):
    """Decorator for admin-only HTTP routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            if not validate_admin_request():
                return jsonify({'error': 'Admin authentication required'}), 401
            return f(*args, **kwargs)
        except Exception as e:
            current_app.logger.error(f'Admin validation error: {str(e)}')
            return jsonify({'error': 'Internal server error'}), 500
    return decorated_function

def visibility_required(tab_id: str, element_id: str):
    """Decorator for HTTP routes that require a specific element to be visible.
    
    Bypasses the visibility check if the request is admin authenticated.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # First, check for admin authentication
            if validate_admin_request():
                return f(*args, **kwargs) # Admin bypasses visibility check

            # If not admin, check visibility
            if not _is_element_visible(tab_id, element_id):
                current_app.logger.warning(
                    f"Access denied to non-admin for non-visible element: {tab_id}/{element_id}"
                )
                return jsonify({'error': f'Access to this feature ({tab_id}/{element_id}) is currently disabled.'}), 403
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator 