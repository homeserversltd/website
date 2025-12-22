"""
Subscription Manager Utilities

Handles YouTube channel subscription storage and cron job management
for automated nightly video downloads.
"""

import os
import json
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Any


class SubscriptionManager:
    """Manages YouTube channel subscriptions and cron scheduling."""
    
    SUBSCRIPTIONS_FILE = Path("/var/www/homeserver/data/youtube/subscriptions.json")
    SETTINGS_FILE = Path("/var/www/homeserver/data/youtube/settings.json")
    CRON_SCRIPT_PATH = Path("/usr/local/bin/youtube-subscription-check.sh")
    CRON_IDENTIFIER = "homeserver-youtube-subscriptions"
    
    def __init__(self):
        """Initialize subscription manager."""
        self.subscriptions_file = self.SUBSCRIPTIONS_FILE
        self.settings_file = self.SETTINGS_FILE
        self.cron_script_path = self.CRON_SCRIPT_PATH
        
        # Ensure data directory exists
        self.subscriptions_file.parent.mkdir(parents=True, exist_ok=True)
        self.settings_file.parent.mkdir(parents=True, exist_ok=True)
    
    def _run_sudo_command(self, command: List[str]) -> tuple[bool, str]:
        """Execute a sudo command and return success status and output."""
        try:
            result = subprocess.run(
                ['/usr/bin/sudo'] + command,
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            return False, "Command timed out"
        except Exception as e:
            return False, str(e)
    
    def get_subscriptions(self) -> List[Dict[str, Any]]:
        """Get all channel subscriptions."""
        try:
            if not self.subscriptions_file.exists():
                return []
            
            with open(self.subscriptions_file, 'r') as f:
                data = json.load(f)
                return data.get('subscriptions', [])
        except Exception:
            return []
    
    def add_subscription(self, url: str, name: Optional[str] = None, audio_only: bool = False) -> Dict[str, Any]:
        """
        Add a new channel subscription.
        
        Args:
            url: YouTube channel URL
            name: Optional channel name (will be extracted if not provided)
            audio_only: Whether to download audio only for this subscription
            
        Returns:
            Dictionary with subscription info
        """
        subscriptions = self.get_subscriptions()
        
        # Check if already subscribed
        for sub in subscriptions:
            if sub.get('url') == url:
                raise ValueError("Channel already subscribed")
        
        # Extract channel ID or name from URL
        channel_id = self._extract_channel_id(url)
        
        subscription = {
            'id': channel_id,
            'url': url,
            'name': name or channel_id,
            'audio_only': audio_only,
            'added_at': self._get_timestamp()
        }
        
        subscriptions.append(subscription)
        
        # Save subscriptions
        self._save_subscriptions(subscriptions)
        
        return subscription
    
    def remove_subscription(self, channel_id: str) -> bool:
        """
        Remove a channel subscription.
        
        Args:
            channel_id: Channel ID to remove
            
        Returns:
            True if removed, False if not found
        """
        subscriptions = self.get_subscriptions()
        
        original_count = len(subscriptions)
        subscriptions = [s for s in subscriptions if s.get('id') != channel_id]
        
        if len(subscriptions) < original_count:
            self._save_subscriptions(subscriptions)
            return True
        
        return False
    
    def _extract_channel_id(self, url: str) -> str:
        """Extract channel ID from YouTube URL."""
        if '/channel/' in url:
            return url.split('/channel/')[-1].split('/')[0].split('?')[0]
        elif '/c/' in url:
            return url.split('/c/')[-1].split('/')[0].split('?')[0]
        elif '/user/' in url:
            return url.split('/user/')[-1].split('/')[0].split('?')[0]
        elif 'channel_id=' in url:
            from urllib.parse import parse_qs, urlparse
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            return params.get('channel_id', ['unknown'])[0]
        else:
            # Fallback: use URL as ID
            return url.replace('https://', '').replace('http://', '').replace('/', '_')
    
    def _save_subscriptions(self, subscriptions: List[Dict[str, Any]]) -> None:
        """Save subscriptions to file."""
        data = {
            'subscriptions': subscriptions,
            'updated_at': self._get_timestamp()
        }
        
        with open(self.subscriptions_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def get_settings(self) -> Dict[str, Any]:
        """Get download settings."""
        try:
            if not self.settings_file.exists():
                return self._get_default_settings()
            
            with open(self.settings_file, 'r') as f:
                return json.load(f)
        except Exception:
            return self._get_default_settings()
    
    def update_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Update download settings."""
        current_settings = self.get_settings()
        current_settings.update(settings)
        current_settings['updated_at'] = self._get_timestamp()
        
        with open(self.settings_file, 'w') as f:
            json.dump(current_settings, f, indent=2)
        
        return current_settings
    
    def _get_default_settings(self) -> Dict[str, Any]:
        """Get default download settings."""
        return {
            'quality': 'best',
            'format': 'bestvideo+bestaudio',
            'auto_hardlink': False,
            'updated_at': self._get_timestamp()
        }
    
    def get_schedule(self) -> Dict[str, Any]:
        """Get subscription check schedule."""
        try:
            # Read current crontab
            success, output = self._run_sudo_command(['crontab', '-l'])
            
            if not success:
                # No crontab exists
                return {
                    'enabled': False,
                    'hour': 2,
                    'minute': 0
                }
            
            # Find our cron job
            for line in output.split('\n'):
                if self.CRON_IDENTIFIER in line:
                    # Parse cron line: minute hour * * * command
                    parts = line.strip().split()
                    if len(parts) >= 2:
                        minute = int(parts[0])
                        hour = int(parts[1])
                        return {
                            'enabled': True,
                            'hour': hour,
                            'minute': minute
                        }
            
            return {
                'enabled': False,
                'hour': 2,
                'minute': 0
            }
        except Exception:
            return {
                'enabled': False,
                'hour': 2,
                'minute': 0
            }
    
    def update_schedule(self, enabled: bool, hour: int = 2, minute: int = 0) -> Dict[str, Any]:
        """
        Update subscription check schedule.
        
        Args:
            enabled: Whether to enable the schedule
            hour: Hour of day (0-23)
            minute: Minute of hour (0-59)
            
        Returns:
            Dictionary with schedule info
        """
        # Validate time
        if not (0 <= hour <= 23):
            raise ValueError("Hour must be between 0 and 23")
        if not (0 <= minute <= 59):
            raise ValueError("Minute must be between 0 and 59")
        
        # Create/update cron script
        self._create_cron_script()
        
        # Read current crontab
        success, output = self._run_sudo_command(['crontab', '-l'])
        current_lines = []
        
        if success:
            current_lines = [line for line in output.split('\n') 
                           if line.strip() and not line.strip().startswith('#')]
        
        # Remove existing youtube subscription cron jobs
        filtered_lines = [line for line in current_lines 
                         if self.CRON_IDENTIFIER not in line]
        
        # Add new cron job if enabled
        if enabled:
            cron_line = f"{minute} {hour} * * * {self.cron_script_path} # {self.CRON_IDENTIFIER}"
            filtered_lines.append(cron_line)
        
        # Write new crontab
        if filtered_lines:
            new_crontab = '\n'.join(filtered_lines) + '\n'
            
            # Write to temporary file
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.cron') as temp_file:
                temp_file.write(new_crontab)
                temp_file_path = temp_file.name
            
            try:
                success, output = self._run_sudo_command(['crontab', temp_file_path])
                if not success:
                    raise Exception(f"Failed to update crontab: {output}")
            finally:
                try:
                    os.unlink(temp_file_path)
                except Exception:
                    pass
        else:
            # Remove all cron jobs (empty crontab)
            self._run_sudo_command(['crontab', '-r'])
        
        return {
            'enabled': enabled,
            'hour': hour,
            'minute': minute
        }
    
    def _create_cron_script(self) -> None:
        """Create the cron script for subscription checks."""
        script_content = f"""#!/bin/bash
# HOMESERVER YouTube Subscription Check
# This script is automatically generated and managed by the YouTube premium tab

SUBSCRIPTIONS_FILE="{self.subscriptions_file}"
SETTINGS_FILE="{self.settings_file}"
DOWNLOAD_DIR="/mnt/nas/youtube"

# Ensure download directory exists
mkdir -p "$DOWNLOAD_DIR"

# Source settings
if [ -f "$SETTINGS_FILE" ]; then
    QUALITY=$(jq -r '.quality // "best"' "$SETTINGS_FILE")
    FORMAT=$(jq -r '.format // "bestvideo+bestaudio"' "$SETTINGS_FILE")
else
    QUALITY="best"
    FORMAT="bestvideo+bestaudio"
fi

# Check subscriptions and download new videos
if [ -f "$SUBSCRIPTIONS_FILE" ]; then
    # Process each subscription with its individual settings
    jq -c '.subscriptions[]?' "$SUBSCRIPTIONS_FILE" | while read -r subscription; do
        channel_url=$(echo "$subscription" | jq -r '.url // empty')
        audio_only=$(echo "$subscription" | jq -r '.audio_only // false')
        
        if [ -n "$channel_url" ]; then
            # Determine format based on audio_only flag
            if [ "$audio_only" = "true" ]; then
                /usr/local/bin/yt-dlp \\
                    --extract-audio \\
                    --audio-format mp3 \\
                    --audio-quality 0 \\
                    --download-archive "$DOWNLOAD_DIR/downloaded.txt" \\
                    --output "$DOWNLOAD_DIR/%(uploader)s/%(title)s.%(ext)s" \\
                    --quiet \\
                    --no-warnings \\
                    "$channel_url" || true
            else
                /usr/local/bin/yt-dlp \\
                    --format "$FORMAT" \\
                    --download-archive "$DOWNLOAD_DIR/downloaded.txt" \\
                    --output "$DOWNLOAD_DIR/%(uploader)s/%(title)s.%(ext)s" \\
                    --quiet \\
                    --no-warnings \\
                    "$channel_url" || true
            fi
        fi
    done
fi
"""
        
        # Write script to temporary file first
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.sh') as temp_file:
            temp_file.write(script_content)
            temp_file_path = temp_file.name
        
        try:
            # Copy to destination using sudo
            success, output = self._run_sudo_command([
                'cp', temp_file_path, str(self.cron_script_path)
            ])
            
            if success:
                # Make executable
                self._run_sudo_command(['chmod', '+x', str(self.cron_script_path)])
            else:
                raise Exception(f"Failed to create cron script: {output}")
        finally:
            try:
                os.unlink(temp_file_path)
            except Exception:
                pass
    
    def _get_timestamp(self) -> str:
        """Get current timestamp as ISO string."""
        from datetime import datetime
        return datetime.now().isoformat()
