"""
Main application entry point.
"""
import os
import signal
import sys
import eventlet
eventlet.monkey_patch()

from backend import create_app, socketio
from config import config

# Get config based on environment
config_name = os.getenv('FLASK_ENV', 'default')
config_class = config[config_name]
app = create_app(config_class)

def signal_handler(signum, frame):
    """Handle shutdown signals by cleaning up WebSocket state."""
    print(f"Received signal {signum}, cleaning up WebSocket state...")
    from backend.sockets.events import cleanup_websocket_state
    cleanup_websocket_state()
    # Give a brief moment for cleanup to start
    eventlet.sleep(0)  # Yield to other greenlets
    sys.exit(0)

def worker_init():
    """Initialize worker state."""
    print("Initializing worker state...")
    from backend.sockets.events import cleanup_websocket_state
    cleanup_websocket_state()  # Clean any leftover state
    
    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

if __name__ == '__main__':
    worker_init()
    socketio.run(app)
