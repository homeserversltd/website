/* eslint-disable react/prop-types */
import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { ChartData } from '../types';

// Define available line styles
const LINE_STYLES = {
  solid: undefined,
  dashed: "3 3",
  dotted: "1 3",
  dashedLarge: "6 3",
};

// Theme-based colors for lines
const LINE_COLORS = [
  'var(--secondary)',  // Gray
  'var(--accent)',     // Purple
  'var(--warning)',    // Yellow
  'var(--success)',    // Green
  'var(--error)'      // Red
];

interface DeviceData {
  [device: string]: {
    read_bytes: number;
    write_bytes: number;
  };
}

interface DeviceSelection {
  [device: string]: {
    read: boolean;
    write: boolean;
  };
}

// Updated custom legend to use a className and different SVG icons for read vs write
const CustomLegend = ({ payload }: any) => {
  return (
    <div
      className="custom-legend"
      style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '16px', 
        padding: '8px',
        flexWrap: 'wrap'
      }}
    >
      {payload.map((entry: any) => {
        if (entry.value.includes('(Write)')) {
          // Use a square icon for Write lines
          return (
            <div
              key={entry.value}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text)' }}
            >
              <svg width="20" height="20" style={{ marginRight: '4px' }}>
                <rect x="5" y="5" width="10" height="10" fill="none" stroke={entry.color} strokeWidth="2" />
              </svg>
              <span>{entry.value}</span>
            </div>
          );
        } else if (entry.value.includes('(Read)')) {
          // Use a circle icon for Read lines
          return (
            <div
              key={entry.value}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text)' }}
            >
              <svg width="20" height="20" style={{ marginRight: '4px' }}>
                <circle cx="10" cy="10" r="5" fill={entry.color} />
              </svg>
              <span>{entry.value}</span>
            </div>
          );
        }
        // Fallback
        return (
          <div
            key={entry.value}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text)' }}
          >
            <svg width="20" height="20" style={{ marginRight: '4px' }}>
              <circle cx="10" cy="10" r="5" fill={entry.color} />
            </svg>
            <span>{entry.value}</span>
          </div>
        );
      })}
    </div>
  );
};

// Add interface for tooltip props
interface TooltipProps {
  dataKey?: string | number;
  payload?: Array<{
    value: number;
    name: string;
    dataKey: string;
  }>;
}

export const DiskIoChart: React.FC<{
  data: {
    timestamp: number;
    devices: DeviceData;
  }[];
}> = ({ data }) => {
  // Track which devices/operations are selected
  const [deviceSelection, setDeviceSelection] = useState<DeviceSelection>({});

  // Get unique devices from all data points
  const devices = useMemo(() => {
    const deviceSet = new Set<string>();
    data.forEach(point => {
      Object.keys(point.devices).forEach(device => deviceSet.add(device));
    });
    return Array.from(deviceSet);
  }, [data]);

  // Initialize device selection if new devices are found
  React.useEffect(() => {
    const newSelection: DeviceSelection = { ...deviceSelection };
    let changed = false;
    
    devices.forEach(device => {
      if (!deviceSelection[device]) {
        newSelection[device] = { read: true, write: true };
        changed = true;
      }
    });
    
    if (changed) {
      setDeviceSelection(newSelection);
    }
  }, [devices]);

  // Format the X-axis using minutes and seconds
  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getMinutes()}:${date.getSeconds().toString().padStart(2, '0')}`;
  };

  // Helper to convert bytes into human-readable format
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Set dynamic chart height based on viewport width
  const [chartHeight, setChartHeight] = useState(200);
  React.useEffect(() => {
    const handleResize = () => {
      setChartHeight(window.innerWidth <= 480 ? 250 : 200);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Updated DeviceControls component to wrap the read/write checkboxes in a new container for alignment
  const DeviceControls = () => (
    <div className="device-controls">
      {devices.map((device) => (
        <div key={device} className="device-control">
          <div className="device-name">{device}</div>
          <div className="device-checkboxes"> {/* New wrapper for checkboxes */}
            <label>
              <input
                type="checkbox"
                name={`read-${device}`}
                checked={deviceSelection[device]?.read ?? true}
                onChange={e => setDeviceSelection(prev => ({
                  ...prev,
                  [device]: { ...prev[device], read: e.target.checked }
                }))}
              />
              Read
            </label>
            <label>
              <input
                type="checkbox"
                name={`write-${device}`}
                checked={deviceSelection[device]?.write ?? true}
                onChange={e => setDeviceSelection(prev => ({
                  ...prev,
                  [device]: { ...prev[device], write: e.target.checked }
                }))}
              />
              Write
            </label>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="disk-io-chart">
      <DeviceControls />
      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart data={data} margin={{ top: 20, right: 20, left: 20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatXAxis}
            interval="preserveStartEnd"
            stroke="var(--hiddenTabText)"
          />
          <YAxis
            tickFormatter={formatBytes}
            stroke="var(--hiddenTabText)"
            domain={[0, 'dataMax * 1.1']}
          />
          <Tooltip
            labelFormatter={formatXAxis}
            formatter={(value: number, name: string, props: TooltipProps) => {
              const operation = props?.dataKey?.toString().includes('read_bytes') ? 'Read' : 'Write';
              return [formatBytes(value), `${name} ${operation}`];
            }}
            contentStyle={{
              background: 'var(--hiddenTabBackground)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '8px'
            }}
            itemStyle={{
              color: 'var(--text)',
              padding: '2px 0'
            }}
            separator=": "
            wrapperStyle={{
              zIndex: 100
            }}
          />
          <Legend content={CustomLegend} />
          
          {devices.map((device, deviceIndex) => {
            const colorIndex = deviceIndex % LINE_COLORS.length;
            const color = LINE_COLORS[colorIndex];
            return (
              <React.Fragment key={device}>
                {/* Read line */}
                {deviceSelection[device]?.read && (
                  <Line
                    type="monotone"
                    dataKey={`devices.${device}.read_bytes`}
                    stroke={color}
                    strokeDasharray={LINE_STYLES.solid}
                    dot={false}
                    name={`${device} (Read)`} // updated name
                    isAnimationActive={false}
                  />
                )}
                {/* Write line */}
                {deviceSelection[device]?.write && (
                  <Line
                    type="monotone"
                    dataKey={`devices.${device}.write_bytes`}
                    stroke={color}
                    strokeDasharray={LINE_STYLES.dashed}
                    dot={false}
                    name={`${device} (Write)`} // updated name
                    isAnimationActive={false}
                  />
                )}
              </React.Fragment>
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}; 