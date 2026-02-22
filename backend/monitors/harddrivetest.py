"""
Hard drive testing and monitoring functionality.
Provides comprehensive testing for NAS drives with real-time progress streaming.

Test types:
  - quick:   SMART short test + fsck
  - full:    SMART long test + non-destructive badblocks + fsck
  - ultimate: SMART long test (pre), destructive badblocks (write-mode), SMART long test (post). Destroys all data on the drive. Not supported for USB drives.
"""
import os
import time
import subprocess
import threading
import json
from typing import Dict, Any, List, Set, Tuple, Optional
from flask import current_app
from backend import socketio
from backend.utils.utils import execute_command, get_partlabel
import getpass
import pwd
import psutil

# Test result file path
RESULTS_FILE = "/var/harddriveTest.txt"

def clear_results_file():
    subprocess.run(["/usr/bin/sudo", "/usr/bin/truncate", "-s", "0", "/var/harddriveTest.txt"], check=True)

class HardDriveTestMonitor:
    """
    Monitor and testing functionality for NAS drives.
    Provides methods to run comprehensive tests and stream results.
    """
    
    def __init__(self):
        self.currently_testing = False
        self.current_test_device = None
        self.current_test_type = None
        self.current_progress = 0
        self.lock = threading.Lock()
        self.current_test_pid = None  # Track the PID of the running test process
        
    def _execute_command(self, command: str) -> Tuple[int, str, str]:
        """Execute a command using the shared utility."""
        if isinstance(command, list):
            success, stdout, stderr = execute_command(command)
        else:
            success, stdout, stderr = execute_command(command.split())
        return 0 if success else 1, stdout, stderr


    

    

    

    
    def _broadcast_test_progress(self, broadcast_id: str, message: str, progress: Optional[int] = None):
        """Broadcast test progress via WebSocket."""
        try:
            current_app.logger.info(f"[HDTEST] Broadcasting message: {message}")
            data = {
                "id": broadcast_id,
                "message": f"{message}",
                "timestamp": time.time()
            }
            if progress is not None:
                data["progress"] = progress
                current_app.logger.info(f"[HDTEST] Progress: {progress}%")
            
            socketio = current_app.extensions['socketio']
            socketio.emit('hard_drive_test', data)
            current_app.logger.info("[HDTEST] Broadcast completed successfully")
        except Exception as e:
            current_app.logger.error(f"[HDTEST] Error broadcasting progress: {str(e)}")
    
    def _append_to_results_file(self, text: str) -> None:
        """
        Append text to the results file using sudo tee.
        
        Args:
            text: Text to append
        """
        try:
            # Add [HDTEST] prefix to non-header lines if not already present
            if not text.startswith('#') and not '[HDTEST]' in text:
                text = f"{text}"
                
            # Use printf to handle newlines and special characters properly
            cmd = f"/usr/bin/sudo /usr/bin/tee -a {RESULTS_FILE}"
            process = subprocess.Popen(
                cmd.split(),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            stdout, stderr = process.communicate(input=text)
            
            if process.returncode != 0:
                current_app.logger.error(f"[HDTEST] Failed to append to results file: {stderr}")
                
        except Exception as e:
            current_app.logger.error(f"[HDTEST] Error writing to results file: {str(e)}")

    def _create_results_file(self, header: str):
        """
        Create a new results file with a header using sudo tee.
        
        Args:
            header: File header
        """
        try:
            # Add [HDTEST] prefix to header if not already present
            if "# [HDTEST]" not in header:
                header = header.replace("# Hard Drive Test Results", "# [HDTEST] Hard Drive Test Results")
                
            # Use printf to handle newlines and special characters properly
            cmd = f"/usr/bin/sudo /usr/bin/tee {RESULTS_FILE}"
            process = subprocess.Popen(
                cmd.split(),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            stdout, stderr = process.communicate(input=header)
            
            if process.returncode != 0:
                current_app.logger.error(f"[HDTEST] Failed to create results file: {stderr}")
                
        except Exception as e:
            current_app.logger.error(f"[HDTEST] Error creating results file: {str(e)}")
    
    def _broadcast_test_status(self, broadcast_id, status, success=None):
        data = {
            "id": broadcast_id,
            "status": status,  # "starting", "working", "done"
            "timestamp": time.time()
        }
        if status == "done":
            data["success"] = success
        socketio = current_app.extensions['socketio']
        socketio.emit('hard_drive_test_status', data)

    def _start_hard_drive_test(self, device: str, test_type: str, broadcast_id: str):
        # Log immediately to confirm thread start, even if app context is missing
        try:
            import sys
            sys.stderr.write(f"[HDTEST] Thread started for device={device}, test_type={test_type}, broadcast_id={broadcast_id}\n")
            sys.stderr.flush()
        except Exception as e:
            pass
        try:
            from flask import current_app
            try:
                with self.lock:
                    # Check if a test is already running by checking the process
                    if self.current_test_pid and psutil.pid_exists(self.current_test_pid):
                        error_message = "A test is already running. Please wait for it to finish."
                        self._broadcast_test_progress(broadcast_id, error_message)
                        return
                    self.currently_testing = True
                    self.current_test_device = device
                    self.current_test_type = test_type
                    self.current_progress = 0
                    self.current_test_pid = None
                # Log user and environment
                current_app.logger.info(f"[HDTEST] Running as user: {getpass.getuser()}, euid: {os.geteuid()}, username: {pwd.getpwuid(os.geteuid()).pw_name}")
                current_app.logger.info(f"[HDTEST] Checking script file: /usr/local/sbin/harddrive_test.sh")
                if not os.path.exists("/usr/local/sbin/harddrive_test.sh"):
                    current_app.logger.error("[HDTEST] Script file does not exist!")
                else:
                    st = os.stat("/usr/local/sbin/harddrive_test.sh")
                    current_app.logger.info(f"[HDTEST] Script permissions: {oct(st.st_mode)}, owner: {st.st_uid}, group: {st.st_gid}")
                # Clear the results file before starting a new test
                try:
                    clear_results_file()
                except Exception as e:
                    current_app.logger.error(f"[HDTEST] Failed to clear results file: {str(e)}")
                # Log the exact command being run
                cmd = ["/usr/bin/sudo", "/usr/local/sbin/harddrive_test.sh", device, test_type]
                current_app.logger.info(f"[HDTEST] Executing command: {' '.join(cmd)}")
                # Launch the test script and store the PID for process-based tracking
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    universal_newlines=True
                )
                with self.lock:
                    self.current_test_pid = process.pid

                # Start keepalive thread to emit 'working' status every 60s while process is alive
                app = current_app._get_current_object()  # Capture the app object

                def keepalive():
                    try:
                        with app.app_context():
                            current_app.logger.info(f"[HDTEST] Keepalive thread started for broadcast_id={broadcast_id}, pid={self.current_test_pid}")
                            while True:
                                with self.lock:
                                    pid = self.current_test_pid
                                if not pid or not psutil.pid_exists(pid):
                                    current_app.logger.info(f"[HDTEST] Keepalive thread exiting for broadcast_id={broadcast_id}, pid={pid}")
                                    break
                                current_app.logger.info(f"[HDTEST] Keepalive emitting 'working' for broadcast_id={broadcast_id}, pid={pid}")
                                self._broadcast_test_status(broadcast_id, "working")
                                time.sleep(60)
                    except Exception as e:
                        import sys
                        sys.stderr.write(f"[HDTEST] Exception in keepalive thread: {str(e)}\n")
                        sys.stderr.flush()
                import threading
                threading.Thread(target=keepalive, daemon=True).start()

                # Wait for completion and capture output
                stdout, stderr = process.communicate()
                # Log all output
                current_app.logger.info(f"[HDTEST] Script return code: {process.returncode}")
                current_app.logger.info(f"[HDTEST] Script stdout: {stdout!r}")
                current_app.logger.info(f"[HDTEST] Script stderr: {stderr!r}")
                # Log results file after script
                if os.path.exists("/var/harddriveTest.txt"):
                    with open("/var/harddriveTest.txt", "r") as f:
                        results = f.read()
                    current_app.logger.info(f"[HDTEST] Results file contents after script:\n{results}")
                else:
                    current_app.logger.warning("[HDTEST] Results file does not exist after script run.")
                if process.returncode != 0:
                    error_message = f"Test failed with return code {process.returncode}: {stderr}"
                    current_app.logger.error(f"[HDTEST] {error_message}")
                    self._broadcast_test_progress(broadcast_id, error_message)
                else:
                    current_app.logger.info("[HDTEST] Test completed successfully")
            except Exception as e:
                error_message = f"Error running test: {str(e)}"
                current_app.logger.error(f"[HDTEST] {error_message}")
                self._broadcast_test_progress(broadcast_id, error_message)
            finally:
                with self.lock:
                    self.currently_testing = False
                    self.current_test_device = None
                    self.current_test_type = None
                    self.current_test_pid = None
            # Always broadcast final completion status
            try:
                current_app.logger.info(f"[HDTEST] Broadcasting final completion status for {broadcast_id}")
                socketio = current_app.extensions['socketio']
                data = {
                    "id": broadcast_id,
                    "message": "[HDTEST] Test completed",
                    "progress": 100,
                    "complete": True,
                    "timestamp": time.time()
                }
                socketio.emit('hard_drive_test_status', data)
                current_app.logger.info("[HDTEST] Final status broadcasted successfully")
            except Exception as e:
                current_app.logger.error(f"[HDTEST] Error broadcasting final completion status: {str(e)}")
        except Exception as outer_e:
            # Log to stderr if app context is not available
            import sys
            sys.stderr.write(f"[HDTEST] Outer exception in thread: {str(outer_e)}\n")
            sys.stderr.flush()

    def _is_usb_device(self, device: str) -> bool:
        """Check if the given device is a USB device using udevadm info.
        Resolves mappers to physical devices, but also works for /dev/sd*, label-based paths, and similar block devices.
        """
        # If device is a mapper, resolve to physical device
        resolved_device = device
        if device.startswith('/dev/mapper/'):
            # Get the underlying physical device using lsblk
            returncode, stdout, stderr = self._execute_command(f"/usr/bin/sudo /usr/bin/lsblk -no PKNAME {device}")
            if returncode == 0 and stdout:
                physical_device = stdout.strip()
                if not physical_device.startswith('/dev/'):
                    physical_device = f"/dev/{physical_device}"
                resolved_device = physical_device
        # For regular block devices, resolved_device is just device
        # Use udevadm to check for USB bus
        returncode, stdout, stderr = self._execute_command(f"/usr/bin/udevadm info --query=property --name={resolved_device}")
        if returncode == 0 and 'ID_BUS=usb' in stdout:
            return True
        return False

    def start_test(self, device: str, test_type: str) -> Dict[str, Any]:
        from flask import current_app
        app = current_app._get_current_object()
        current_app.logger.info(f"[HDTEST] Starting test request - Device: {device}, Type: {test_type}")
        if not device or not test_type:
            current_app.logger.error("[HDTEST] Missing device or test type")
            return {
                "success": False,
                "message": "Device and test type are required"
            }
        # Validate test_type
        valid_types = ["quick", "full", "ultimate"]
        if test_type not in valid_types:
            current_app.logger.error(f"[HDTEST] Invalid test type: {test_type}")
            return {
                "success": False,
                "message": f"Invalid test type: {test_type}. Valid types are: {', '.join(valid_types)}"
            }
        # Ensure device has full path
        if not device.startswith('/dev/'):
            device = f"/dev/{device}"
        # USB check for ultimate
        if test_type == "ultimate" and self._is_usb_device(device):
            error = f"Ultimate test is not supported on USB devices: {device}"
            current_app.logger.error(f"[HDTEST] {error}")
            return {
                "success": False,
                "message": error
            }
        current_app.logger.info(f"[HDTEST] Using full device path: {device}")
        # Generate test ID
        test_id = f"hard_drive_test_{int(time.time())}"
        current_app.logger.info(f"[HDTEST] Generated test ID: {test_id}")
        try:
            # Verify device exists
            if not os.path.exists(device):
                error = f"Device {device} does not exist"
                current_app.logger.error(f"[HDTEST] {error}")
                return {
                    "success": False,
                    "message": error
                }
            # Check if device is mounted
            cmd = f"/usr/bin/sudo /usr/bin/lsblk -n -o MOUNTPOINT {device}"
            current_app.logger.info(f"[HDTEST] Checking mount status: {cmd}")
            returncode, stdout, stderr = self._execute_command(cmd)
            if stdout.strip():
                error = f"Device {device} is mounted at {stdout.strip()}"
                current_app.logger.error(f"[HDTEST] {error}")
                return {
                    "success": False,
                    "message": error
                }
            # Start the test in a thread with app context
            current_app.logger.info("[HDTEST] Starting test thread")
            from backend import socketio
            socketio.start_background_task(self._start_hard_drive_test_with_context, app, device, test_type, test_id)
            success_msg = f"Test started on {device}"
            current_app.logger.info(f"[HDTEST] {success_msg}")
            return {
                "success": True,
                "message": success_msg,
                "test_id": test_id,
                "device": device,
                "label": get_partlabel(device)
            }
        except Exception as e:
            error_msg = f"Error starting test: {str(e)}"
            current_app.logger.error(f"[HDTEST] {error_msg}")
            return {
                "success": False,
                "message": error_msg
            }
    
    def get_test_progress(self) -> Dict[str, Any]:
        """Get the current test progress. Uses process-based tracking for robustness."""
        with self.lock:
            # Check if the test process is still alive
            is_running = False
            if self.current_test_pid:
                is_running = psutil.pid_exists(self.current_test_pid)
                if not is_running:
                    self.current_test_pid = None
            return {
                "testing": is_running,
                "device": self.current_test_device,
                "label": get_partlabel(self.current_test_device) if self.current_test_device else None,
                "test_type": self.current_test_type,
                "progress": self.current_progress
            }
    
    def get_test_results(self) -> Dict[str, Any]:
        """Get the latest test results."""
        try:
            if not os.path.exists(RESULTS_FILE):
                return {
                    "success": False,
                    "message": "No test results available",
                    "results": None
                }
                
            with open(RESULTS_FILE, 'r') as f:
                results = f.read()
                
            return {
                "success": True,
                "message": "Test results retrieved successfully",
                "results": results
            }
            
        except Exception as e:
            current_app.logger.error(f"Error getting test results: {str(e)}")
            return {
                "success": False,
                "message": f"Error getting test results: {str(e)}",
                "results": None
            }
    
    def broadcast_status(self) -> Dict[str, Any]:
        """Get current test status for broadcasting."""
        status = self.get_test_progress()
        status["timestamp"] = time.time()
        return status

    def _start_hard_drive_test_with_context(self, app, device, test_type, broadcast_id):
        with app.app_context():
            self._start_hard_drive_test(device, test_type, broadcast_id)
