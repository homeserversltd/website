"""
SyncMonitor: Background NAS sync job management and progress broadcasting.
"""
import os
import time
import threading
import subprocess
from flask import current_app
from backend import socketio

class SyncMonitor:
    """
    Monitor and manage NAS-to-backup sync jobs, broadcasting progress and results.
    """
    def __init__(self):
        self.currently_syncing = False
        self.current_job_id = None
        self.current_progress = 0
        self.last_status = None
        self.lock = threading.Lock()
        self.current_sync_pid = None

    def start_sync(self, source: str, destination: str) -> dict:
        """
        Start a sync job in the background. Returns job info (job_id, status).
        """
        with self.lock:
            if self.currently_syncing:
                return {
                    'success': False,
                    'message': 'A sync is already running. Please wait for it to finish.'
                }
            self.currently_syncing = True
            self.current_job_id = f"sync_{int(time.time())}"
            self.current_progress = 0
            self.last_status = 'starting'
            self.current_sync_pid = None
        # Start the sync in a background thread
        app = current_app._get_current_object()
        socketio.start_background_task(self._run_sync_with_context, app, source, destination, self.current_job_id)
        return {
            'success': True,
            'message': 'Sync started',
            'job_id': self.current_job_id
        }

    def _run_sync_with_context(self, app, source, destination, job_id):
        with app.app_context():
            self._run_sync(source, destination, job_id)

    def _run_sync(self, source, destination, job_id):
        try:
            self._broadcast_status(job_id, 'starting')
            rsync_cmd = [
                "/usr/bin/sudo",
                "/usr/bin/rsync",
                "-avH",
                "--stats",
                "--delete-before",
                "--exclude=lost+found",
                f"{source}/",
                f"{destination}/"
            ]
            start_time = time.time()
            # Start keepalive thread
            keepalive_running = True
            def keepalive_broadcast():
                while keepalive_running:
                    time.sleep(1)
                    if keepalive_running:
                        self._broadcast_status(job_id, 'working', progress=self.current_progress)
            keepalive_thread = threading.Thread(target=keepalive_broadcast, daemon=True)
            keepalive_thread.start()
            process = subprocess.Popen(
                rsync_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            self.current_sync_pid = process.pid
            stdout_lines = []
            files_transferred = 0
            bytes_transferred = 0
            
            # Read stdout line by line for progress
            for line in iter(process.stdout.readline, ''):
                stdout_lines.append(line)
                # Parse and broadcast progress here
                if 'to-check=' in line:
                    try:
                        # Example: '1234 100%   ... to-check=0/1234'
                        parts = line.split('to-check=')
                        if len(parts) > 1:
                            nums = parts[1].split('/')
                            done = int(nums[1]) - int(nums[0])
                            total = int(nums[1])
                            percent = int((done / total) * 100) if total > 0 else 100
                            self.current_progress = percent
                            self._broadcast_status(job_id, 'working', progress=percent)
                    except Exception:
                        pass
                    
            # Ensure process completes and get return code
            process.stdout.close()
            stderr = process.stderr.read()
            return_code = process.wait()
            
            # If no 'working' status was emitted, emit one with 0% progress
            if self.current_progress == 0 and self.last_status == 'starting':
                self._broadcast_status(job_id, 'working', progress=0)
            
            duration = time.time() - start_time
            # Stop keepalive thread
            keepalive_running = False
            keepalive_thread.join(timeout=1)
            # Parse stats from stdout_lines
            for line in stdout_lines:
                if "Number of regular files transferred:" in line:
                    try:
                        files_transferred = int(line.split(':')[1].strip())
                    except Exception as e:
                        current_app.logger.error(f"[SYNC] Error parsing files_transferred: {str(e)}, line: {line}")
                elif "Total transferred file size:" in line:
                    try:
                        size_part = line.split(':')[1].strip().split(' ')[0].replace(',', '')
                        bytes_transferred = int(size_part)
                        # Add validation for obviously incorrect values
                        if bytes_transferred > (30 * 1024 * 1024 * 1024):  # > 30GB
                            current_app.logger.warning(f"[SYNC] Suspiciously large bytes_transferred: {bytes_transferred} bytes")
                            # Try to parse alternative format
                            for alt_line in stdout_lines:
                                if "total size is" in alt_line.lower():
                                    try:
                                        alt_size = alt_line.split("total size is")[1].strip().split()[0].replace(',', '')
                                        alt_bytes = int(alt_size)
                                        if alt_bytes < bytes_transferred:
                                            current_app.logger.info(f"[SYNC] Using alternative smaller size: {alt_bytes} bytes")
                                            bytes_transferred = alt_bytes
                                    except Exception as e:
                                        current_app.logger.error(f"[SYNC] Error parsing alternative size: {str(e)}")
                    except Exception as e:
                        current_app.logger.error(f"[SYNC] Error parsing bytes_transferred: {str(e)}, line: {line}")
                elif "total size is" in line:
                    # Alternative format in rsync output
                    try:
                        parts = line.split("total size is")[1].strip().split()[0].replace(',', '')
                        alt_bytes = int(parts)
                        if bytes_transferred == 0 or (alt_bytes < bytes_transferred):
                            bytes_transferred = alt_bytes
                    except Exception as e:
                        current_app.logger.error(f"[SYNC] Error parsing alternative bytes_transferred: {str(e)}, line: {line}")

            # If no files were transferred, set bytes_transferred to 0 regardless of what was parsed
            if files_transferred == 0:
                current_app.logger.info("[SYNC] No files transferred, setting bytes_transferred to 0")
                bytes_transferred = 0
            # If bytes_transferred is 0 (despite files_transferred > 0 from parsing),
            # then rsync might have counted metadata/empty dirs without actual data transfer.
            # Per user request, adjust files_transferred to 0 for client reporting in this case.
            elif bytes_transferred == 0 and files_transferred > 0: # files_transferred > 0 is implied by not hitting the previous 'if'
                current_app.logger.info(
                    f"[SYNC] {files_transferred} files reported by rsync, but 0 bytes transferred. "
                    f"Adjusting files_transferred to 0 for client reporting."
                )
                files_transferred = 0

            # Add debug logging for stat parsing
            current_app.logger.info(f"[SYNC] Parsed stats: files_transferred={files_transferred}, bytes_transferred={bytes_transferred}")
            if bytes_transferred > (30 * 1024 * 1024 * 1024):  # > 30GB
                current_app.logger.error(f"[SYNC] Final bytes_transferred suspiciously large: {bytes_transferred} bytes")
            
            # Log rsync command for debugging
            current_app.logger.info(f"[SYNC] Executing rsync command: {' '.join(rsync_cmd)}")
            
            # Save output for debugging
            if return_code != 0:
                current_app.logger.error(f"[SYNC] rsync failed with code {return_code}")
                current_app.logger.error(f"[SYNC] stderr: {stderr}")
                # Log the first 10 lines of stdout for context
                for i, line in enumerate(stdout_lines[:10]):
                    current_app.logger.error(f"[SYNC] stdout[{i}]: {line.strip()}")
            
            # Broadcast final status
            if return_code == 0:
                self._broadcast_status(
                    job_id, 'done', progress=100, success=True,
                    bytes_transferred=bytes_transferred,
                    files_transferred=files_transferred,
                    duration=duration
                )
            else:
                self._broadcast_status(
                    job_id, 'done', progress=self.current_progress, success=False,
                    bytes_transferred=bytes_transferred,
                    files_transferred=files_transferred,
                    duration=duration
                )
        except Exception as e:
            current_app.logger.error(f"[SYNC] Error in sync job: {str(e)}")
            self._broadcast_status(job_id, 'done', success=False)
        finally:
            with self.lock:
                self.currently_syncing = False
                self.current_job_id = None
                self.current_progress = 0
                self.current_sync_pid = None

    def _broadcast_status(self, job_id, status, progress=None, success=None, bytes_transferred=None, files_transferred=None, duration=None):
        self.last_status = status
        data = {
            'id': job_id,
            'status': status,  # 'starting', 'working', 'done'
            'timestamp': time.time()
        }
        if progress is not None:
            data['progress'] = progress
        if status == 'done' and success is not None:
            data['success'] = success
        if status == 'done':
            if bytes_transferred is not None:
                data['bytes_transferred'] = bytes_transferred
            if files_transferred is not None:
                data['files_transferred'] = files_transferred
            if duration is not None:
                data['duration'] = duration
        try:
            socketio.emit('sync_status', data)
        except Exception as e:
            current_app.logger.error(f"[SYNC] Error broadcasting sync status: {str(e)}")

    def get_sync_progress(self):
        with self.lock:
            is_running = self.currently_syncing
            return {
                'syncing': is_running,
                'job_id': self.current_job_id,
                'progress': self.current_progress,
                'status': self.last_status
            }

    def broadcast_status(self):
        # For use by the broadcaster thread
        return self.get_sync_progress() 