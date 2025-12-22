/* eslint-disable react/prop-types */
import React, { useMemo, useCallback } from 'react';
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
import { useStore } from '../../../store';

interface NetworkInterface {
  name: string;
  label: string;
  bytesReceived: number;
  bytesSent: number;
}

interface NetworkSpeedChartProps {
  downloadData: ChartData[];
  uploadData: ChartData[];
  interfaces: NetworkInterface[];
}

export const NetworkSpeedChart: React.FC<NetworkSpeedChartProps> = React.memo(({ downloadData, uploadData, interfaces }) => {
  const isAdmin = useStore(state => state.isAdmin);

  // Memoize combined data
  const combinedData = useMemo(() => 
    downloadData.map((downloadPoint, index) => ({
      timestamp: downloadPoint.timestamp,
      download: downloadPoint.value,
      upload: uploadData[index]?.value || 0,
    })),
    [downloadData, uploadData]
  );

  // Memoize formatter functions
  const formatXAxis = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getMinutes()}:${date.getSeconds().toString().padStart(2, '0')}`;
  }, []);

  // Memoize bytes formatter
  const formatBytes = useCallback((bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }, []);

  // Add debounce to tooltip interactions in admin mode
  const tooltipProps = useMemo(() => ({
    labelFormatter: formatXAxis,
    formatter: (value: number, name: string) => {
      const label = name === 'download' ? 'Download Speed' : 'Upload Speed';
      return [formatBytes(value), label];
    },
    isAnimationActive: false,
    ...(isAdmin && { 
      mouseEnterDelay: 60,
      mouseLeaveDelay: 60,
      animationDuration: 100
    })
  }), [formatXAxis, formatBytes, isAdmin]);

  return (
    <div className="network-stats-container">
      <div className="network-speed-chart">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={combinedData} margin={{ top: 20, right: 20, left: 20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatXAxis}
              interval="preserveStartEnd"
              stroke="var(--hiddenTabText)"
            />
            <YAxis
              yAxisId="left"
              tickFormatter={formatBytes}
              stroke="var(--hiddenTabText)"
              domain={[0, 'dataMax * 1.1']}
              tickMargin={16}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={formatBytes}
              stroke="var(--hiddenTabText)"
              domain={[0, 'dataMax * 1.1']}
              tickMargin={16}
            />
            <Tooltip {...tooltipProps} />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="download"
              stroke="var(--secondary)"
              dot={false}
              name="Download Speed"
              isAnimationActive={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="upload"
              stroke="var(--accent)"
              dot={false}
              name="Upload Speed"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="network-interfaces">
        <table className="network-interfaces-table">
          <thead>
            <tr>
              <th>Interface</th>
              <th>Total Received</th>
              <th>Total Sent</th>
            </tr>
          </thead>
          <tbody>
            {interfaces.map((iface) => (
              <tr key={iface.name}>
                <td>
                  <span className="interface-name">{iface.label}</span>
                  <span className="interface-label"> ({iface.name})</span>
                </td>
                <td className="data-cell">{formatBytes(iface.bytesReceived)}</td>
                <td className="data-cell">{formatBytes(iface.bytesSent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

NetworkSpeedChart.displayName = 'NetworkSpeedChart'; 