"""
Application configuration settings.
"""
import os
import json
import logging
import subprocess

def get_config_path() -> str:
    """Get the validated config path from factoryFallback.sh."""
    try:
        result = subprocess.run(['/usr/local/sbin/factoryFallback.sh'], 
                              capture_output=True, 
                              text=True, 
                              check=True)
        return result.stdout.strip()
    except Exception as e:
        logging.error(f"Error getting config path: {str(e)}")
        return '/var/www/homeserver/src/config/homeserver.json'

def get_secret_key() -> str:
    """
    Generate a new secret key using the siteSecretKey.sh script every time the application starts.
    This ensures the encryption key is regularly refreshed for better security.
    """
    key_file = '/var/www/homeserver/src/config/secret.key'
    
    logging.info("[PIN] Starting secret key generation process")
    try:
        # Always generate a new key on app startup
        logging.info("[PIN] Attempting to generate new secret key on application startup...")
        logging.info("[PIN] Executing: sudo /usr/local/sbin/siteSecretKey.sh generate")
        
        result = subprocess.run(['/usr/bin/sudo', '/usr/local/sbin/siteSecretKey.sh', 'generate'], 
                              capture_output=True, 
                              text=True)
        
        logging.info(f"[PIN] Script return code: {result.returncode}")
        logging.info(f"[PIN] Script stdout: {result.stdout}")
        
        if result.returncode != 0:
            logging.error(f"[PIN] Failed to generate secret key. Return code: {result.returncode}")
            logging.error(f"[PIN] Error output: {result.stderr}")
            
            # If we can't generate a new key but the file exists, try to use it
            if os.path.exists(key_file):
                logging.info(f"[PIN] Attempting to use existing key file: {key_file}")
                with open(key_file, 'r') as f:
                    key = f.read().strip()
                    if key:
                        logging.info("[PIN] Using existing secret key from file after failed regeneration")
                        return key
            logging.warning("[PIN] Falling back to environment variable or default key")
            return os.environ.get('SECRET_KEY', 'dev')
                
        # Read the newly generated key
        logging.info(f"[PIN] Script executed successfully, checking for key file: {key_file}")
        if os.path.exists(key_file):
            logging.info(f"[PIN] Key file exists, reading content")
            with open(key_file, 'r') as f:
                key = f.read().strip()
                if key:
                    logging.info(f"[PIN] Key successfully read, length: {len(key)} characters")
                    return key
                else:
                    logging.error("[PIN] Key file exists but is empty")
        else:
            logging.error(f"[PIN] Key file does not exist after script execution: {key_file}")
                
    except Exception as e:
        logging.error(f"[PIN] Exception in get_secret_key: {str(e)}")
        logging.exception("[PIN] Full exception details:")
        
    # Fallback to environment variable or default
    logging.warning("[PIN] All attempts failed, using fallback key")
    return os.environ.get('SECRET_KEY', 'dev')

class Config:
    """Base configuration."""
    # Flask settings
    SECRET_KEY = get_secret_key()
    
    # Client-side debug mode - controls console.log statements in frontend
    CLIENT_DEBUG_MODE = 'true'
    
    # CORS settings - default, will be overridden by homeserver.json if available
    CORS_ORIGINS = []
    
    # File paths
    HOMESERVER_CONFIG = get_config_path()
    HOMESERVER_LOG_DIR = '/var/log/homeserver'
    UPLOAD_LOG_PATH = os.path.join(HOMESERVER_LOG_DIR, 'upload.log')
    SCRIPT_DIR = '/var/www/homeserver/scripts'
    
    # Admin settings - default, will be overridden by homeserver.json
    ADMIN_PIN = '1'
    
    # Upload settings
    UPLOAD_FOLDER = '/mnt/nas'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024 * 1024  # 16GB
    
    # Monitoring settings
    STATS_INTERVAL = 1  # Seconds between updates
    HEARTBEAT_TIMEOUT = 60  # Seconds before considering a client stale
    PROCESS_SAMPLE_THRESHOLD = 3  # Minimum samples before showing process
    POWER_HISTORY_LENGTH = 60  # Keep 1 minute of history
    POWER_SAMPLE_INTERVAL = 1000  # 1 second in milliseconds
    
    # NAS monitoring settings
    NAS_MOUNT_POINTS = ['/mnt/nas', '/mnt/nas_backup']  # Mount points to monitor for NAS I/O
    
    # Broadcast intervals
    INTERNET_CHECK_INTERVAL = 7  # Seconds
    SERVICES_CHECK_INTERVAL = 4  # Seconds
    TAILSCALE_CHECK_INTERVAL = 7  # Seconds
    VPN_CHECK_INTERVAL = 5  # Seconds
    DISK_CHECK_INTERVAL = 10  # Seconds
    
    # RAPL paths for power monitoring
    RAPL_PATHS = {
        'core': '/sys/class/powercap/intel-rapl:0:0/energy_uj',
        'uncore': '/sys/class/powercap/intel-rapl:0:1/energy_uj'
    }
    
    # Connection limits
    MAX_CONNECTIONS_PER_IP = 5
    RATE_LIMIT_WINDOW = 60  # seconds
    MAX_CONNECTIONS_PER_WINDOW = 30
    ZOMBIE_TIMEOUT = 10  # seconds without heartbeat = zombie

    # Caching settings
    CONFIG_CACHE = {}  # Initialize the cache
    CONFIG_CACHE_TIME = 0.0
    CACHE_TTL = 60
    # Default theme configuration used as baseline for valid themes
    DEFAULT_THEME = {
        'background': '#F7F7F7',
        'text': '#1A1A1A',
        'primary': '#A0AEC0',
        'primaryHover': '#BCCCDC',
        'secondary': '#4A5568',
        'accent': '#90cff3',
        'error': '#df0a3f',
        'success': '#059669',
        'warning': '#F59E0B',
        'border': '#E5E7EB',
        'statusUp': '#059669',
        'statusDown': '#EF4444',
        'statusPartial': '#F59E0B',
        'statusUnknown': '#6B7280',
        'hiddenTabBackground': '#E2E8F0',
        'hiddenTabText': '#A0AEC0'
    }
    # Samba admin user for password sync
    SAMBA_ADMIN_USER = 'owner'

class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    TESTING = False

class TestingConfig(Config):
    """Testing configuration."""
    DEBUG = True
    TESTING = True
    # Use temporary directories for testing
    UPLOAD_FOLDER = '/tmp/test_uploads'
    HOMESERVER_LOG_DIR = '/tmp/test_logs'
    HOMESERVER_CONFIG = '/tmp/test_config.json'

class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    TESTING = False
    # Production-specific settings can be added here

# Map environment names to config classes
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}