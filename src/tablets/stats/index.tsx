import React from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useStore } from '../../store';
import { api } from '../../api/client';
import { API_ENDPOINTS } from '../../api/endpoints';
import './stats.css';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';  
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useStats } from './hooks/useStats';
import { StatChart } from './components/StatChart';
import { CpuStatChart } from './components/CpuStatChart';
import { MemoryBar } from './components/MemoryRadialBar';
import { NetworkSpeedChart } from './components/NetworkSpeedChart';
import { DiskIoChart } from './components/DiskIoChart';
import { KeaLeasesTable } from './components/KeaLeasesTable';
import { ProcessUsageList } from './components/ProcessUsageList';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { DiskUsageChart } from './components/DiskUsageChart';
import { SystemStats } from './types';

// Helper function to get friendly interface labels
const getInterfaceLabel = (iface: string): string => {
  switch (iface) {
    case 'wan0':
      return 'WAN';
    case 'lan0':
      return 'LAN';
    case 'tailscale0':
      return 'Tailscale VPN';
    case 'veth0':
      return 'Transmission';
    default:
      return iface;
  }
};

interface StatElementProps {
  elementId: string;
  title: string;
  children: React.ReactNode;
}

const StatElement = React.memo(({ elementId, title, children }: StatElementProps) => {
  const isAdmin = useStore(state => state.isAdmin);
  const isVisible = useStore(state => state.isElementVisible('stats', elementId));
  const updateElementVisibility = useStore(state => state.updateElementVisibility);

  const toggleVisibility = async () => {
    try {
      await api.put(API_ENDPOINTS.tabs.updateElementVisibility, {
        tabId: 'stats',
        elementId,
        visibility: !isVisible
      });
      updateElementVisibility('stats', elementId, !isVisible);
    } catch (error) {
      console.error(`Failed to toggle ${elementId} visibility:`, error);
    }
  };

  // In admin mode, show all elements with toggle controls
  // In regular mode, only show if element is visible
  if (!isAdmin && !isVisible) return null;

  return (
    <div className="stat-element" data-visible={isVisible}>
      <div className="stat-header">
        {isAdmin && (
          <button 
            onClick={toggleVisibility}
            className="visibility-toggle"
            data-visible={isVisible}
            aria-label={`${isVisible ? 'Hide' : 'Show'} ${title}`}
          >
            <FontAwesomeIcon icon={isVisible ? faEye : faEyeSlash} />
          </button>
        )}
        <h3 className="stat-title">{title}</h3>
      </div>
      <div className="stat-content">
        {children}
      </div>
    </div>
  );
}, (prev, next) => 
  prev.elementId === next.elementId &&
  prev.title === next.title &&
  prev.children === next.children
);

StatElement.displayName = 'StatElement';

const StatsTablet: React.FC = () => {
  const { currentStats, historicalData, isLoading, connectionStatus } = useStats();

  if (isLoading) {
    return (
      <div className="stats-loading">
        <LoadingSpinner size="large" />
        <div className="loading-message">
          {connectionStatus === 'connecting' 
            ? 'Connecting to server...' 
            : 'Loading system statistics...'}
        </div>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <ErrorBoundary>
      <div className="stats-tablet">

        <StatElement elementId="cpu-chart" title="CPU Usage & Load">
          <CpuStatChart 
            usageData={historicalData.cpu}
            tempData={historicalData.cpuTemperature}
            loadAverage={historicalData.loadAverage}
          />
        </StatElement>
        
        <StatElement elementId="network" title="Network Traffic (WAN)">
          {historicalData?.network?.received?.length > 0 ? (
            <NetworkSpeedChart
              downloadData={historicalData.network.received}
              uploadData={historicalData.network.sent}
              interfaces={Object.entries(historicalData.network.interfaces).map(([name, data]) => ({
                name,
                label: getInterfaceLabel(name),
                bytesReceived: data.received[data.received.length - 1]?.value || 0,
                bytesSent: data.sent[data.sent.length - 1]?.value || 0
              }))}
            />
          ) : (
            <div className="network-loading">
              <LoadingSpinner size="medium" />
              <p>Loading network data...</p>
            </div>
          )}
        </StatElement>

        <StatElement elementId="io-section" title="Disk I/O">
          {historicalData.disk.devices && Object.keys(historicalData.disk.devices).length > 0 ? (
            <DiskIoChart 
              data={Object.entries(historicalData.disk.devices)[0]?.[1].read.map((point, i) => ({
                timestamp: point.timestamp,
                devices: Object.entries(historicalData.disk.devices).reduce((acc, [device, data]) => ({
                  ...acc,
                  [device]: {
                    read_bytes: data.read[i]?.value || 0,
                    write_bytes: data.write[i]?.value || 0
                  }
                }), {})
              }))}
            />
          ) : (
            <div className="io-loading">
              <LoadingSpinner size="medium" />
              <p>Loading disk I/O data...</p>
            </div>
          )}
        </StatElement>

        <StatElement elementId="memory" title="Memory Usage">
          {currentStats?.memory ? (
            <MemoryBar 
              currentUsage={{
                used: currentStats.memory.used,
                available: currentStats.memory.available,
                total: currentStats.memory.total,
                percent: (currentStats.memory.used / currentStats.memory.total) * 100,
                swap: currentStats.memory.swap
              }}
              historicalData={historicalData.memory}
            />
          ) : (
            <div className="memory-loading">
              <LoadingSpinner size="medium" />
              <p>Loading memory data...</p>
            </div>
          )}
        </StatElement>

        <StatElement elementId="disk-usage" title="Disk Usage">
          {currentStats?.disk_usage ? (
            <DiskUsageChart diskUsage={currentStats.disk_usage} />
          ) : (
            <div className="disk-usage-loading">
              <LoadingSpinner size="medium" />
              <p>Loading disk usage data...</p>
            </div>
          )}
        </StatElement>

        <StatElement elementId="kea-leases" title="DHCP Leases">
          <KeaLeasesTable />
        </StatElement>

        <StatElement elementId="process-usage" title="CPU Usage by Process">
          <ProcessUsageList 
            processes={currentStats?.cpu?.topProcesses || []} 
            isLoading={!currentStats?.cpu?.topProcesses}
          />
        </StatElement>

      </div>
    </ErrorBoundary>
  );
}

export default StatsTablet;