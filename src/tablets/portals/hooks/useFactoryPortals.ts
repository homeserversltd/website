import { useState, useEffect } from 'react';
import { api } from '../../../api/client';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { createComponentLogger } from '../../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('useFactoryPortals');

interface UseFactoryPortalsResult {
  factoryPortals: string[];
  isCustomPortal: (portalName: string) => boolean;
  isLoading: boolean;
  error: string | null;
  refreshFactoryPortals: () => Promise<void>;
}

/**
 * Hook to manage factory portal comparison and identify custom portals
 */
export const useFactoryPortals = (): UseFactoryPortalsResult => {
  const [factoryPortals, setFactoryPortals] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFactoryPortals = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await api.get<{ success: boolean; factoryPortals: string[] }>(
        API_ENDPOINTS.portals.factory
      );
      
      if (response.success) {
        setFactoryPortals(response.factoryPortals);
      } else {
        setError('Failed to load factory portals');
      }
    } catch (err) {
      logger.error('Error fetching factory portals:', err);
      setError('Failed to load factory portals');
      // Set empty array as fallback - this will be interpreted as "assume native",
      // so no portals show a delete button until we can confirm they are custom.
      setFactoryPortals([]);
    } finally {
      setIsLoading(false);
    }
  };

  const isCustomPortal = (portalName: string): boolean => {
    // If we don't have any factory list loaded, assume native (not custom)
    if (!portalName || factoryPortals.length === 0) {
      return false;
    }
    return !factoryPortals.includes(portalName);
  };

  const refreshFactoryPortals = async () => {
    await fetchFactoryPortals();
  };

  useEffect(() => {
    fetchFactoryPortals();
  }, []);

  return {
    factoryPortals,
    isCustomPortal,
    isLoading,
    error,
    refreshFactoryPortals,
  };
}; 