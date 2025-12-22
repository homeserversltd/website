import React from 'react';
import { useStore } from '../../../store';

interface DiskUsageData {
  total: number;
  used: number;
  free: number;
  percent: number;
  mountpoint: string;
}

interface DiskUsageProps {
  diskUsage: Record<string, DiskUsageData>;
}

export const DiskUsageChart: React.FC<DiskUsageProps> = ({ diskUsage }) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="disk-usage-stats">
      {Object.entries(diskUsage).map(([device, usage]) => (
        <div key={device} className="disk-usage-item">
          <div className="disk-usage-header">
            <div className="disk-device">{device} ({usage.percent.toFixed(1)}%)</div>
            <div className="disk-mountpoint">Mount: {usage.mountpoint}</div>
          </div>
          
          <div className="disk-usage-bar">
            <div 
              className="disk-usage-fill" 
              style={{ width: `${usage.percent}%` }}
            />
          </div>
          
          <div className="disk-usage-details">
            <div>Used: {formatBytes(usage.used)}</div>
            <div>Free: {formatBytes(usage.free)}</div>
            <div>Total: {formatBytes(usage.total)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}; 