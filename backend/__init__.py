"""
Flask application factory and extension initialization.
"""
import eventlet
import os
import json
import subprocess
eventlet.monkey_patch()

from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO
from flask_cors import CORS

# Initialize extensions
socketio = SocketIO(
    cors_allowed_origins="*",  # Will be updated in create_app
    async_mode='eventlet',
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1e8,
    allow_upgrades=True,
    http_compression=True,
    websocket_compression=True,
    transports=['websocket', 'polling'],
    always_connect=True,
    handle_missing_origin=True,
    cors_credentials=True
)

def create_app(config_object=None):
    """Create and configure the Flask application."""
    app = Flask(__name__, static_folder='/var/www/homeserver/build', static_url_path='')
    
    # Configure app
    if config_object:
        # Load base configuration from object
        app.config.from_object(config_object)
        
        # Configure logging first
        app.logger.setLevel('INFO')
        
        with app.app_context():
            # Load dynamic configuration from config file
            app.logger.info("Loading dynamic configuration")
            try:
                if os.path.exists(app.config['HOMESERVER_CONFIG']):
                    app.logger.info(f"Found config at {app.config['HOMESERVER_CONFIG']}, loading configuration...")
                    with open(app.config['HOMESERVER_CONFIG'], 'r') as f:
                        config_data = json.load(f)
                    
                    # Load admin PIN from config
                    if 'global' in config_data and 'admin' in config_data['global'] and 'pin' in config_data['global']['admin']:
                        app.config['ADMIN_PIN'] = config_data['global']['admin']['pin']
                        app.logger.info("Loaded admin PIN from configuration")
                    else:
                        app.logger.warning("Admin PIN not found in configuration, using default")
                    
                    # Load CORS origins if available
                    if 'global' in config_data and 'cors' in config_data['global'] and 'allowed_origins' in config_data['global']['cors']:
                        app.config['CORS_ORIGINS'] = config_data['global']['cors']['allowed_origins']
                        app.logger.info(f"Loaded CORS origins: {app.config['CORS_ORIGINS']}")
                    else:
                        app.logger.warning("No CORS origins found in configuration, using defaults")
                else:
                    app.logger.warning(f"Configuration file not found at {app.config['HOMESERVER_CONFIG']}")
            except Exception as e:
                app.logger.error(f"Error loading configuration: {str(e)}")
                app.logger.exception("Full traceback:")

    # Initialize CORS with dynamic origins
    CORS(app, resources={
        r"/*": {
            "origins": app.config.get('CORS_ORIGINS', ["https://home.arpa"]),
            "supports_credentials": True,
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Origin"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "expose_headers": ["Content-Length", "Content-Type"],
            "allow_origin": app.config.get('CORS_ORIGINS', ["https://home.arpa"])
        }
    })
    
    # Initialize SocketIO with app
    socketio.init_app(app)
    
    # Get app reference for background tasks
    app_ref = app
    
    # Initialize broadcasters with app reference
    from .broadcasts.events import init_broadcasters
    init_broadcasters(app_ref)
    
    # Start connection logger
    from .sockets.events import log_connection_status
    eventlet.spawn(log_connection_status, app_ref)
    
    # Register blueprints
    from .broadcasts import bp as broadcasts_bp
    from .tabman import bp as tabman_bp
    from .stats import bp as stats_bp
    from .portals import bp as portals_bp
    from .upload import bp as upload_bp
    from .admin import bp as admin_bp
    from .indicators import bp as indicators_bp
    from .sockets import bp as sockets_bp
    from .monitors import bp as monitors_bp
    from .utils import bp as utils_bp
    from .dev import bp as dev_bp
    app.register_blueprint(dev_bp)
    app.register_blueprint(broadcasts_bp)
    app.register_blueprint(tabman_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(portals_bp)
    app.register_blueprint(upload_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(indicators_bp)
    app.register_blueprint(sockets_bp)
    app.register_blueprint(monitors_bp)
    app.register_blueprint(utils_bp)

    # === PREMIUM TAB BLUEPRINTS START ===
    # Premium tab blueprints are dynamically injected here during installation
    # Do not manually edit this section - it is managed by the premium installer
    # === PREMIUM TAB BLUEPRINTS END ===

    # Register error handlers
    @app.errorhandler(404)
    def not_found_error(error):
        # If requesting a static file that doesn't exist, return 404
        if request.path.startswith('/static/'):
            return {'error': 'Not found'}, 404
        # Otherwise serve index.html for client-side routing
        return send_from_directory(app.static_folder, 'index.html')
        
    @app.errorhandler(500)
    def internal_error(error):
        return {'error': 'Internal server error'}, 500

    # Serve React App
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_react_app(path):
        if path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, 'index.html')
    
    return app
