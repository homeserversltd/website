"""
Broadcast management and event handling.
"""
import time
from collections import defaultdict
from typing import Dict, Set, Any, Optional
import eventlet
from flask import current_app
from backend import socketio
from backend.monitors.power import PowerMonitor
from backend.monitors.system import SystemStatsMonitor
from backend.monitors.services import ServicesMonitor
from backend.monitors.internet import InternetStatusMonitor
from backend.monitors.tailscale import TailscaleMonitor
from backend.monitors.vpn import VPNMonitor
from backend.monitors.disk import DiskMonitor
from backend.monitors.harddrivetest import HardDriveTestMonitor
from backend.monitors.sync import SyncMonitor
from .comparisons import should_broadcast

# Import this only when needed, avoid global import to prevent circular dependency
def get_socket_auth_manager():
    from backend.auth.decorators import global_socket_auth_manager
    return global_socket_auth_manager

class BroadcastManager:
    """
    Generic broadcast manager for handling different types of subscriptions.
    Supports multiple broadcast types with individual subscriber sets and broadcasters.
    """
    def __init__(self):
        self.subscribers: Dict[str, Set[str]] = defaultdict(set)
        self.events: Dict[str, eventlet.Event] = {}
        self.broadcasters: Dict[str, Any] = {}
        self.intervals: Dict[str, int] = {}
        self.connected_sids: Set[str] = set()
        self.last_broadcast_data: Dict[str, Any] = {}
        # Track which subscribers have received initial state
        self.initialized_subscribers: Dict[str, Set[str]] = defaultdict(set)
        # Mark broadcast types that are admin-only
        self.admin_only_broadcasts: Set[str] = set()
        # Track broadcast types with admin-specific fields
        self.broadcasts_with_admin_fields: Dict[str, Set[str]] = defaultdict(set)
        
    def handle_connect(self, sid: str) -> None:
        """Handle new WebSocket connection."""
        try:
            self.connected_sids.add(sid)
            current_app.logger.info(f"New WebSocket connection: {sid}")
        except Exception as e:
            current_app.logger.error(f"Error handling connection for {sid}: {str(e)}")
            
    def handle_disconnect(self, sid: str) -> None:
        """Handle WebSocket disconnection."""
        try:
            self.connected_sids.discard(sid)
            self.remove_all_subscriptions(sid)
            current_app.logger.info(f"WebSocket disconnected: {sid}")
        except Exception as e:
            current_app.logger.error(f"Error handling disconnect for {sid}: {str(e)}")
            
    def add_subscriber(self, broadcast_type: str, sid: str) -> None:
        """Add a subscriber to a specific broadcast type."""
        # ADDED: Diagnostic log for broadcast_type and self.admin_only_broadcasts
        current_app.logger.debug(f"[BROADCAST_VALIDATE] SID {sid}, broadcast_type: '{broadcast_type}', admin_only_broadcasts_set: {self.admin_only_broadcasts}")
        try:
            is_admin_broadcast = broadcast_type in self.admin_only_broadcasts
            admin_auth = None # Keep admin_auth defined in this scope
            is_validated_admin_for_channel = False

            if is_admin_broadcast:
                admin_auth = get_socket_auth_manager()
                validation_result = admin_auth.validate_socket(sid) # Store result
                # ADDED: Diagnostic log for socket validation result
                current_app.logger.debug(f"[BROADCAST_VALIDATE] For {broadcast_type} (admin_only), SID {sid}, admin_auth.validate_socket(sid) result: {validation_result}")
                if validation_result:
                    is_validated_admin_for_channel = True
                else:
                    current_app.logger.warning(f"[BROADCAST] Unauthorized admin subscription attempt: SID {sid} to {broadcast_type} (validate_socket returned False)")
                    return

            # Ensure subscriber set exists and add subscriber
            if broadcast_type not in self.subscribers:
                self.subscribers[broadcast_type] = set()
            self.subscribers[broadcast_type].add(sid)

            # If it's an admin channel and user is a validated admin,
            # always clear their initialized status before checking if they need initial state.
            # This ensures that a re-subscription by an admin to an admin-only channel
            # will always be treated as needing an initial state pulse from generic_broadcaster.
            if is_validated_admin_for_channel:
                current_app.logger.info(f"[BROADCAST] Admin SID {sid} (re)subscribing to admin_only_broadcast {broadcast_type}. Clearing init flag to ensure fresh pulse.")
                self.initialized_subscribers[broadcast_type].discard(sid)
            
            # Now, check if this SID needs initial state and signal the generic_broadcaster if so.
            # For admins on admin-only channels, the discard above should make the following condition true.
            if sid not in self.initialized_subscribers[broadcast_type]:
                current_app.logger.debug(f"[BROADCAST] Subscriber {sid} needs initial state for {broadcast_type} (is_admin_broadcast: {is_admin_broadcast}, is_validated_admin: {is_validated_admin_for_channel}), signaling event.")
                if broadcast_type in self.events: # Check if broadcaster is registered for this event type
                    self.signal_event(broadcast_type) # Trigger generic_broadcaster
                else:
                    current_app.logger.warning(f"[BROADCAST] No event registered for {broadcast_type}, cannot signal for SID {sid}")
            else:
                # This case should ideally not be hit for an admin re-subscribing to an admin_only_broadcast
                # if the logic above correctly discards them from initialized_subscribers.
                # It might be hit if this is a regular user, or an admin for a non-admin-only channel who was already initialized.
                current_app.logger.debug(f"[BROADCAST] Subscriber {sid} already initialized for {broadcast_type} (admin: {is_validated_admin_for_channel}), no signal by add_subscriber this time.")

            current_app.logger.debug(f"[BROADCAST] Processed subscription for SID {sid} to {broadcast_type}. Total subscribers for type: {len(self.subscribers.get(broadcast_type, set()))}")
        except Exception as e:
            current_app.logger.error(f"[BROADCAST] Error adding subscriber {sid} to {broadcast_type}: {str(e)}")
            self.handle_error(sid, e)
            
    def remove_subscriber(self, broadcast_type: str, sid: str) -> None:
        """Remove a subscriber from a specific broadcast type."""
        try:
            # ADDED LOGGING
            current_app.logger.debug(f"[DEBUG_SUB_BACKEND] BroadcastManager.remove_subscriber ENTRY: sid='{sid}', broadcast_type='{broadcast_type}'")
            # current_app.logger.debug(f"[DEBUG_SUB_BACKEND] BroadcastManager.remove_subscriber: '{broadcast_type}' subscribers BEFORE discard: {self.subscribers.get(broadcast_type, set())}")
            
            self.subscribers[broadcast_type].discard(sid)
            
            # ADDED LOGGING
            # current_app.logger.debug(f"[DEBUG_SUB_BACKEND] BroadcastManager.remove_subscriber: '{broadcast_type}' subscribers AFTER discard: {self.subscribers.get(broadcast_type, set())}")
            
            self.initialized_subscribers[broadcast_type].discard(sid) # Ensure they are marked as uninitialized
            current_app.logger.info(f"[BROADCAST] Removed subscriber {sid} from {broadcast_type}. Subscribers left: {len(self.subscribers.get(broadcast_type, set()))}")
        except Exception as e:
            current_app.logger.error(f"[BROADCAST] Error removing subscriber {sid} from {broadcast_type}: {str(e)}")
            
    def remove_all_subscriptions(self, sid: str) -> None:
        """Remove a subscriber from all broadcast types."""
        try:
            for broadcast_type in list(self.subscribers.keys()): # Iterate over a copy of keys
                self.subscribers[broadcast_type].discard(sid)
                self.initialized_subscribers[broadcast_type].discard(sid)
            current_app.logger.info(f"[BROADCAST] Removed all subscriptions for {sid}")
        except Exception as e:
            current_app.logger.error(f"[BROADCAST] Error removing all subscriptions for {sid}: {str(e)}")
            
    def get_subscribers(self, broadcast_type: str) -> Set[str]:
        """Get all subscribers for a specific broadcast type."""
        return {sid for sid in self.subscribers[broadcast_type] if sid in self.connected_sids}
        
    def register_broadcaster(self, broadcast_type: str, broadcaster_func: Any, interval: int = 1, admin_only: bool = False) -> None:
        """Register a broadcaster function for a specific type."""
        try:
            self.broadcasters[broadcast_type] = broadcaster_func
            self.intervals[broadcast_type] = interval
            self.events[broadcast_type] = eventlet.Event()
            if admin_only:
                self.admin_only_broadcasts.add(broadcast_type)
            current_app.logger.info(f"Registered broadcaster for {broadcast_type} (admin_only: {admin_only})")
        except Exception as e:
            current_app.logger.error(f"Error registering broadcaster for {broadcast_type}: {str(e)}")
            
    def register_admin_fields(self, broadcast_type: str, admin_fields: Set[str]) -> None:
        """Register fields that should only be included for admin users."""
        try:
            self.broadcasts_with_admin_fields[broadcast_type] = admin_fields
            current_app.logger.info(f"Registered admin fields for {broadcast_type}: {admin_fields}")
        except Exception as e:
            current_app.logger.error(f"Error registering admin fields for {broadcast_type}: {str(e)}")
            
    def signal_event(self, broadcast_type: str) -> None:
        """Signal the event for a specific broadcast type."""
        try:
            if broadcast_type in self.events:
                if not self.events[broadcast_type].ready():
                    self.events[broadcast_type].send()
        except Exception as e:
            current_app.logger.error(f"Error signaling event for {broadcast_type}: {str(e)}")
            self.events[broadcast_type] = eventlet.Event()
            self.events[broadcast_type].send()
                
    def reset_event(self, broadcast_type: str) -> None:
        """Reset the event for a specific broadcast type."""
        try:
            if broadcast_type in self.events:
                self.events[broadcast_type].reset()
        except Exception as e:
            current_app.logger.error(f"Error resetting event for {broadcast_type}: {str(e)}")
            self.events[broadcast_type] = eventlet.Event()
            
    def handle_error(self, sid: str, error: Exception) -> None:
        """Handle WebSocket errors for a specific subscriber."""
        try:
            error_str = str(error)
            current_app.logger.error(f"WebSocket error for {sid}: {error_str}")
            
            # Don't remove subscriptions for auth-related errors
            if ("no attribute 'generate_challenge'" in error_str or 
                "no attribute 'record_connection'" in error_str or
                "admin auth" in error_str.lower() or
                "authentication" in error_str.lower()):
                current_app.logger.info(f"Authentication error for {sid}, preserving subscriptions")
            else:
                # Only clear subscriptions for non-auth related errors
                self.remove_all_subscriptions(sid)
                self.connected_sids.discard(sid)
            
            try:
                socketio.emit('error', {
                    'type': 'broadcast_error',
                    'message': error_str,
                    'timestamp': time.time()
                }, room=sid)
            except Exception:
                pass  # Client might be disconnected already
        except Exception as e:
            current_app.logger.error(f"Error in error handler for {sid}: {str(e)}")

    def should_broadcast(self, broadcast_type: str, data: Any, sid: str = None) -> bool:
        """Determine if data should be broadcast based on meaningful changes or initialization."""
        # ADDED: Log inputs to should_broadcast
        current_app.logger.debug(f"[BROADCAST_SHOULD] Checking for {broadcast_type}, SID: {sid}, Data type: {type(data)}, Data is None: {data is None}")
        if data is None:
            # ADDED: Log when data is None causes return False
            current_app.logger.warning(f"[BROADCAST_SHOULD] Data is None for {broadcast_type}, SID: {sid}. Returning False.")
            return False
            
        # If checking for specific subscriber
        if sid is not None:
            # Always broadcast if subscriber hasn't received initial state
            if sid not in self.initialized_subscribers[broadcast_type]:
                self.initialized_subscribers[broadcast_type].add(sid)
                return True
                
        # Always broadcast if we haven't sent anything yet for this type
        if broadcast_type not in self.last_broadcast_data:
            self.last_broadcast_data[broadcast_type] = data
            return True
            
        # Use comparison logic from comparisons.py
        if should_broadcast(self.last_broadcast_data[broadcast_type], data, broadcast_type):
            self.last_broadcast_data[broadcast_type] = data
            return True
            
        return False

    def is_subscribed(self, broadcast_type: str, sid: str) -> bool:
        """Check if a subscriber is already subscribed to a broadcast type."""
        try:
            return sid in self.subscribers[broadcast_type]
        except Exception as e:
            current_app.logger.error(f"Error checking subscription for {sid} to {broadcast_type}: {str(e)}")
            return False
            
    def filter_admin_data(self, broadcast_type: str, data: Dict[str, Any], sid: str) -> Dict[str, Any]:
        """Filter out admin-only fields if the subscriber is not an admin."""
        # If the broadcast type doesn't have admin fields, return the data as is
        if broadcast_type not in self.broadcasts_with_admin_fields:
            return data
            
        # Create a copy of the data to avoid modifying the original
        filtered_data = data.copy()
        
        # Get admin auth manager instance
        admin_auth = get_socket_auth_manager()
        # current_app.logger.debug(f"[{broadcast_type}] get_socket_auth_manager instance ID: {id(admin_auth)}")
        
        # Get admin sessions for debugging
        admin_sessions = getattr(admin_auth, 'admin_sessions', {})
        # current_app.logger.debug(f"[{broadcast_type}] Admin sessions: {list(admin_sessions.keys())}")
        # current_app.logger.debug(f"[{broadcast_type}] Checking admin status for SID: {sid}")
        
        # Get all connection timestamps for debugging
        connection_timestamps = getattr(admin_auth, 'connection_timestamps', {})
        # current_app.logger.debug(f"[{broadcast_type}] Connection timestamps: {list(connection_timestamps.keys())}")
        
        is_admin = admin_auth.validate_socket(sid)
        
        # Log admin status and fields
        admin_fields = self.broadcasts_with_admin_fields[broadcast_type]
        # current_app.logger.debug(f"[{broadcast_type}] Admin status for {sid}: {is_admin}, Admin fields: {admin_fields}")
        
        # If not an admin, remove admin-only fields
        if not is_admin:
            for field in admin_fields:
                if field in filtered_data:
                    del filtered_data[field]
                    # current_app.logger.debug(f"[{broadcast_type}] Removed admin field {field} for non-admin user {sid}")
            
            # Log the filtered data for non-admin users
            # current_app.logger.debug(f"[{broadcast_type}] Filtered data for {sid}: {filtered_data}")
        else:
            # Log which admin fields are present in the data
            present_fields = [field for field in admin_fields if field in filtered_data]
            missing_fields = [field for field in admin_fields if field not in filtered_data]
            # current_app.logger.debug(f"[{broadcast_type}] Admin fields present: {present_fields}, missing: {missing_fields}")
            
            # For debugging, log the entire data payload
            # current_app.logger.debug(f"[{broadcast_type}] Full data payload for admin: {filtered_data}")
        
        return filtered_data

def generic_broadcaster(broadcast_type, app):
    """Generic broadcaster function with proper app context."""
    def run_with_context():
        with app.app_context():
            current_app.logger.info(f"Starting {broadcast_type} broadcaster")
            while True:
                try:
                    subscribers = broadcast_manager.get_subscribers(broadcast_type)
                    if not subscribers:
                        current_app.logger.debug(f"[{broadcast_type}] No subscribers. Waiting...")
                        eventlet.sleep(1)
                        continue
                        
                    current_app.logger.debug(f"[{broadcast_type}] Broadcasting to {len(subscribers)} subscribers")
                    
                    try:
                        broadcaster_func = broadcast_manager.broadcasters[broadcast_type]
                        data = broadcaster_func()
                        
                        # ADDED: Log raw data from broadcaster_func
                        # current_app.logger.debug(f"[{broadcast_type}] Raw data from broadcaster_func: Type={type(data)}, Content='{str(data)[:500]}...'")
                        
                        # Log the original data at debug level instead of warning
                        # current_app.logger.debug(f"[{broadcast_type}] Original data: {data}")
                        
                        # Check each subscriber individually for initialization needs and admin status
                        for sid in list(subscribers):
                            try:
                                # For admin_only events, re-validate admin status before emitting
                                if broadcast_type in broadcast_manager.admin_only_broadcasts:
                                    admin_auth = get_socket_auth_manager()
                                    if not admin_auth.validate_socket(sid):
                                        current_app.logger.info(f"[{broadcast_type}] SID {sid} no longer admin, skipping emit for admin-only event.")
                                        continue

                                # Determine data to send: original for admin_only (if check above passed), potentially filtered for mixed events
                                data_to_send = data 
                                if broadcast_type in broadcast_manager.broadcasts_with_admin_fields:
                                    data_to_send = broadcast_manager.filter_admin_data(broadcast_type, data, sid)
                                
                                # General log for data being considered for this SID (after potential filtering)
                                # Consider making this log level DEBUG if it's too verbose for INFO/WARNING in production
                                current_app.logger.debug(f"[{broadcast_type}] Data being considered for SID {sid} (post-filter/admin-check): {str(data_to_send)[:300]}...")
                                
                                # Perform the SINGLE, definitive call to should_broadcast for this SID and data
                                actual_should_broadcast_decision = broadcast_manager.should_broadcast(broadcast_type, data_to_send, sid)

                                # Conditional detailed logging for specific broadcast types (e.g., admin_disk_info)
                                # This logging uses the 'actual_should_broadcast_decision' and does NOT re-call should_broadcast.
                                if broadcast_type == 'admin_disk_info': 
                                    current_app.logger.info(f"[BROADCAST] ADMIN_DISK_INFO PRE-EMIT CHECK for SID {sid}")
                                    current_app.logger.info(f"[BROADCAST] ADMIN_DISK_INFO Data to send: {str(data_to_send)[:200]}...")
                                    current_app.logger.info(f"[BROADCAST] ADMIN_DISK_INFO Result of should_broadcast for SID {sid}: {actual_should_broadcast_decision}")
                                # Add other 'elif broadcast_type == ...' blocks here if other types need similar specific logging.

                                # Main emission logic based on the single stored decision
                                if actual_should_broadcast_decision:
                                    if broadcast_type == 'admin_disk_info': 
                                        current_app.logger.info(f"[BROADCAST] ADMIN_DISK_INFO EMITTING to SID {sid} with data: {str(data_to_send)[:200]}...")
                                    # Add 'elif broadcast_type == ...' for specific EMIT logs for other types if needed.
                                    
                                    socketio.server.emit(broadcast_type, data_to_send, room=sid)
                                    # current_app.logger.debug(f"[BROADCAST] Emitted {broadcast_type} to {sid}")
                                else:
                                    # Conditional "no changes" logging
                                    if broadcast_type == 'admin_disk_info':
                                        current_app.logger.info(f"[BROADCAST] ADMIN_DISK_INFO No changes, not emitting to SID {sid}")
                                    # Add 'elif broadcast_type == ...' for specific "no changes" logs if needed.
                                    # Or a general debug log:
                                    # current_app.logger.debug(f"[{broadcast_type}] No significant changes or SID already initialized with this data, not emitting to SID {sid}")
                            except Exception as e:
                                current_app.logger.error(f"[{broadcast_type}] Error emitting to {sid}: {e}")
                                broadcast_manager.handle_error(sid, e)
                                    
                    except Exception as e:
                        current_app.logger.error(f"[{broadcast_type}] Error in broadcast: {e}")
                        
                    interval = broadcast_manager.intervals.get(broadcast_type, 1)
                    eventlet.sleep(interval)
                    
                except Exception as e:
                    current_app.logger.error(f"[{broadcast_type}] Outer loop error: {e}")
                    eventlet.sleep(5)
    
    run_with_context()

# Initialize broadcast manager
broadcast_manager = BroadcastManager()

# Start broadcaster threads
def init_broadcasters(app):
    """Initialize and start all broadcaster threads with app context."""
    with app.app_context():
        current_app.logger.info("Initializing broadcasters")
        
        # Register broadcasters within app context
        broadcast_manager.register_broadcaster(
            'system_stats', 
            SystemStatsMonitor().broadcast_stats, 
            interval=app.config['STATS_INTERVAL']
        )
        broadcast_manager.register_broadcaster(
            'services_status',
            ServicesMonitor().broadcast_status,
            interval=app.config['SERVICES_CHECK_INTERVAL']
        )
        broadcast_manager.register_broadcaster(
            'power_status',
            PowerMonitor().broadcast_power_data,
            interval=app.config['POWER_SAMPLE_INTERVAL'] / 1000  # Convert ms to seconds
        )
        broadcast_manager.register_broadcaster(
            'internet_status',
            InternetStatusMonitor().broadcast_status,
            interval=app.config['INTERNET_CHECK_INTERVAL']
        )
        broadcast_manager.register_broadcaster(
            'tailscale_status',
            TailscaleMonitor().broadcast_status,
            interval=app.config['TAILSCALE_CHECK_INTERVAL']
        )
        broadcast_manager.register_broadcaster(
            'vpn_status',
            VPNMonitor().broadcast_status,
            interval=app.config['VPN_CHECK_INTERVAL']
        )
        
        # Register hard drive test broadcaster
        broadcast_manager.register_broadcaster(
            'hard_drive_test_status',
            HardDriveTestMonitor().broadcast_status,
            interval=app.config.get('DRIVE_TEST_INTERVAL', 5)
        )
        
        # Register sync status broadcaster
        broadcast_manager.register_broadcaster(
            'sync_status',
            SyncMonitor().broadcast_status,
            interval=2
        )
        
        # Register admin-only broadcasters
        broadcast_manager.register_broadcaster(
            'admin_system',
            SystemStatsMonitor().broadcast_admin_stats,
            interval=app.config.get('ADMIN_STATS_INTERVAL', 2),
            admin_only=True
        )
        
        # Register our new admin-only disk monitor
        broadcast_manager.register_broadcaster(
            'admin_disk_info',
            DiskMonitor().broadcast_disk_info,
            interval=app.config.get('DISK_CHECK_INTERVAL', 30),
            admin_only=True
        )
        
        # Register admin-specific fields for regular broadcasts
        broadcast_manager.register_admin_fields('internet_status', {'publicIp', 'ipDetails', 'dnsServers'})
        broadcast_manager.register_admin_fields('vpn_status', {'connectionDetails', 'credentials'})
        broadcast_manager.register_admin_fields('system_stats', {'processes', 'users', 'networkConnections'})
        broadcast_manager.register_admin_fields('tailscale_status', {'ip', 'tailnet', 'isEnabled', 'loginUrl'})
        broadcast_manager.register_admin_fields('services_status', {'isEnabled'})

        # Start broadcaster threads
        for broadcast_type in broadcast_manager.broadcasters:
            eventlet.spawn(generic_broadcaster, broadcast_type, app) 