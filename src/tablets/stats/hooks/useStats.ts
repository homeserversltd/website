import { useState, useCallback, useEffect, useRef } from 'react';
import { SystemStats, ChartDataSet, ChartData, ProcessStats } from '../types';
import { useStore } from '../../../store';
import { WebSocketEventMap } from '../../../components/WebSocket/types';

// Use the correct tab ID that matches the server config
// const STATS_TAB_ID = 'stats'; // No longer needed for useComponentSubscriptions
const MAX_DATA_POINTS = 60; // 1 minute of data at 1-second intervals

export const useStats = () => {
  // Refs to avoid state changes causing unnecessary renders
  const currentStatsRef = useRef<SystemStats | null>(null);
  const historicalDataRef = useRef<ChartDataSet>({
    cpu: [],
    cpuTemperature: [],
    memory: [],
    network: {
      received: [],
      sent: [],
      interfaces: {}
    },
    loadAverage: {
      '1min': [],
      '5min': [],
      '15min': []
    },
    disk: {
      devices: {}
    },
  });
  
  // State for component to use in rendering
  const [currentStats, setCurrentStats] = useState<SystemStats | null>(null);
  const [historicalData, setHistoricalData] = useState<ChartDataSet>(historicalDataRef.current);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Get WebSocket connection status from store
  const wsStatus = useStore(state => state.status);

  // Reactive selector for system_stats aware of admin mode
  const systemStatsData = useStore(state => {
    const isAdmin = state.isAdmin;
    const adminData = state.broadcastData.admin.system_stats;
    const regularData = state.broadcastData.regular.system_stats;
    return isAdmin && adminData ? adminData : regularData;
  });

  const addDataPoint = useCallback((
    dataset: ChartData[],
    value: number
  ): ChartData[] => {
    // Create new data point
    const now = Date.now();
    const newDataPoint: ChartData = {
      timestamp: now,
      value
    };
    
    // Add to dataset, maintaining max size
    const newDataset = [...dataset, newDataPoint];
    if (newDataset.length > MAX_DATA_POINTS) {
      return newDataset.slice(-MAX_DATA_POINTS);
    }
    return newDataset;
  }, []);

  // Process stats data when broadcast data updates
  const processStatsData = useCallback((statsData: WebSocketEventMap['system_stats'] | undefined) => {
    // Get the latest stats from broadcast data store
    // const wsStats = getBroadcastData('system_stats', false);

    if (!statsData) {
      return;
    }

    // Convert WebSocket stats to our SystemStats format
    const stats: SystemStats = {
      load_average: {
        '1min': statsData.load_average?.['1min'] || 0,
        '5min': statsData.load_average?.['5min'] || 0,
        '15min': statsData.load_average?.['15min'] || 0
      },
      cpu: {
        usage: statsData.cpu.percent,
        temperature: statsData.cpu.temp,
        cores: [],
        topProcesses: statsData.cpu.top_processes.map((p: ProcessStats) => ({
          name: p.name,
          cpu_percent: p.cpu_percent,
          executablePaths: p.executablePaths,
          processCount: p.processCount,
          memory_bytes: p.memory_bytes
        }))
      },
      memory: {
        total: statsData.memory.total,
        used: statsData.memory.used,
        free: statsData.memory.available,
        cached: 0,
        available: statsData.memory.available,
        swap: statsData.memory.swap
      },
      network: {
        interfaces: statsData.network.interfaces || {},
        bytesReceived: statsData.network.recv,
        bytesSent: statsData.network.sent,
        packetsReceived: 0,
        packetsSent: 0
      },
      disk: {
        devices: []
      },
      processes: [],
      io: statsData.io,
      disk_usage: statsData.disk_usage
    };
    
    // Update current stats in ref
    currentStatsRef.current = stats;
    
    // Update historical data in ref
    const updatedHistoricalData = { ...historicalDataRef.current };
    
    // Load average data
    (['1min', '5min', '15min'] as const).forEach(key => {
      updatedHistoricalData.loadAverage[key] = addDataPoint(
        updatedHistoricalData.loadAverage[key],
        stats.load_average[key]
      );
    });
    
    // Network interface data
    if (stats.network.interfaces) {
      Object.entries(stats.network.interfaces).forEach(([iface, ifaceData]) => {
        if (!updatedHistoricalData.network.interfaces[iface]) {
          updatedHistoricalData.network.interfaces[iface] = {
            received: [],
            sent: []
          };
        }
        
        updatedHistoricalData.network.interfaces[iface].received = addDataPoint(
          updatedHistoricalData.network.interfaces[iface].received,
          ifaceData.bytes_recv
        );
        
        updatedHistoricalData.network.interfaces[iface].sent = addDataPoint(
          updatedHistoricalData.network.interfaces[iface].sent,
          ifaceData.bytes_sent
        );
      });
    }
    
    // CPU usage percentage
    const cpuUsage = stats.cpu.usage;
    updatedHistoricalData.cpu = addDataPoint(updatedHistoricalData.cpu, cpuUsage);
    
    // CPU temperature
    const cpuTemp = stats.cpu.temperature;
    updatedHistoricalData.cpuTemperature = addDataPoint(updatedHistoricalData.cpuTemperature, cpuTemp);
    
    // Memory usage percentage
    const memUsage = (stats.memory.used / stats.memory.total) * 100;
    updatedHistoricalData.memory = addDataPoint(updatedHistoricalData.memory, memUsage);
    
    // Network data
    const netReceived = stats.network.bytesReceived;
    const netSent = stats.network.bytesSent;
    updatedHistoricalData.network.received = addDataPoint(updatedHistoricalData.network.received, netReceived);
    updatedHistoricalData.network.sent = addDataPoint(updatedHistoricalData.network.sent, netSent);
    
    // Disk I/O data
    if (stats.io?.devices) {
      Object.entries(stats.io.devices).forEach(([device, deviceData]) => {
        if (!updatedHistoricalData.disk.devices[device]) {
          updatedHistoricalData.disk.devices[device] = {
            read: [],
            write: []
          };
        }
        
        updatedHistoricalData.disk.devices[device].read = addDataPoint(
          updatedHistoricalData.disk.devices[device].read,
          deviceData.read_bytes
        );
        
        updatedHistoricalData.disk.devices[device].write = addDataPoint(
          updatedHistoricalData.disk.devices[device].write,
          deviceData.write_bytes
        );
      });
    }
    
    // Update ref
    historicalDataRef.current = updatedHistoricalData;
    
    // Update state with batched update to prevent re-renders
    setHistoricalData(historicalDataRef.current);
    setCurrentStats(currentStatsRef.current);
    setConnectionStatus('connected');
    setIsLoading(false);
  }, [addDataPoint]);

  // Process stats data when broadcast data updates
  useEffect(() => {
    if (wsStatus === 'connected') {
      // Call processStatsData when systemStatsData (reactive data from store, admin-aware) changes
      processStatsData(systemStatsData);
    } else {
      setConnectionStatus('connecting');
      setIsLoading(true);
    }
  }, [wsStatus, systemStatsData, processStatsData]);

  // Reset data when disconnected
  useEffect(() => {
    if (wsStatus === 'disconnected') {
      // Reset both refs and state
      currentStatsRef.current = null;
      historicalDataRef.current = {
        cpu: [],
        cpuTemperature: [],
        memory: [],
        network: {
          received: [],
          sent: [],
          interfaces: {}
        },
        loadAverage: {
          '1min': [],
          '5min': [],
          '15min': []
        },
        disk: {
          devices: {}
        },
      };
      
      setCurrentStats(null);
      setHistoricalData(historicalDataRef.current);
      setConnectionStatus('error');
    } else if (wsStatus === 'connecting') {
      setConnectionStatus('connecting');
    }
  }, [wsStatus]);

  return {
    currentStats,
    historicalData,
    isLoading,
    connectionStatus
  };
};