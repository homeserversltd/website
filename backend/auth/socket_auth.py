"""
Socket authentication manager with encryption support.

This module provides a centralized authentication manager for WebSocket connections
that handles admin authentication, session management, and validation.
"""
import time
import hmac
import hashlib
import base64
from typing import Dict, Tuple, Optional
from flask import current_app
from backend.auth.validation import validate_admin_token, get_stored_pin
import os
from backend.utils.utils import decrypt_data

class SocketAuthManager:
    """
    Manages WebSocket authentication for admin functions with encryption.
    
    This class tracks authenticated admin sessions by socket ID (SID).
    Client-side handles inactivity timeout leading to WebSocket disconnect.
    """
    
    def __init__(self):
        """Initialize the Socket Authentication Manager."""
        # Map of socket IDs to their admin session timestamps (time of auth)
        self.admin_sessions: Dict[str, float] = {}
        self.connection_timestamps: Dict[str, float] = {}
        # self.session_timeout removed - client handles inactivity timeout
        
    def record_connection(self, sid: str) -> None:
        """
        Record when a socket initially connects.
        
        Args:
            sid: Socket ID to track
        """
        self.connection_timestamps[sid] = time.time()
        
    def generate_challenge(self, sid: str) -> Dict[str, str]:
        """
        Generate an authentication challenge for the client.
        
        Args:
            sid: Socket ID requesting authentication
            
        Returns:
            Dict with nonce and timestamp for client to use in encryption
        """
        # Generate a random nonce
        nonce = base64.b64encode(os.urandom(16)).decode('utf-8')
        timestamp = str(int(time.time()))
        
        return {
            'nonce': nonce,
            'timestamp': timestamp,
            'sid': sid
        }
        
    def authenticate(self, sid: str, encrypted_payload: str, client_timestamp: str, nonce: str) -> bool:
        """
        Authenticate using encrypted credentials.
        
        Args:
            sid: Socket ID to authenticate
            encrypted_payload: Encrypted authentication payload
            client_timestamp: Timestamp used in encryption (currently unused after refactor)
            nonce: One-time value used in encryption (currently unused after refactor)
            
        Returns:
            bool: True if authentication successful, False otherwise
        """
        try:
            current_app.logger.info(f"AUTH: Authenticating SID: {sid} with encrypted payload (len={len(encrypted_payload)}) and client timestamp {client_timestamp}")

            decrypted_pin = None

            # Approach 1: Attempt AES-CBC decryption using the utility function
            current_app.logger.info("AUTH: Attempting AES-CBC decryption via utility...")
            decrypted_pin = decrypt_data(encrypted_payload)

            if decrypted_pin is not None:
                current_app.logger.info(f"AUTH: AES decryption successful via utility. Decrypted PIN: {decrypted_pin[:2]}*** (first 2 chars shown)")
                # If AES decryption worked, validate the *decrypted* pin
                current_app.logger.info(f"AUTH: Validating decrypted AES PIN...")
                if validate_admin_token(decrypted_pin):
                    self.admin_sessions[sid] = time.time()
                    current_app.logger.info(f"AUTH: Socket {sid} authenticated as admin (AES validated). Admin sessions: {list(self.admin_sessions.keys())}")
                    return True
                else:
                    current_app.logger.warning(f"AUTH: Decrypted AES PIN validation failed.")
            else:
                current_app.logger.warning(f"AUTH: AES decryption failed via utility. Proceeding to fallback methods.")
            
            # Fallback: If AES didn\'t work or validation failed, try validate_admin_token on the original payload
            # This covers Base64, raw pin, etc., as handled within validate_admin_token itself
            current_app.logger.info(f"AUTH: AES failed or invalid. Falling back to validate original payload...")
            if validate_admin_token(encrypted_payload): # Validate the raw payload received
                self.admin_sessions[sid] = time.time()
                current_app.logger.info(f"AUTH: Socket {sid} authenticated as admin (Fallback validated). Admin sessions: {list(self.admin_sessions.keys())}")
                return True
            
            # If all methods fail
            current_app.logger.error(f"AUTH: All authentication approaches failed for SID {sid}")
            return False
                
        except Exception as e:
            # Catch any unexpected errors during the process
            current_app.logger.error(f"AUTH: Error during overall admin authentication for SID {sid}: {str(e)}")
            return False
    
    def validate_socket(self, sid: str) -> bool:
        """
        Check if a socket has an active admin session.
        
        Args:
            sid: Socket ID to validate
            
        Returns:
            bool: True if socket has valid admin privileges, False otherwise
        """
        current_app.logger.debug(f"Validating socket {sid}. Admin sessions: {list(self.admin_sessions.keys())}")
        
        if sid not in self.admin_sessions:
            current_app.logger.debug(f"Socket {sid} not found in admin sessions")
            return False
            
        # Server-side timeout logic removed. Client handles inactivity leading to WS disconnect.
        # The presence of sid in self.admin_sessions implies it's admin-authenticated.
            
        current_app.logger.debug(f"Socket {sid} validated as admin")
        return True
        
    def remove_session(self, sid: str) -> None:
        """
        Remove admin session for a socket (e.g., on disconnect).
        
        Args:
            sid: Socket ID to remove from admin sessions
        """
        if sid in self.admin_sessions:
            del self.admin_sessions[sid]
            current_app.logger.info(f"Removed admin session for socket {sid}")
            
        # Also clean up connection timestamp
        if sid in self.connection_timestamps:
            del self.connection_timestamps[sid]

    # renew_session method removed as server no longer manages session expiry.
    # set_timeout method removed as server no longer manages session expiry. 