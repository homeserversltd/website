// DHCP Premium Tab TypeScript Type Definitions

export interface DhcpLease {
  'ip-address': string;
  'hw-address': string;
  hostname: string;
  expire: string;
  state: string;
}

export interface DhcpReservation {
  'hw-address': string;
  'ip-address': string;
  hostname?: string;
}

export interface DhcpConfig {
  Dhcp4: {
    'interfaces-config'?: {
      interfaces: string[];
    };
    'lease-database'?: {
      type: string;
      persist: boolean;
      'lfc-interval'?: number;
    };
    subnet4: Array<{
      subnet: string;
      pools?: Array<{
        pool: string;
      }>;
      'option-data'?: Array<{
        name: string;
        data: string;
      }>;
      reservations?: DhcpReservation[];
    }>;
  };
}

export interface DhcpStatus {
  active: boolean;
  status: string;
  details: string;
}

export interface DhcpServiceStatus {
  success: boolean;
  status?: DhcpStatus;
  error?: string;
}

export interface DhcpLeasesResponse {
  success: boolean;
  leases?: DhcpLease[];
  error?: string;
}

export interface DhcpReservationsResponse {
  success: boolean;
  reservations?: DhcpReservation[];
  error?: string;
}

export interface DhcpConfigResponse {
  success: boolean;
  config?: DhcpConfig;
  error?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  service?: DhcpStatus;
  config_valid?: boolean;
  error?: string;
}

export type UnifiedLeaseItem = (DhcpLease & { type: 'lease' }) | (DhcpReservation & { type: 'reservation' });

export interface IpPoolRange {
  start: string;
  end: string;
}

export interface IpValidationResult {
  valid: boolean;
  error?: string;
}

export interface DhcpStatistics {
  homeserver_ip: string;
  reservations_count: number;
  reservations_total: number;
  leases_count: number;
  leases_total: number;
}

export interface DhcpStatisticsResponse {
  success: boolean;
  statistics?: DhcpStatistics;
  error?: string;
}

export interface PoolBoundaryUpdate {
  max_reservations: number;
}

export interface PoolBoundaryResponse {
  success: boolean;
  max_reservations?: number;
  error?: string;
}

export interface PoolBoundaryUpdateResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ReservationSliderState {
  isVisible: boolean;
  maxReservations: number;
  minValue: number;
  maxValue: number;
  currentReservations: number;
  currentHosts: number;
}
