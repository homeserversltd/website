"""System statistics monitoring functionality."""
from typing import Dict, Any, Optional
from flask import current_app
from backend.stats.utils import collect_system_stats

class SystemStatsMonitor:
    """Monitor system statistics including CPU, memory, and disk usage."""
    
    def __init__(self):
        self.last_stats: Optional[Dict[str, Any]] = None
        
    def collect_stats(self) -> Dict[str, Any]:
        """Collect current system statistics."""
        try:
            stats = collect_system_stats()
            self.last_stats = stats
            return stats
        except Exception as e:
            current_app.logger.error(f"Error collecting system stats: {str(e)}")
            return self.last_stats or {}
            
    def broadcast_stats(self) -> Dict[str, Any]:
        """Get current stats for broadcasting."""
        return self.collect_stats() 
        
    def broadcast_admin_stats(self) -> Dict[str, Any]:
        """Get detailed system stats for admin broadcasts.
        
        This method provides more detailed system information intended
        for admin users only.
        """
        stats = self.collect_stats()
        
        # Add any admin-specific stats here
        # For now, we'll just return the same stats as broadcast_stats
        
        return stats 