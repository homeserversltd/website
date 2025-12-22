import React, { useMemo, useEffect, useRef } from 'react';
import { ProcessStats } from '../types';
import { Tooltip } from '../../../components/Tooltip';
import { useStore } from '../../../store';
import { useDeepMemo } from '../../../hooks/useDeepMemo';
import { LoadingSpinner } from '../../../components/LoadingSpinner';

interface ProcessUsageListProps {
  processes: ProcessStats[];
  isLoading?: boolean;
}

const DEBUG = true; // process.env.NODE_ENV !== 'production';

export const ProcessUsageList: React.FC<ProcessUsageListProps> = ({ 
  processes, 
  isLoading = false 
}) => {
  const theme = useStore(state => state.theme);
  const isAdmin = useStore(state => state.isAdmin);
  
  // Memoize processes with deep equality check
  const memoizedProcesses = useDeepMemo(processes);

  const prevProcessCount = useRef(processes.length);
  
  // Only log process updates when count changes
  useEffect(() => {
    if (prevProcessCount.current !== processes.length) {
      // console.log('%c📊 Process count changed:', 'color: #FF9800; font-weight: bold', {
      //   from: prevProcessCount.current,
      //   to: processes.length,
      //   firstProcess: processes[0]?.name,
      //   timestamp: new Date().toISOString()
      // });
      prevProcessCount.current = processes.length;
    }
  }, [processes]);

  // Find max CPU percent to scale bars relatively
  const maxCpuPercent = useMemo(() => 
    Math.max(...memoizedProcesses.map(p => p.cpu_percent), 0.1),
    [memoizedProcesses]
  );

  // Memoize the formatBytes function
  const formatBytes = useMemo(() => {
    return (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };
  }, []);

  // Memoize tooltip labels with stricter comparison
  const tooltipLabels = useMemo(() => 
    memoizedProcesses.map(process => ({
      id: `${process.name}-${process.processCount}`, // Remove cpu_percent from ID
      label: {
        name: process.name,
        memory: formatBytes(process.memory_bytes),
        cpu: process.cpu_percent.toFixed(1),
        execs: process.executablePaths?.join('\n') || 'N/A',
        count: process.processCount
      }
    })),
    [memoizedProcesses, formatBytes]
  );

  // Memoize the entire list rendering with stricter dependencies
  const processElements = useMemo(() => 
    tooltipLabels.map((tooltip, index) => {
      const process = memoizedProcesses[index];
      
      return (
        <Tooltip
          key={tooltip.id}
          label={{
            template: `Process: {name}
Memory: {memory}
CPU: {cpu}%
Executables:
{execs}
Instances: {count}`,
            values: tooltip.label
          }}
          sticky={true}
          delay={isAdmin ? 100 : 20}
          updateOnly={true}
        >
          <div className="process-bar">
            <div 
              className="process-bar-fill" 
              style={{ width: `${Math.max(process.cpu_percent, 1)}%` }}
            />
            <div className="process-text-container">
              <span className="process-name">{process.name}</span>
              <span className="process-usage">{process.cpu_percent.toFixed(1)}%</span>
            </div>
          </div>
        </Tooltip>
      );
    }),
    [tooltipLabels, isAdmin] // Remove memoizedProcesses from dependencies
  );

  if (isLoading) {
    return (
      <div className="process-usage-loading">
        <LoadingSpinner size="medium" />
        <p>Loading process usage...</p>
      </div>
    );
  }

  if (!processes || processes.length === 0) {
    return (
      <div className="process-usage-empty">
        <p>No process data available</p>
      </div>
    );
  }

  return (
    <div className="process-usage-list">
      {processElements}
    </div>
  );
}; 