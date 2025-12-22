import { useState, useCallback } from 'react';
import {
  DhcpStatus,
  DhcpLease,
  DhcpReservation,
  DhcpConfig,
  HealthStatus,
  DhcpServiceStatus,
  DhcpLeasesResponse,
  DhcpReservationsResponse,
  DhcpConfigResponse,
  DhcpStatistics,
  DhcpStatisticsResponse,
  PoolBoundaryResponse,
  PoolBoundaryUpdateResponse
} from '../types';

export const useDhcpControls = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleError = (err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
    setError(errorMessage);
    setIsLoading(false);
    throw err;
  };

  const getStatus = useCallback(async (): Promise<DhcpStatus> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dhcp/status');
      const data: DhcpServiceStatus = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get DHCP status');
      }
      
      setIsLoading(false);
      return data.status!;
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const getLeases = useCallback(async (): Promise<DhcpLease[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dhcp/leases');
      const data: DhcpLeasesResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get DHCP leases');
      }
      
      setIsLoading(false);
      return data.leases || [];
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const getReservations = useCallback(async (): Promise<DhcpReservation[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dhcp/reservations');
      const data: DhcpReservationsResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get DHCP reservations');
      }
      
      setIsLoading(false);
      return data.reservations || [];
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const addReservation = useCallback(async (
    hwAddress: string,
    ipAddress?: string,
    hostname?: string
  ): Promise<DhcpReservation> => {
    setIsLoading(true);
    setError(null);
    try {
      const body: any = {
        'hw-address': hwAddress,
      };
      
      // Only include ip-address if provided (backend will auto-assign if not provided)
      if (ipAddress) {
        body['ip-address'] = ipAddress;
      }
      
      if (hostname) {
        body.hostname = hostname;
      }
      
      const response = await fetch('/api/dhcp/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to add reservation');
      }
      
      setIsLoading(false);
      return data.reservation;
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const removeReservation = useCallback(async (identifier: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dhcp/reservations/${encodeURIComponent(identifier)}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove reservation');
      }
      
      setIsLoading(false);
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const updateReservation = useCallback(async (
    identifier: string,
    ipAddress: string
  ): Promise<DhcpReservation> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dhcp/reservations/${encodeURIComponent(identifier)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'ip-address': ipAddress,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update reservation');
      }
      
      setIsLoading(false);
      return data.reservation;
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const getConfig = useCallback(async (): Promise<DhcpConfig> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dhcp/config');
      const data: DhcpConfigResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get DHCP config');
      }
      
      setIsLoading(false);
      return data.config!;
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const updateConfig = useCallback(async (config: DhcpConfig): Promise<DhcpConfig> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dhcp/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config }),
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update DHCP config');
      }
      
      setIsLoading(false);
      return data.config;
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const checkHealth = useCallback(async (): Promise<HealthStatus> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dhcp/health');
      const data: HealthStatus = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Health check failed');
      }
      
      setIsLoading(false);
      return data;
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const getStatistics = useCallback(async (): Promise<DhcpStatistics> => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('[DHCP] Fetching statistics...');
      const response = await fetch('/api/dhcp/statistics');
      const data: DhcpStatisticsResponse = await response.json();
      
      console.log('[DHCP] Statistics response:', {
        success: data.success,
        statistics: data.statistics,
        error: data.error
      });
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get DHCP statistics');
      }
      
      if (data.statistics) {
        console.log('[DHCP] Statistics values:', {
          reservations_count: data.statistics.reservations_count,
          reservations_total: data.statistics.reservations_total,
          leases_count: data.statistics.leases_count,
          leases_total: data.statistics.leases_total
        });
      }
      
      setIsLoading(false);
      return data.statistics!;
    } catch (err) {
      console.error('[DHCP] Error fetching statistics:', err);
      handleError(err);
      throw err;
    }
  }, []);

  const getPoolBoundary = useCallback(async (): Promise<number> => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('[DHCP] Fetching pool boundary...');
      const response = await fetch('/api/dhcp/pool-boundary');
      const data: PoolBoundaryResponse = await response.json();
      
      console.log('[DHCP] Pool boundary response:', {
        success: data.success,
        max_reservations: data.max_reservations,
        error: data.error
      });
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get pool boundary');
      }
      
      const maxReservations = data.max_reservations || 0;
      console.log('[DHCP] Current boundary (max_reservations):', maxReservations);
      
      setIsLoading(false);
      return maxReservations;
    } catch (err) {
      console.error('[DHCP] Error fetching pool boundary:', err);
      handleError(err);
      throw err;
    }
  }, []);

  const updatePoolBoundary = useCallback(async (maxReservations: number): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dhcp/pool-boundary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          max_reservations: maxReservations,
        }),
      });
      
      const data: PoolBoundaryUpdateResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update pool boundary');
      }
      
      setIsLoading(false);
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  return {
    getStatus,
    getLeases,
    getReservations,
    addReservation,
    removeReservation,
    updateReservation,
    getConfig,
    updateConfig,
    checkHealth,
    getStatistics,
    getPoolBoundary,
    updatePoolBoundary,
    isLoading,
    error,
  };
};
