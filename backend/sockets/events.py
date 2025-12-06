"""
Socket.IO event handlers and connection management.
"""
import time
from collections import defaultdict
import eventlet
from flask import request, current_app
from backend import socketio, create_app
from backend.broadcasts.events import broadcast_manager

# --- NEW IMPORTS FOR ADMIN AUTH ---
from .auth import SocketAuthManager
from backend.auth.decorators import socket_admin_required, global_socket_auth_manager
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend
import base64
import os

class ConnectionManager:
    """Manage WebSocket connections and enforce limits."""
    def __init__(self):
        self.connections_per_ip = defaultdict(set)
        self.connection_times = defaultdict(list)
        self.connection_info = {}
        self.heartbeat_timestamps = {}
        
    def can_connect(self, ip: str) -> bool:
        """Check if a new connection is allowed from this IP."""
        current_time = time.time()
        
        # Clean up potential zombie connections first
        self._cleanup_zombies(ip)
        
        # Clean up old connection times
        self.connection_times[ip] = [t for t in self.connection_times[ip] 
                                   if current_time - t < current_app.config['RATE_LIMIT_WINDOW']]
        
        # Check rate limit
        if len(self.connection_times[ip]) >= current_app.config['MAX_CONNECTIONS_PER_WINDOW']:
            current_app.logger.warning(f"IP {ip} exceeded connection rate limit")
            self._dump_connection_state(ip)
            return False
            
        # Check concurrent connection limit
        if len(self.connections_per_ip[ip]) >= current_app.config['MAX_CONNECTIONS_PER_IP']:
            current_app.logger.warning(f"IP {ip} exceeded max concurrent connections")
            self._dump_connection_state(ip)
            return False
            
        return True
        
    def add_connection(self, ip: str, sid: str) -> None:
        """Track a new connection."""
        current_time = time.time()
        self.connections_per_ip[ip].add(sid)
        self.connection_times[ip].append(current_time)
        self.heartbeat_timestamps[sid] = current_time
        
        # Store detailed connection info
        self.connection_info[sid] = {
            'ip': ip,
            'connected_at': current_time,
            'last_heartbeat': current_time,
            'user_agent': request.headers.get('User-Agent', 'Unknown'),
            'origin': request.headers.get('Origin', 'Unknown')
        }
        
        current_app.logger.info(f"New connection tracked: {self.connection_info[sid]}")
        
    def remove_connection(self, ip: str, sid: str) -> None:
        """Remove a tracked connection."""
        if sid in self.connection_info:
            conn_duration = time.time() - self.connection_info[sid]['connected_at']
            current_app.logger.info(f"Connection removed: {self.connection_info[sid]}, duration: {conn_duration:.2f}s")
            del self.connection_info[sid]
            
        self.connections_per_ip[ip].discard(sid)
        self.heartbeat_timestamps.pop(sid, None)
        
        if not self.connections_per_ip[ip]:
            del self.connections_per_ip[ip]
            
    def update_heartbeat(self, sid: str) -> None:
        """Update last heartbeat time for a connection."""
        if sid in self.connection_info:
            current_time = time.time()
            self.connection_info[sid]['last_heartbeat'] = current_time
            self.heartbeat_timestamps[sid] = current_time
            
    def _cleanup_zombies(self, ip: str) -> None:
        """Clean up zombie connections for an IP."""
        current_time = time.time()
        zombie_sids = set()
        
        for sid in list(self.connections_per_ip[ip]):
            if sid not in self.connection_info:
                zombie_sids.add(sid)
                continue
                
            last_heartbeat = self.connection_info[sid]['last_heartbeat']
            if current_time - last_heartbeat > current_app.config['ZOMBIE_TIMEOUT']:
                zombie_sids.add(sid)
                
        if zombie_sids:
            current_app.logger.info(f"Found {len(zombie_sids)} zombie connections for IP {ip}")
            for sid in zombie_sids:
                self.remove_connection(ip, sid)
                try:
                    if hasattr(socketio.server, 'eio') and \
                       hasattr(socketio.server.eio, 'sockets') and \
                       sid in socketio.server.eio.sockets:
                        socketio.server.eio.sockets[sid].close(wait=False)
                except Exception as e:
                    current_app.logger.error(f"Error closing zombie socket {sid}: {e}")
                    
    def _dump_connection_state(self, ip: str) -> None:
        """Dump detailed connection state for an IP for debugging."""
        current_app.logger.info(f"""
Connection State for IP {ip}:
Active connections: {len(self.connections_per_ip[ip])}
Connection times in window: {len(self.connection_times[ip])}
Detailed connections:
{self._format_connection_details(ip)}
""")
        
    def _format_connection_details(self, ip: str) -> str:
        """Format connection details for logging."""
        details = []
        current_time = time.time()
        for sid in self.connections_per_ip[ip]:
            if sid in self.connection_info:
                info = self.connection_info[sid]
                age = current_time - info['connected_at']
                last_beat = current_time - info['last_heartbeat']
                details.append(f"""
- SID: {sid}
  Age: {age:.2f}s
  Last heartbeat: {last_beat:.2f}s ago
  Origin: {info['origin']}
  User-Agent: {info['user_agent']}""")
            else:
                details.append(f"- SID: {sid} (No detailed info available)")
        return '\n'.join(details)

# Initialize connection manager
connection_manager = ConnectionManager()

# Use the global socket_auth_manager instead of creating a new instance
# socket_auth_manager = SocketAuthManager()
socket_auth_manager = global_socket_auth_manager

@socketio.on('connect')
def handle_connect():
    """Handle new WebSocket connections with proper origin validation and rate limiting."""
    try:
        sid = request.sid
        origin = request.headers.get('Origin', '')
        client_ip = request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or request.remote_addr
        
        current_app.logger.info(f"New connection attempt from {client_ip} ({origin})")
        
        # Validate origin against CORS settings
        if origin not in current_app.config['CORS_ORIGINS']:
            current_app.logger.warning(f"Invalid origin: {origin}")
            return False
            
        # Check rate limits and connection limits
        if not connection_manager.can_connect(client_ip):
            current_app.logger.warning(f"Connection limits exceeded for {client_ip}")
            return False
            
        # Add to connection tracking
        connection_manager.add_connection(client_ip, sid)
        broadcast_manager.handle_connect(sid)
        
        # Record connection timestamp for encryption
        socket_auth_manager.record_connection(sid)
        
        # Send successful connection response
        socketio.emit('connection_status', {
            'status': 'connected',
            'sid': sid,
            'timestamp': time.time(),
            'ip': client_ip
        }, room=sid)
        
        return True
        
    except Exception as e:
        current_app.logger.error(f"Connection error: {str(e)}")
        return False

# Add a new challenge request handler
@socketio.on('auth_challenge_request')
def handle_auth_challenge():
    """Generate and return an authentication challenge."""
    sid = request.sid
    challenge = socket_auth_manager.generate_challenge(sid)
    socketio.emit('auth_challenge', challenge, room=sid)

# Update the admin auth handler
@socketio.on('admin_auth')
def handle_admin_auth(data):
    """
    Handle admin WebSocket authentication using encrypted credentials.
    """
    sid = request.sid
    current_app.logger.debug(f"ADMIN AUTH ATTEMPT: SID={sid}, data={data}")
    
    try:
        # Log all active connections for debugging
        current_app.logger.debug(f"ADMIN AUTH: Active connections by IP: {dict(connection_manager.connections_per_ip)}")
        current_app.logger.debug(f"ADMIN AUTH: Connection timestamps: {list(socket_auth_manager.connection_timestamps.keys())}")
        current_app.logger.debug(f"ADMIN AUTH: Admin sessions before auth: {list(socket_auth_manager.admin_sessions.keys())}")
        current_app.logger.debug(f"ADMIN AUTH: socket_auth_manager instance ID: {id(socket_auth_manager)}")
        
        # Extract authentication parameters
        encrypted_payload = data.get('encrypted_payload')
        client_timestamp = data.get('timestamp')
        nonce = data.get('nonce')
        
        # Validate parameters
        if not encrypted_payload:
            current_app.logger.warning("ADMIN AUTH: Missing encrypted_payload parameter")
            socketio.emit('admin_auth_response', {
                "status": "error",
                "message": "Missing encrypted_payload parameter"
            }, room=sid)
            return
            
        if not client_timestamp:
            current_app.logger.warning("ADMIN AUTH: Missing timestamp parameter")
            socketio.emit('admin_auth_response', {
                "status": "error",
                "message": "Missing timestamp parameter"
            }, room=sid)
            return
            
        if not nonce:
            current_app.logger.warning("ADMIN AUTH: Missing nonce parameter")
            socketio.emit('admin_auth_response', {
                "status": "error",
                "message": "Missing nonce parameter"
            }, room=sid)
            return
        
        # Log authentication attempt details
        current_app.logger.debug(f"ADMIN AUTH: Parameters validated for SID: {sid}")
        current_app.logger.debug(f"ADMIN AUTH: encrypted_payload length: {len(encrypted_payload)}")
        current_app.logger.debug(f"ADMIN AUTH: client_timestamp: {client_timestamp}")
        current_app.logger.debug(f"ADMIN AUTH: nonce length: {len(nonce)}")
        
        # Check if connection timestamp exists
        if sid not in socket_auth_manager.connection_timestamps:
            current_app.logger.warning(f"ADMIN AUTH: No connection timestamp for SID: {sid}")
            socketio.emit('admin_auth_response', {
                "status": "error",
                "message": "No connection record found"
            }, room=sid)
            return
            
        current_app.logger.debug(f"ADMIN AUTH: Found connection timestamp for SID: {sid}")
        current_app.logger.debug(f"ADMIN AUTH: Calling socket_auth_manager.authenticate for SID: {sid}")
        
        # Attempt authentication
        try:
            success = socket_auth_manager.authenticate(
                sid, 
                encrypted_payload, 
                client_timestamp,
                nonce
            )
            
            current_app.logger.debug(f"ADMIN AUTH: Authentication completed for SID: {sid}, result: {success}")
            
        except Exception as auth_error:
            current_app.logger.error(f"ADMIN AUTH: Exception in authenticate method: {str(auth_error)}")
            socketio.emit('admin_auth_response', {
                "status": "error",
                "message": f"Authentication error: {str(auth_error)}"
            }, room=sid)
            return
        
        # Log admin sessions after authentication attempt
        current_app.logger.debug(f"ADMIN AUTH: Admin sessions after auth: {list(socket_auth_manager.admin_sessions.keys())}")
        current_app.logger.debug(f"ADMIN AUTH: Authentication result for SID {sid}: {success}")
        
        # Send response based on authentication result
        if success:
            current_app.logger.debug(f"ADMIN AUTH: Successful for SID: {sid}")
            socketio.emit('admin_auth_response', {
                "status": "authenticated",
                "message": "Admin authentication successful"
            }, room=sid)
        else:
            current_app.logger.warning(f"ADMIN AUTH: Failed for SID: {sid}")
            socketio.emit('admin_auth_response', {
                "status": "error",
                "message": "Authentication failed"
            }, room=sid)
            
    except Exception as e:
        current_app.logger.error(f"ADMIN AUTH: Unhandled exception: {str(e)}")
        socketio.emit('admin_auth_response', {
            "status": "error",
            "message": "Internal server error during authentication"
        }, room=sid)

@socketio.on('disconnect')
def handle_disconnect(reason=None):
    """Handle WebSocket disconnections with proper cleanup."""
    try:
        sid = request.sid
        client_ip = request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or request.remote_addr
        
        current_app.logger.info(f"Client disconnecting: {sid} from {client_ip} (reason: {reason})")
        
        # Clean up connection state
        connection_manager.remove_connection(client_ip, sid)
        broadcast_manager.handle_disconnect(sid)
        # Remove admin session if it exists.
        socket_auth_manager.remove_session(sid)
        
    except Exception as e:
        current_app.logger.error(f"Error in disconnect handler: {str(e)}")

@socketio.on('heartbeat')
def handle_heartbeat():
    """Handle client heartbeat with immediate acknowledgment."""
    try:
        sid = request.sid
        current_time = time.time()
        
        connection_manager.update_heartbeat(sid)
        
        socketio.emit('heartbeat_ack', {
            'timestamp': current_time,
            'sid': sid
        }, room=sid)
        
    except Exception as e:
        current_app.logger.error(f"Error processing heartbeat: {str(e)}")
        socketio.emit('error', {
            'type': 'heartbeat_error',
            'message': 'Failed to process heartbeat',
            'timestamp': time.time()
        })

# --- SAMPLE ADMIN-ONLY EVENT ---
@socketio.on('admin_command')
@socket_admin_required
def handle_admin_command(data):
    """
    Sample admin command event handler protected by admin auth.
    """
    socketio.emit('admin_command_response', {
        "status": "success",
        "message": "Admin command executed"
    }, room=request.sid)

@socketio.on('subscribe')
def handle_subscription(data):
    """Handle subscription requests."""
    try:
        sid = request.sid
        broadcast_type = data.get('type')
        
        current_app.logger.debug(f"[DEBUG_SUB_BACKEND] handle_subscription ENTRY: sid='{sid}', broadcast_type='{broadcast_type}'")
        # current_app.logger.debug(f"[DEBUG_SUB_BACKEND] handle_subscription: Subscribers for '{broadcast_type}' BEFORE is_subscribed check: {broadcast_manager.subscribers.get(broadcast_type, set())}")

        if not broadcast_type:
            current_app.logger.warning(f"Invalid subscription request from {sid}: missing type")
            return
            
        # Check if already subscribed
        is_already_subscribed = broadcast_manager.is_subscribed(broadcast_type, sid)
        # current_app.logger.debug(f"[DEBUG_SUB_BACKEND] handle_subscription: Result of broadcast_manager.is_subscribed('{broadcast_type}', '{sid}'): {is_already_subscribed}")

        if is_already_subscribed:
            current_app.logger.debug(f"[DEBUG_SUB_BACKEND] Client {sid} already subscribed to {broadcast_type}, ignoring duplicate request in handle_subscription.")
            return
            
        # Add new subscription
        broadcast_manager.add_subscriber(broadcast_type, sid)
        
        # Send confirmation to client
        socketio.emit('subscription_update', {
            'type': broadcast_type,
            'status': 'subscribed',
            'timestamp': time.time(),
            'sid': sid
        }, room=sid)
        
        current_app.logger.debug(f"Subscribed {sid} to {broadcast_type}")
        
    except Exception as e:
        current_app.logger.error(f"Error handling subscription: {str(e)}")
        socketio.emit('subscription_update', {
            'status': 'error',
            'message': str(e),
            'timestamp': time.time()
        }, room=sid)

@socketio.on('unsubscribe')
def handle_unsubscription(data):
    """Handle unsubscription requests."""
    try:
        if not data or 'type' not in data:
            raise ValueError("Missing broadcast type")
            
        broadcast_type = data['type']
        sid = request.sid

        current_app.logger.debug(f"[DEBUG_SUB_BACKEND] handle_unsubscription ENTRY: sid='{sid}', broadcast_type='{broadcast_type}'")
        # current_app.logger.debug(f"[DEBUG_SUB_BACKEND] handle_unsubscription: Subscribers for '{broadcast_type}' BEFORE remove_subscriber call: {broadcast_manager.subscribers.get(broadcast_type, set())}")
        
        broadcast_manager.remove_subscriber(broadcast_type, sid)
        
        socketio.emit('subscription_update', {
            'type': broadcast_type,
            'status': 'unsubscribed',
            'timestamp': time.time(),
            'sid': sid
        })
        
        current_app.logger.info(f"Unsubscribed {sid} from {broadcast_type}")
        
    except Exception as e:
        current_app.logger.error(f"Error in unsubscription handler: {str(e)}")
        socketio.emit('subscription_update', {
            'status': 'error',
            'message': str(e),
            'timestamp': time.time()
        })

@socketio.on_error()
def error_handler(e):
    """Handle WebSocket errors."""
    current_app.logger.error(f"WebSocket error: {str(e)}")
    try:
        if hasattr(request, 'sid'):
            broadcast_manager.remove_all_subscriptions(request.sid)
            broadcast_manager.connected_sids.discard(request.sid)
    except Exception as ex:
        current_app.logger.error(f"Error in error handler: {str(ex)}")

def cleanup_websocket_state():
    """Clean up WebSocket state in a non-blocking way using eventlet."""
    try:
        current_app.logger.info("Starting WebSocket state cleanup...")
        
        # Clear broadcast manager state
        broadcast_manager.subscribers.clear()
        broadcast_manager.connected_sids.clear()
        broadcast_manager.events.clear()
        
        # Reset all events
        for event in broadcast_manager.events.values():
            try:
                event.reset()
            except Exception as e:
                current_app.logger.error(f"Error resetting event: {e}")
                
        # Clear connection manager state
        connection_manager.connections_per_ip.clear()
        connection_manager.connection_times.clear()
        connection_manager.connection_info.clear()
        connection_manager.heartbeat_timestamps.clear()
        
        def disconnect_clients():
            try:
                if hasattr(socketio.server, 'eio') and hasattr(socketio.server.eio, 'sockets'):
                    connected_sids = list(socketio.server.eio.sockets.keys())
                    
                    for sid in connected_sids:
                        try:
                            socketio.emit('server_shutdown', {
                                'message': 'Server is shutting down',
                                'code': 'shutdown',
                                'timestamp': time.time()
                            }, room=sid)
                            
                            if sid in socketio.server.eio.sockets:
                                socketio.server.eio.sockets[sid].close(wait=False)
                                del socketio.server.eio.sockets[sid]
                        except Exception as e:
                            current_app.logger.error(f"Error handling disconnect for {sid}: {e}")
                            
                # Clear Socket.IO state
                if hasattr(socketio.server, 'eio'):
                    socketio.server.eio.sockets.clear()
                    
                if hasattr(socketio.server, 'environ'):
                    socketio.server.environ.clear()
                    
            except Exception as e:
                current_app.logger.error(f"Error in disconnect_clients: {e}")
                
        # Spawn disconnect in separate greenlet
        eventlet.spawn(disconnect_clients)
        current_app.logger.info("WebSocket cleanup tasks initiated")
        
    except Exception as e:
        current_app.logger.error(f"Error during cleanup: {e}")

def log_connection_status(app):
    """Periodically log connection status with app context."""
    while True:
        with app.app_context():
            try:
                total_connections = len(broadcast_manager.connected_sids)
                
                # Skip logging if no connections
                if total_connections == 0:
                    eventlet.sleep(60)
                    continue
                
                connections_by_ip = defaultdict(list)
                for sid in broadcast_manager.connected_sids:
                    if sid in connection_manager.connection_info:
                        ip = connection_manager.connection_info[sid]['ip']
                        connections_by_ip[ip].append(sid)
                
                current_app.logger.info(f"""
Connection Status Report:
Total Active Connections: {total_connections}
Connections by IP: {dict(connections_by_ip)}
""")
                
                # Check for suspicious patterns
                for ip, sids in connections_by_ip.items():
                    if len(sids) > 1:
                        current_app.logger.warning(f"Multiple connections from IP {ip}: {sids}")
                    
            except Exception as e:
                current_app.logger.error(f"Status logger error: {str(e)}")
            eventlet.sleep(60) 