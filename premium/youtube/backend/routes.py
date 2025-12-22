"""
YouTube Premium Tab Flask Blueprint

This blueprint provides API endpoints for YouTube video downloading functionality.
Includes manual downloads, subscription management, and configuration.
"""

from flask import Blueprint, request, jsonify, current_app
from .youtube_manager import YoutubeManager
from .subscription_manager import SubscriptionManager

# Create blueprint
bp = Blueprint('youtube', __name__, url_prefix='/api/youtube')

# Initialize managers
youtube_manager = YoutubeManager()
subscription_manager = SubscriptionManager()


@bp.route('/download', methods=['POST'])
def download_video():
    """Download a video from YouTube URL."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        url = data.get('url')
        if not url:
            return jsonify({
                'success': False,
                'error': 'Missing required field: url'
            }), 400
        
        quality = data.get('quality', 'best')
        format_pref = data.get('format')
        audio_only = data.get('audio_only', False)
        
        # Get auto_hardlink setting
        settings = subscription_manager.get_settings()
        auto_hardlink = settings.get('auto_hardlink', False)
        
        result = youtube_manager.download_video(url, quality, format_pref, audio_only, auto_hardlink)
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'Download started successfully',
                'data': result
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Download failed')
            }), 500
            
    except Exception as e:
        current_app.logger.error(f"Error downloading video: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/download/info', methods=['POST'])
def get_video_info():
    """Get video information without downloading."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        url = data.get('url')
        if not url:
            return jsonify({
                'success': False,
                'error': 'Missing required field: url'
            }), 400
        
        result = youtube_manager.get_video_info(url)
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'data': result
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to get video info')
            }), 500
            
    except Exception as e:
        current_app.logger.error(f"Error getting video info: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/subscriptions', methods=['GET'])
def get_subscriptions():
    """Get all channel subscriptions."""
    try:
        subscriptions = subscription_manager.get_subscriptions()
        return jsonify({
            'success': True,
            'subscriptions': subscriptions
        })
    except Exception as e:
        current_app.logger.error(f"Error getting subscriptions: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/subscriptions', methods=['POST'])
def add_subscription():
    """Add a new channel subscription."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        url = data.get('url')
        if not url:
            return jsonify({
                'success': False,
                'error': 'Missing required field: url'
            }), 400
        
        name = data.get('name')
        audio_only = data.get('audio_only', False)
        
        subscription = subscription_manager.add_subscription(url, name, audio_only)
        
        return jsonify({
            'success': True,
            'message': 'Subscription added successfully',
            'subscription': subscription
        })
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        current_app.logger.error(f"Error adding subscription: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/subscriptions/<channel_id>', methods=['DELETE'])
def remove_subscription(channel_id):
    """Remove a channel subscription."""
    try:
        success = subscription_manager.remove_subscription(channel_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Subscription removed successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Subscription not found'
            }), 404
    except Exception as e:
        current_app.logger.error(f"Error removing subscription: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/subscriptions/<channel_id>/fetch', methods=['POST'])
def fetch_subscription(channel_id):
    """Fetch/download videos for a specific subscription."""
    try:
        # Get the subscription to find its URL and settings
        subscriptions = subscription_manager.get_subscriptions()
        subscription = None
        
        for sub in subscriptions:
            if sub.get('id') == channel_id:
                subscription = sub
                break
        
        if not subscription:
            return jsonify({
                'success': False,
                'error': 'Subscription not found'
            }), 404
        
        # Get subscription URL and audio_only setting
        channel_url = subscription.get('url')
        audio_only = subscription.get('audio_only', False)
        
        # Get global settings for quality/format and auto_hardlink
        settings = subscription_manager.get_settings()
        quality = settings.get('quality', 'best')
        format_pref = settings.get('format')
        auto_hardlink = settings.get('auto_hardlink', False)
        
        # Download videos for this channel
        result = youtube_manager.download_channel_videos(
            channel_url,
            quality,
            format_pref,
            audio_only,
            auto_hardlink
        )
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': f"Download started for {subscription.get('name', 'channel')}",
                'data': result
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Download failed')
            }), 500
            
    except Exception as e:
        current_app.logger.error(f"Error fetching subscription: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/settings', methods=['GET'])
def get_settings():
    """Get download settings."""
    try:
        settings = subscription_manager.get_settings()
        return jsonify({
            'success': True,
            'settings': settings
        })
    except Exception as e:
        current_app.logger.error(f"Error getting settings: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/settings', methods=['POST'])
def update_settings():
    """Update download settings."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        settings = subscription_manager.update_settings(data)
        
        return jsonify({
            'success': True,
            'message': 'Settings updated successfully',
            'settings': settings
        })
    except Exception as e:
        current_app.logger.error(f"Error updating settings: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/schedule', methods=['GET'])
def get_schedule():
    """Get subscription check schedule."""
    try:
        schedule = subscription_manager.get_schedule()
        return jsonify({
            'success': True,
            'schedule': schedule
        })
    except Exception as e:
        current_app.logger.error(f"Error getting schedule: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/schedule', methods=['POST'])
def update_schedule():
    """Update subscription check schedule."""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        enabled = data.get('enabled', False)
        hour = data.get('hour', 2)
        minute = data.get('minute', 0)
        
        schedule = subscription_manager.update_schedule(enabled, hour, minute)
        
        return jsonify({
            'success': True,
            'message': 'Schedule updated successfully',
            'schedule': schedule
        })
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        current_app.logger.error(f"Error updating schedule: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/logs', methods=['GET'])
def get_logs():
    """Get download logs."""
    try:
        logs = youtube_manager.get_logs()
        return jsonify({
            'success': True,
            'logs': logs
        })
    except Exception as e:
        current_app.logger.error(f"Error getting logs: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
