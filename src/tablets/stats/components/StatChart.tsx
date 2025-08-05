import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartData } from '../types';

export interface StatChartProps {
  data: ChartData[];
  color: string;
  unit: string;
  formatValue?: (value: number) => string;
  height?: number;
  yDomain?: [number, number];
}

export const StatChart: React.FC<StatChartProps> = ({
  data,
  color = 'var(--primary)',
  unit = '%',
  formatValue = (value) => `${value}${unit}`,
  height = 200,
  yDomain
}) => {
  const formatXAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getMinutes()}:${date.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div className="stat-chart">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatXAxis}
            interval="preserveStartEnd"
          />
          <YAxis 
            tickFormatter={formatValue}
            domain={yDomain || [0, 'auto']}
          />
          <Tooltip
            labelFormatter={formatXAxis}
            formatter={(value: number, name: string) => {
              return [formatValue(value), name];
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            data={data}
            name="Value"
            stroke={color}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};