"""
YouTube Manager Utilities

Handles YouTube video downloading using yt-dlp, including manual downloads
and subscription-based automatic downloads.
"""

import os
import json
import subprocess
import re
import sys
import importlib.util
from pathlib import Path
from typing import Dict, List, Optional, Any
from urllib.parse import urlparse, parse_qs
from datetime import datetime

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

# Import linker core for hardlink functionality
LINKER_BASE = Path('/usr/local/lib/linker')
CORE_PATH = LINKER_BASE / 'core.py'
LOGGER_UTILS_PATH = LINKER_BASE / 'logger_utils.py'
PERMISSIONS_HELPER_PATH = LINKER_BASE / 'permissions_helper.py'
CONFIG_PATH = LINKER_BASE / 'config.py'

def load_module_from_path(module_name: str, file_path: Path):
    """Load a module directly from a file path."""
    if not file_path.exists():
        raise ImportError(f"Module file not found: {file_path}")
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Failed to create spec for {file_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

# Load linker modules
try:
    linker_path = str(LINKER_BASE)
    if linker_path not in sys.path:
        sys.path.insert(0, linker_path)
    
    config_module = load_module_from_path('config', CONFIG_PATH)
    logger_utils_module = load_module_from_path('logger_utils', LOGGER_UTILS_PATH)
    permissions_helper_module = load_module_from_path('permissions_helper', PERMISSIONS_HELPER_PATH)
    core_module = load_module_from_path('core', CORE_PATH)
    create_hardlink = core_module.create_hardlink
    
    if linker_path in sys.path:
        sys.path.remove(linker_path)
except Exception as e:
    # If linker is not available, hardlinking will be disabled
    create_hardlink = None
    linker_error = str(e)


class YoutubeManager:
    """Manages YouTube video downloading operations."""
    
    DOWNLOAD_DIR = Path("/mnt/nas/youtube")
    DATA_DIR = Path("/var/www/homeserver/data/youtube")
    ARCHIVE_FILE = DOWNLOAD_DIR / "downloaded.txt"
    LOG_FILE = Path("/var/www/homeserver/premium/youtube_logs.txt")
    MEDIA_DIR = Path("/mnt/nas/media/YouTube")
    
    def __init__(self):
        """Initialize YouTube manager."""
        self.download_dir = self.DOWNLOAD_DIR
        self.data_dir = self.DATA_DIR
        self.archive_file = self.ARCHIVE_FILE
        self.log_file = self.LOG_FILE
        self.media_dir = self.MEDIA_DIR
        
        # Ensure directories exist
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        # Media directory will be created when needed
    
    def _ensure_download_dir(self) -> None:
        """Ensure the download directory exists using mkdir -p command."""
        try:
            subprocess.run(
                ['mkdir', '-p', str(self.DOWNLOAD_DIR)],
                check=True,
                timeout=10
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            # Log error but don't fail - Path.mkdir will handle it if needed
            pass
    
    def _validate_url(self, url: str) -> bool:
        """Validate that URL is a valid YouTube URL."""
        if not url:
            return False
        
        youtube_patterns = [
            r'(?:https?://)?(?:www\.)?(?:youtube\.com|youtu\.be)',
            r'youtube\.com/watch',
            r'youtube\.com/channel',
            r'youtube\.com/c/',
            r'youtube\.com/user/',
            r'youtu\.be/'
        ]
        
        return any(re.search(pattern, url, re.IGNORECASE) for pattern in youtube_patterns)
    
    def _get_channel_name_from_url(self, url: str) -> Optional[str]:
        """Extract channel name or ID from YouTube URL."""
        try:
            # Try to get channel info using yt-dlp
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if info:
                    uploader = info.get('uploader') or info.get('channel')
                    if uploader:
                        # Sanitize channel name for filesystem
                        return re.sub(r'[^\w\s-]', '', uploader).strip().replace(' ', '_')
        except Exception:
            pass
        
        # Fallback: try to extract from URL
        if '/channel/' in url:
            channel_id = url.split('/channel/')[-1].split('/')[0].split('?')[0]
            return f"channel_{channel_id}"
        elif '/c/' in url:
            channel_name = url.split('/c/')[-1].split('/')[0].split('?')[0]
            return channel_name
        elif '/user/' in url:
            channel_name = url.split('/user/')[-1].split('/')[0].split('?')[0]
            return channel_name
        
        return "unknown_channel"
    
    def _create_hardlink_to_media(self, source_file: Path) -> bool:
        """
        Create a hardlink from downloaded file to /mnt/nas/media/YouTube.
        
        Args:
            source_file: Path to the downloaded video file
            
        Returns:
            True if successful, False otherwise
        """
        if create_hardlink is None:
            return False
        
        try:
            # Ensure media directory exists
            self.media_dir.mkdir(parents=True, exist_ok=True)
            
            # Create hardlink
            success = create_hardlink(
                source=source_file,
                destination_dir=self.media_dir,
                name=None,  # Use same filename
                conflict_strategy='skip'  # Skip if already exists
            )
            return success
        except Exception as e:
            # Log error but don't fail the download
            try:
                with open(self.log_file, 'a', encoding='utf-8') as f:
                    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    f.write(f"[{timestamp}] Hardlink error: {str(e)}\n")
            except Exception:
                pass
            return False
    
    def _find_downloaded_file(self, channel_dir: Path, video_title: str) -> Optional[Path]:
        """
        Find the actual downloaded file in the channel directory.
        
        Args:
            channel_dir: Directory where video was downloaded
            video_title: Title of the video (may be sanitized)
            
        Returns:
            Path to the downloaded file, or None if not found
        """
        if not channel_dir.exists():
            return None
        
        # Get most recently modified file in the directory
        files = [f for f in channel_dir.iterdir() if f.is_file()]
        if not files:
            return None
        
        # Return the most recently modified file (should be the one just downloaded)
        return max(files, key=lambda f: f.stat().st_mtime)
    
    def download_video(self, url: str, quality: str = "best", format_pref: Optional[str] = None, audio_only: bool = False, auto_hardlink: bool = False) -> Dict[str, Any]:
        """
        Download a video from YouTube URL.
        
        Args:
            url: YouTube video or channel URL
            quality: Quality preference (best, bestvideo+bestaudio, etc.)
            format_pref: Format preference string
            audio_only: Whether to download audio only
            
        Returns:
            Dictionary with download result
        """
        if not self._validate_url(url):
            raise ValueError("Invalid YouTube URL")
        
        if yt_dlp is None:
            raise RuntimeError("yt-dlp is not installed")
        
        # Ensure download directory exists before proceeding
        self._ensure_download_dir()
        
        try:
            # Get channel name for organization
            channel_name = self._get_channel_name_from_url(url)
            channel_dir = self.download_dir / channel_name
            channel_dir.mkdir(parents=True, exist_ok=True)
            
            # Configure yt-dlp options
            output_template = str(channel_dir / "%(title)s.%(ext)s")
            
            ydl_opts = {
                'outtmpl': output_template,
                'download_archive': str(self.archive_file),
                'quiet': False,
                'no_warnings': False,
            }
            
            # Set format based on audio_only flag
            if audio_only:
                ydl_opts['format'] = 'bestaudio/best'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '0',  # Best quality
                }]
            else:
                ydl_opts['format'] = format_pref or quality
            
            # Download the video
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                
                if info:
                    video_title = info.get('title', 'Unknown')
                    result = {
                        'success': True,
                        'title': video_title,
                        'channel': info.get('uploader') or info.get('channel', channel_name),
                        'duration': info.get('duration', 0),
                        'filesize': info.get('filesize', 0),
                        'path': str(channel_dir)
                    }
                    
                    # Create hardlink if enabled
                    if auto_hardlink:
                        downloaded_file = self._find_downloaded_file(channel_dir, video_title)
                        if downloaded_file:
                            hardlink_success = self._create_hardlink_to_media(downloaded_file)
                            result['hardlinked'] = hardlink_success
                    
                    # Log successful download
                    self._log_download(url, result)
                    return result
                else:
                    raise Exception("Failed to extract video information")
                    
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_video_info(self, url: str) -> Dict[str, Any]:
        """
        Get video information without downloading.
        
        Args:
            url: YouTube video URL
            
        Returns:
            Dictionary with video information
        """
        if not self._validate_url(url):
            raise ValueError("Invalid YouTube URL")
        
        if yt_dlp is None:
            raise RuntimeError("yt-dlp is not installed")
        
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                if info:
                    return {
                        'success': True,
                        'title': info.get('title', 'Unknown'),
                        'channel': info.get('uploader') or info.get('channel', 'Unknown'),
                        'duration': info.get('duration', 0),
                        'view_count': info.get('view_count', 0),
                        'upload_date': info.get('upload_date', ''),
                        'description': info.get('description', '')[:500]  # Truncate description
                    }
                else:
                    raise Exception("Failed to extract video information")
                    
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def download_channel_videos(self, channel_url: str, quality: str = "best", format_pref: Optional[str] = None, audio_only: bool = False, auto_hardlink: bool = False) -> Dict[str, Any]:
        """
        Download new videos from a channel URL.
        
        Args:
            channel_url: YouTube channel URL
            quality: Quality preference
            format_pref: Format preference string
            audio_only: Whether to download audio only
            
        Returns:
            Dictionary with download results
        """
        if not self._validate_url(channel_url):
            raise ValueError("Invalid YouTube URL")
        
        if yt_dlp is None:
            raise RuntimeError("yt-dlp is not installed")
        
        # Ensure download directory exists before proceeding
        self._ensure_download_dir()
        
        try:
            # Get channel name
            channel_name = self._get_channel_name_from_url(channel_url)
            channel_dir = self.download_dir / channel_name
            channel_dir.mkdir(parents=True, exist_ok=True)
            
            # Configure yt-dlp options for channel download
            output_template = str(channel_dir / "%(title)s.%(ext)s")
            
            ydl_opts = {
                'outtmpl': output_template,
                'download_archive': str(self.archive_file),
                'quiet': False,
                'no_warnings': False,
                'ignoreerrors': True,  # Continue on errors
            }
            
            # Set format based on audio_only flag
            if audio_only:
                ydl_opts['format'] = 'bestaudio/best'
                ydl_opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '0',  # Best quality
                }]
            else:
                ydl_opts['format'] = format_pref or quality
            
            downloaded_count = 0
            errors = []
            hardlinked_count = 0
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Extract channel info
                info = ydl.extract_info(channel_url, download=True)
                
                if info and 'entries' in info:
                    # Count successful downloads
                    for entry in info['entries']:
                        if entry:
                            downloaded_count += 1
                elif info:
                    # Single video
                    downloaded_count = 1
            
            # Hardlink all files in channel directory if enabled
            if auto_hardlink:
                try:
                    files = [f for f in channel_dir.iterdir() if f.is_file()]
                    for file in files:
                        if self._create_hardlink_to_media(file):
                            hardlinked_count += 1
                except Exception as e:
                    # Log error but don't fail the download
                    try:
                        with open(self.log_file, 'a', encoding='utf-8') as f:
                            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            f.write(f"[{timestamp}] Channel hardlink error: {str(e)}\n")
                    except Exception:
                        pass
            
            result = {
                'success': True,
                'downloaded_count': downloaded_count,
                'channel': channel_name,
                'path': str(channel_dir)
            }
            if auto_hardlink:
                result['hardlinked_count'] = hardlinked_count
            
            return result
                    
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'downloaded_count': 0
            }
    
    def _log_download(self, url: str, result: Dict[str, Any]) -> None:
        """Log a successful download to the log file."""
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            log_entry = f"[{timestamp}] Downloaded: {result.get('title', 'Unknown')} | Channel: {result.get('channel', 'Unknown')} | URL: {url}\n"
            
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(log_entry)
        except Exception:
            pass  # Don't fail downloads if logging fails
    
    def get_logs(self) -> str:
        """Read and return the download logs."""
        try:
            if not self.log_file.exists():
                return ""
            
            with open(self.log_file, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            return ""

