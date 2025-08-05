import React from 'react';
import { ChartData } from '../types';

interface MemoryBarProps {
  currentUsage: {
    used: number;
    available: number;
    total: number;
    percent: number;
    swap: {
      used: number;
      free: number;
      total: number;
      percent: number;
    };
  };
  historicalData: ChartData[];  // Keeping this to maintain interface compatibility
}

export const MemoryBar: React.FC<MemoryBarProps> = ({ currentUsage }) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="memory-stats">
      {/* RAM Usage */}
      <div className="memory-current">
        <div className="memory-label">RAM</div>
        <div className="memory-bar">
          <div 
            className="memory-bar-fill" 
            style={{ width: `${currentUsage.percent}%` }}
          >
            <span className="memory-text">
              {currentUsage.percent.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="memory-details">
          <div>Used: {formatBytes(currentUsage.used)}</div>
          <div>Available: {formatBytes(currentUsage.available)}</div>
          <div>Total: {formatBytes(currentUsage.total)}</div>
        </div>
      </div>

      {/* Swap Usage */}
      <div className="memory-current">
        <div className="memory-label">Swap</div>
        <div className="memory-bar">
          <div 
            className="memory-bar-fill memory-bar-fill-swap" 
            style={{ width: `${currentUsage.swap.percent}%` }}
          >
            <span className="memory-text">
              {currentUsage.swap.percent.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="memory-details">
          <div>Used: {formatBytes(currentUsage.swap.used)}</div>
          <div>Free: {formatBytes(currentUsage.swap.free)}</div>
          <div>Total: {formatBytes(currentUsage.swap.total)}</div>
        </div>
      </div>
    </div>
  );
}; 