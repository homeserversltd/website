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

interface CpuStatChartProps {
  usageData: ChartData[];
  tempData: ChartData[];
  loadAverage: {
    '1min': ChartData[];
    '5min': ChartData[];
    '15min': ChartData[];
  };
}

// Convert load average to percentage based on number of CPU cores
const formatLoadAvg = (load: number): string => {
  // Get number of CPU cores - this should ideally come from system info
  const cpuCount = navigator.hardwareConcurrency || 4;
  const percentage = (load / cpuCount) * 100;
  return `${percentage.toFixed(1)}%`;
};

export const CpuStatChart: React.FC<CpuStatChartProps> = ({ usageData, tempData, loadAverage }) => {
  const isAdmin = useStore(state => state.isAdmin);

  // Memoize combined data
  const combinedData = useMemo(() => 
    usageData.map((usagePoint, index) => ({
      timestamp: usagePoint.timestamp,
      usage: usagePoint.value,
      temp: tempData[index]?.value || 0
    })),
    [usageData, tempData]
  );

  // Get current load averages
  const currentLoad = {
    '1min': loadAverage['1min'][loadAverage['1min'].length - 1]?.value || 0,
    '5min': loadAverage['5min'][loadAverage['5min'].length - 1]?.value || 0,
    '15min': loadAverage['15min'][loadAverage['15min'].length - 1]?.value || 0
  };

  // Memoize formatter functions
  const formatXAxis = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getMinutes()}:${date.getSeconds().toString().padStart(2, '0')}`;
  }, []);

  // Add debounce to tooltip interactions in admin mode
  const tooltipProps = useMemo(() => ({
    labelFormatter: formatXAxis,
    formatter: (value: number, name: string) => {
      const formatted = name === 'CPU Usage' 
        ? `${value.toFixed(1)}%`
        : `${value.toFixed(1)}°C`;
      return [formatted, name];
    },
    ...(isAdmin && {
      mouseEnterDelay: 60,
      mouseLeaveDelay: 60,
      animationDuration: 100
    })
  }), [formatXAxis, isAdmin]);

  return (
    <div className="cpu-stats-container">
      <div className="cpu-chart">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={combinedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatXAxis}
              interval="preserveStartEnd"
              stroke="var(--hiddenTabText)"
            />
            <YAxis
              yAxisId="left"
              domain={[0, 100]}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
              stroke="var(--hiddenTabText)"
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tickFormatter={(value) => `${value.toFixed(0)}°C`}
              stroke="var(--hiddenTabText)"
            />
            <Tooltip {...tooltipProps} />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="usage"
              stroke="var(--secondary)"
              dot={false}
              name="CPU Usage"
              isAnimationActive={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="temp"
              stroke="var(--accent)"
              dot={false}
              name="Temperature"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="load-averages">
        <div className="load-average-values">
          <div className="load-average-item">
            <span className="load-label">1 min:</span>
            <span className="load-value">{formatLoadAvg(currentLoad['1min'])}</span>
          </div>
          <div className="load-average-item">
            <span className="load-label">5 min:</span>
            <span className="load-value">{formatLoadAvg(currentLoad['5min'])}</span>
          </div>
          <div className="load-average-item">
            <span className="load-label">15 min:</span>
            <span className="load-value">{formatLoadAvg(currentLoad['15min'])}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

CpuStatChart.displayName = 'CpuStatChart'; 