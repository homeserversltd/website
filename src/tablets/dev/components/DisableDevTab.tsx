import React, { useState } from 'react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../hooks/useToast';
import { API_ENDPOINTS } from '../../../api/endpoints';
import './DisableDevTab.css';

interface DevDisableResponse {
  status: string;
  message?: string;
}

export default function DisableDevTab() {
  const [isDisabling, setIsDisabling] = useState(false);
  const { post } = useApi();
  const { success, error } = useToast();

  const handleDisableTab = async () => {
    try {
      // Show confirmation dialog
      const confirmed = window.confirm(
        'Are you sure you want to disable the Developer tab? This will hide the tab from the interface and require manual configuration file editing to re-enable.'
      );

      if (!confirmed) return;

      setIsDisabling(true);
      
      const response = await post<DevDisableResponse>(API_ENDPOINTS.dev.disable);
      
      if (response.status === 'success') {
        success('Developer tab disabled successfully. The tab will be hidden after page refresh.');
        // Optionally reload the page after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        error(response.message || 'Failed to disable developer tab');
      }
    } catch (err: any) {
      console.error('Error disabling developer tab:', err);
      error(err.response?.data?.message || 'Failed to disable developer tab');
    } finally {
      setIsDisabling(false);
    }
  };

  return (
    <button
      onClick={handleDisableTab}
      disabled={isDisabling}
      className="dev-action-btn disable"
      title="Disable developer tab permanently"
    >
      {isDisabling ? (
        <>
          <i className="fas fa-spinner fa-spin" />
          Disabling...
        </>
      ) : (
        <>
          <i className="fas fa-power-off" />
          Disable Developer Tab
        </>
      )}
    </button>
  );
} 