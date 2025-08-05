"""
WebSocket admin authentication manager module.

Handles creation, validation, renewal, and removal of admin sessions
over WebSockets. Reuses existing validate_admin_session logic from admin/utils.
"""

import time
from flask import current_app

# Import the correct validation function
from backend.auth.validation import validate_admin_token

# SESSION_TIMEOUT = 1800  # 30 minutes # Removed

class SocketAuthManager:
    def __init__(self):
        # Store sessions as a mapping of socket id (sid) to last activity timestamp.
        self.admin_sessions = {}  # type: dict[str, float]
        self.connection_timestamps = {}  # Track connection timestamps for all sockets

    def record_connection(self, sid: str) -> None:
        """Record the timestamp when a connection is established.
        
        Args:
            sid (str): The Socket.IO session ID.
        """
        self.connection_timestamps[sid] = time.time()
        current_app.logger.debug(f"Recorded connection timestamp for SID: {sid}")
        
    def generate_challenge(self, sid: str) -> dict:
        """Generate a secure authentication challenge for the client.
        
        Args:
            sid (str): The Socket.IO session ID.
            
        Returns:
            dict: The challenge data containing nonce, timestamp, and sid.
        """
        import os
        import base64
        
        # Check if we have a connection timestamp for this sid
        if sid not in self.connection_timestamps:
            current_app.logger.warning(f"No connection timestamp for SID: {sid} when generating challenge")
            self.connection_timestamps[sid] = time.time()
            
        # Generate a random nonce (number used once)
        nonce = base64.b64encode(os.urandom(16)).decode('utf-8')
        
        # Create the challenge
        challenge = {
            'nonce': nonce,
            'timestamp': str(self.connection_timestamps[sid]),
            'sid': sid
        }
        
        current_app.logger.debug(f"Generated auth challenge for SID: {sid}")
        return challenge

    def create_session(self, sid: str, token: str) -> (bool, str):
        """Validate token and create an admin session for the socket.

        Args:
            sid (str): The Socket.IO session ID.
            token (str): The authentication token provided by the client.

        Returns:
            tuple: (True, message) if successful; (False, error message) otherwise.
        """
        if not token:
            return False, "Missing authentication token"
        
        # Log token being validated
        current_app.logger.info(f"WebSocket auth - validating token for SID {sid}")
        
        # Use the auth.validation function directly
        if validate_admin_token(token):
            self.admin_sessions[sid] = time.time()
            current_app.logger.info(f"Admin session created for SID: {sid}")
            return True, "Authentication successful"
        else:
            current_app.logger.warning(f"Invalid admin token provided for SID: {sid}")
            return False, "Invalid authentication token"

    def validate_socket(self, sid: str) -> bool:
        """Check if the socket has an active admin session.

        Args:
            sid (str): The Socket.IO session ID.

        Returns:
            bool: True if session is active, False otherwise.
        """
        return sid in self.admin_sessions

    def remove_session(self, sid: str) -> None:
        """Remove the admin session associated with the socket.

        Args:
            sid (str): The Socket.IO session ID.
        """
        if sid in self.admin_sessions:
            current_app.logger.info(f"Removing admin session for SID: {sid}")
            del self.admin_sessions[sid]
            
    def authenticate(self, sid: str, encrypted_payload: str, client_timestamp: str, nonce: str) -> bool:
        """Authenticate admin using encrypted credentials.
        
        Args:
            sid (str): The Socket.IO session ID.
            encrypted_payload (str): The encrypted authentication payload.
            client_timestamp (str): The timestamp from the challenge.
            nonce (str): The nonce from the challenge.
            
        Returns:
            bool: True if authentication successful, False otherwise.
        """
        try:
            import base64
            import hashlib
            from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
            from cryptography.hazmat.primitives import padding
            from cryptography.hazmat.backends import default_backend
            
            # Verify we have a connection timestamp for this SID
            if sid not in self.connection_timestamps:
                current_app.logger.warning(f"No connection timestamp for SID: {sid}")
                return False
                
            # Verify the challenge timestamp matches what we sent
            if str(self.connection_timestamps[sid]) != client_timestamp:
                current_app.logger.warning(f"Timestamp mismatch for SID: {sid}")
                return False
            
            # Get admin PIN from configuration
            from flask import current_app
            admin_pin = current_app.config.get('ADMIN_PIN')
            
            # Check if admin PIN is configured
            if not admin_pin:
                current_app.logger.error("No ADMIN_PIN configured in application settings")
                return False
                
            # Decode the encrypted payload
            payload_bytes = base64.b64decode(encrypted_payload)
            
            # Extract IV (first 16 bytes) and ciphertext
            iv = payload_bytes[:16]
            ciphertext = payload_bytes[16:]
            
            # Create a simple key using a hash of the challenge parameters
            salt = f"{sid}:{client_timestamp}:{nonce}".encode('utf-8')
            key = hashlib.sha256(admin_pin.encode('utf-8') + salt).digest()
            
            try:
                # Decrypt the payload
                cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
                decryptor = cipher.decryptor()
                
                # Remove padding after decryption
                padded_data = decryptor.update(ciphertext) + decryptor.finalize()
                unpadder = padding.PKCS7(128).unpadder()
                plaintext = unpadder.update(padded_data) + unpadder.finalize()
                
                # The plaintext should be the PIN itself
                pin = plaintext.decode('utf-8')
                
                # Validate PIN against stored admin PIN
                if validate_admin_token(pin):
                    # Create admin session
                    self.admin_sessions[sid] = time.time()
                    current_app.logger.info(f"Admin authentication successful for SID: {sid}")
                    return True
                else:
                    current_app.logger.warning(f"Invalid PIN provided for SID: {sid}")
                    return False
            except Exception as e:
                current_app.logger.error(f"Decryption error: {str(e)}")
                return False
                
        except Exception as e:
            current_app.logger.error(f"Authentication error: {str(e)}")
            return False 