"""
SyncMonitor: Background NAS sync job management and progress broadcasting.

UI-triggered sync runs the same /usr/local/sbin/safe-nas-sync.sh process as cron
(sudo from www-data), with system-wide flock inside the script.
"""
import time
import threading
import subprocess
from flask import current_app
from backend import socketio

SAFE_NAS_SYNC_SH = "/usr/local/sbin/safe-nas-sync.sh"
SUDO_BIN = "/usr/bin/sudo"
AUTO_SYNC_LOG = "/var/log/homeserver/auto-sync.log"
EXPECTED_SOURCE = "/mnt/nas"
EXPECTED_DEST = "/mnt/nas_backup"


def _parse_last_rsync_stats_from_log() -> tuple[int, int]:
    """
    Read rsync --stats lines appended to auto-sync.log by safe-nas-sync.sh.
    Returns (files_transferred, bytes_transferred) from the most recent stats block.
    """
    files_transferred = 0
    bytes_transferred = 0
    try:
        with open(AUTO_SYNC_LOG, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except OSError as e:
        current_app.logger.warning("[SYNC] Could not read auto-sync log: %s", e)
        return 0, 0

    chunk = lines[-4000:] if len(lines) > 4000 else lines
    start_idx = None
    for i in range(len(chunk) - 1, -1, -1):
        if "Number of regular files transferred:" in chunk[i]:
            start_idx = i
            break
    if start_idx is None:
        for i in range(len(chunk) - 1, -1, -1):
            line_lower = chunk[i].lower()
            if "total transferred file size:" in chunk[i] or "total size is" in line_lower:
                start_idx = i
                break
    if start_idx is None:
        return 0, 0

    for line in chunk[start_idx:]:
        if "Number of regular files transferred:" in line:
            try:
                files_transferred = int(line.split(":")[1].strip())
            except (ValueError, IndexError) as e:
                current_app.logger.error(
                    "[SYNC] Error parsing files_transferred: %s, line: %s", e, line
                )
        elif "Total transferred file size:" in line:
            try:
                size_part = line.split(":")[1].strip().split(" ")[0].replace(",", "")
                bytes_transferred = int(size_part)
                if bytes_transferred > (30 * 1024 * 1024 * 1024):
                    current_app.logger.warning(
                        "[SYNC] Suspiciously large bytes_transferred: %s bytes", bytes_transferred
                    )
                    for alt_line in chunk[start_idx:]:
                        if "total size is" in alt_line.lower():
                            try:
                                alt_size = alt_line.split("total size is")[1].strip().split()[0].replace(",", "")
                                alt_bytes = int(alt_size)
                                if alt_bytes < bytes_transferred:
                                    current_app.logger.info(
                                        "[SYNC] Using alternative smaller size: %s bytes", alt_bytes
                                    )
                                    bytes_transferred = alt_bytes
                            except (ValueError, IndexError) as e:
                                current_app.logger.error(
                                    "[SYNC] Error parsing alternative size: %s", e
                                )
            except (ValueError, IndexError) as e:
                current_app.logger.error(
                    "[SYNC] Error parsing bytes_transferred: %s, line: %s", e, line
                )
        elif "total size is" in line.lower():
            try:
                parts = line.split("total size is")[1].strip().split()[0].replace(",", "")
                alt_bytes = int(parts)
                if bytes_transferred == 0 or (alt_bytes < bytes_transferred):
                    bytes_transferred = alt_bytes
            except (ValueError, IndexError) as e:
                current_app.logger.error(
                    "[SYNC] Error parsing alternative bytes_transferred: %s", e
                )

    if files_transferred == 0:
        bytes_transferred = 0
    elif bytes_transferred == 0 and files_transferred > 0:
        current_app.logger.info(
            "[SYNC] %s files reported by rsync, but 0 bytes transferred; reporting 0 files.",
            files_transferred,
        )
        files_transferred = 0

    return files_transferred, bytes_transferred


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
        Start safe-nas-sync.sh in a background task (separate OS process via sudo).
        Returns job info (job_id, status).
        """
        with self.lock:
            if self.currently_syncing:
                return {
                    "success": False,
                    "message": "A sync is already running. Please wait for it to finish.",
                }
            self.currently_syncing = True
            self.current_job_id = f"sync_{int(time.time())}"
            self.current_progress = 0
            self.last_status = "starting"
            self.current_sync_pid = None
        app = current_app._get_current_object()
        socketio.start_background_task(
            self._run_sync_with_context, app, source, destination, self.current_job_id
        )
        return {
            "success": True,
            "message": "Sync started",
            "job_id": self.current_job_id,
        }

    def _run_sync_with_context(self, app, source, destination, job_id):
        with app.app_context():
            self._run_sync(source, destination, job_id)

    def _run_sync(self, source: str, destination: str, job_id: str):
        try:
            if source != EXPECTED_SOURCE or destination != EXPECTED_DEST:
                current_app.logger.error(
                    "[SYNC] Rejecting sync: only %s -> %s is supported (got %s -> %s)",
                    EXPECTED_SOURCE,
                    EXPECTED_DEST,
                    source,
                    destination,
                )
                self._broadcast_status(job_id, "done", progress=0, success=False)
                return

            self._broadcast_status(job_id, "starting")
            sync_cmd = [SUDO_BIN, SAFE_NAS_SYNC_SH]
            current_app.logger.info("[SYNC] Spawning NAS sync process: %s", " ".join(sync_cmd))

            start_time = time.time()
            keepalive_running = True

            def keepalive_broadcast():
                while keepalive_running:
                    time.sleep(1)
                    if keepalive_running:
                        self._broadcast_status(job_id, "working", progress=self.current_progress)

            keepalive_thread = threading.Thread(target=keepalive_broadcast, daemon=True)
            keepalive_thread.start()

            process = subprocess.Popen(
                sync_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            self.current_sync_pid = process.pid

            stdout_chunks = []
            for line in iter(process.stdout.readline, ""):
                stdout_chunks.append(line)
            process.stdout.close()
            stderr = process.stderr.read()
            return_code = process.wait()
            stdout_text = "".join(stdout_chunks)

            if self.current_progress == 0 and self.last_status == "starting":
                self._broadcast_status(job_id, "working", progress=0)

            duration = time.time() - start_time
            keepalive_running = False
            keepalive_thread.join(timeout=1)

            if stdout_text:
                current_app.logger.info("[SYNC] safe-nas-sync stdout (tail): %s", stdout_text[-2000:])
            if stderr:
                current_app.logger.warning("[SYNC] safe-nas-sync stderr: %s", stderr)

            files_transferred = 0
            bytes_transferred = 0
            if return_code == 0:
                files_transferred, bytes_transferred = _parse_last_rsync_stats_from_log()
                current_app.logger.info(
                    "[SYNC] Parsed stats from log: files=%s bytes=%s",
                    files_transferred,
                    bytes_transferred,
                )
            else:
                current_app.logger.error(
                    "[SYNC] safe-nas-sync exited with code %s", return_code
                )

            if return_code == 0:
                self._broadcast_status(
                    job_id,
                    "done",
                    progress=100,
                    success=True,
                    bytes_transferred=bytes_transferred,
                    files_transferred=files_transferred,
                    duration=duration,
                )
            else:
                self._broadcast_status(
                    job_id,
                    "done",
                    progress=self.current_progress,
                    success=False,
                    bytes_transferred=bytes_transferred,
                    files_transferred=files_transferred,
                    duration=duration,
                )
        except Exception as e:
            current_app.logger.error("[SYNC] Error in sync job: %s", e)
            self._broadcast_status(job_id, "done", success=False)
        finally:
            with self.lock:
                self.currently_syncing = False
                self.current_job_id = None
                self.current_progress = 0
                self.current_sync_pid = None

    def _broadcast_status(
        self,
        job_id,
        status,
        progress=None,
        success=None,
        bytes_transferred=None,
        files_transferred=None,
        duration=None,
    ):
        self.last_status = status
        data = {
            "id": job_id,
            "status": status,
            "timestamp": time.time(),
        }
        if progress is not None:
            data["progress"] = progress
        if status == "done" and success is not None:
            data["success"] = success
        if status == "done":
            if bytes_transferred is not None:
                data["bytes_transferred"] = bytes_transferred
            if files_transferred is not None:
                data["files_transferred"] = files_transferred
            if duration is not None:
                data["duration"] = duration
        try:
            socketio.emit("sync_status", data)
        except Exception as e:
            current_app.logger.error("[SYNC] Error broadcasting sync status: %s", e)

    def get_sync_progress(self):
        with self.lock:
            is_running = self.currently_syncing
            return {
                "syncing": is_running,
                "job_id": self.current_job_id,
                "progress": self.current_progress,
                "status": self.last_status,
            }

    def broadcast_status(self):
        return self.get_sync_progress()


# Single instance per gunicorn worker so "sync already running" and SocketIO broadcasts stay consistent.
sync_monitor = SyncMonitor()
