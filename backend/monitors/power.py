"""Power monitoring functionality."""
import time
from typing import List, Optional, Dict
from flask import current_app
from backend.stats.utils import read_rapl_energy

class PowerMonitor:
    """Monitor system power consumption using RAPL."""
    def __init__(self):
        self.last_core: Optional[int] = None
        self.last_uncore: Optional[int] = None
        self.last_time: float = 0.0
        self.history: List[float] = []
        self.broadcast_interval = current_app.config['POWER_SAMPLE_INTERVAL'] / 1000.0
        self._queue_initial_samples()
        
    def calculate_power(self) -> Optional[float]:
        """Calculate current power usage with validation."""
        try:
            now = time.time()
            current_core_reading = read_rapl_energy('core')
            current_uncore_reading = read_rapl_energy('uncore')

            # Essential check for core readings and time
            if current_core_reading is None or self.last_core is None or self.last_time == 0.0:
                current_app.logger.warning(
                    "Power calculation: Missing essential core RAPL data or uninitialized last_time. " +
                    f"Current (core: {current_core_reading}), Previous (last_core: {self.last_core}, last_time: {self.last_time}). " +
                    "Updating last values and skipping cycle."
                )
                self.last_core = current_core_reading
                self.last_uncore = current_uncore_reading # Update with current uncore if available
                self.last_time = now
                return None

            time_delta = now - self.last_time

            if time_delta <= 0:
                current_app.logger.warning(f"Power calculation: time_delta is zero or negative ({time_delta}). Updating last_time and skipping calculation.")
                self.last_time = now
                return None

            core_energy_delta = current_core_reading - self.last_core
            uncore_energy_delta = 0

            if current_uncore_reading is not None and self.last_uncore is not None:
                uncore_energy_delta = current_uncore_reading - self.last_uncore
            elif current_uncore_reading is None:
                # current_app.logger.debug("Power calculation: current_uncore_reading is None. Uncore delta will be 0 for this cycle.")
                pass
            elif self.last_uncore is None:
                # current_app.logger.debug("Power calculation: self.last_uncore was None. Uncore delta will be 0 for this cycle until next valid reading.")
                pass
            
            energy_delta = core_energy_delta + uncore_energy_delta # Total package energy delta
            power = energy_delta / time_delta # Total package power in µW

            # Validate plausible package power values (e.g., 0-30W for N100 package)
            if not (0 <= power <= 30_000_000):  # 30W in microwatts
                current_app.logger.warning(
                    f"Implausible package power value: {power / 1_000_000:.2f}W ({power}µW). " +
                    f"Details: current_core={current_core_reading}, last_core={self.last_core}, " +
                    f"current_uncore={current_uncore_reading}, last_uncore={self.last_uncore}, " +
                    f"time_delta={time_delta:.4f}s. Updating last values and skipping this data point."
                )
                self.last_core = current_core_reading
                self.last_uncore = current_uncore_reading
                self.last_time = now
                return None

            self._update_history(power) # power is in microwatts here

            self.last_core = current_core_reading
            self.last_uncore = current_uncore_reading
            self.last_time = now

            # Log the combined package power
            # current_app.logger.debug(f"Power calculation (Package Total): {power / 1_000_000:.2f}W (Core Delta: {core_energy_delta/time_delta/1_000_000:.2f}W, Uncore Delta: {uncore_energy_delta/time_delta/1_000_000:.2f}W)")
            return power / 1_000_000

        except ValueError as e:
            current_app.logger.error(f"Power calculation ValueError: {str(e)}. Attempting to update last values and skip.")
            # Try to update last values even on error to prevent stale data issues
            self.last_core = read_rapl_energy('core') # Re-read, might be transient
            self.last_uncore = read_rapl_energy('uncore')
            self.last_time = time.time()
            return None
        except Exception as e:
            current_app.logger.error(f"Power calculation generic error: {str(e)}. Returning None.")
            return None

    def _queue_initial_samples(self) -> None:
        """Get initial samples for delta calculation."""
        self.last_core = read_rapl_energy('core')
        self.last_uncore = read_rapl_energy('uncore')
        self.last_time = time.time()
        
    def _update_history(self, power: float) -> None:
        """Update the power history."""
        self.history.append(power / 1_000_000)  # Store in watts
        if len(self.history) > current_app.config['POWER_HISTORY_LENGTH']:
            self.history = self.history[-current_app.config['POWER_HISTORY_LENGTH']:]
        # The call to self._queue_initial_samples() was removed from here.
        # The responsibility of updating self.last_core, self.last_uncore, and self.last_time
        # now lies with the successful calculation path in calculate_power().

    def broadcast_power_data(self) -> Dict:
        """Get current power data for broadcasting."""
        current_power = self.calculate_power()
        if current_power is not None:
            return {
                'current': current_power,
                'historical': self.history,
                'unit': 'W',
                'timestamp': time.time()
            }
        return None 