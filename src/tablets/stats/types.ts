export interface SystemStats {
    load_average: {
      '1min': number;
      '5min': number;
      '15min': number;
    };
    cpu: {
      usage: number;
      temperature: number;
      cores: Array<{
        usage: number;
        temperature: number;
      }>;
      topProcesses: ProcessStats[];
    };
    memory: {
      total: number;
      used: number;
      free: number;
      cached: number;
      available: number;
      swap: {
        total: number;
        used: number;
        free: number;
        percent: number;
      };
    };
    network: {
      interfaces: {
        [key: string]: {
          bytes_recv: number;
          bytes_sent: number;
          packets_recv: number;
          packets_sent: number;
        };
      };
      bytesReceived: number;
      bytesSent: number;
      packetsReceived: number;
      packetsSent: number;
    };
    disk: {
      devices: Array<{
        device: string;
        mountpoint: string;
        total: number;
        used: number;
        free: number;
        readBytes: number;
        writeBytes: number;
        readOperations: number;
        writeOperations: number;
      }>;
    };
    processes: Array<{
      pid: number;
      name: string;
      cpu: number;
      memory: number;
      status: string;
    }>;
    io: DiskIoData;
    disk_usage: {
      [device: string]: {
        total: number;
        used: number;
        free: number;
        percent: number;
        mountpoint: string;
      };
    };
  }
  
  export interface ChartData {
    timestamp: number;
    value: number;
  }
  
  export interface ChartDataSet {
    cpu: ChartData[];
    cpuTemperature: ChartData[];
    memory: ChartData[];
    network: {
      received: ChartData[];
      sent: ChartData[];
      interfaces: {
        [iface: string]: {
          received: ChartData[];
          sent: ChartData[];
        };
      };
    };
    loadAverage: {
      '1min': ChartData[];
      '5min': ChartData[];
      '15min': ChartData[];
    };
    disk: {
      devices: {
        [device: string]: {
          read: ChartData[];
          write: ChartData[];
        };
      };
    };
  }

export interface ProcessStats {
  name: string;
  cpu_percent: number;
  executablePaths: string[];
  processCount: number;
  memory_bytes: number;
}

export interface DiskIoData {
  devices: {
    [device: string]: {
      read_bytes: number;
      write_bytes: number;
    };
  };
}