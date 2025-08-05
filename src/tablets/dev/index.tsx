import React from 'react';
import { useVisibility } from '../../hooks/useVisibility';
import { useStore } from '../../store';
import { useToast } from '../../hooks/useToast';
import DisableDevTab from './components/DisableDevTab';
import DevFiles from './components/DevFiles';
import CompletionGuide from './components/CompletionGuide';
import HardDriveTest from './components/HardDriveTest';
import ThermalTest from './components/ThermalTest';
import ThermalFailureWarning from './components/ThermalFailureWarning';
import WipeDeployPartition from './components/WipeDeployPartition';
import UnlockDeploy from './components/UnlockDeploy';
import './DevTab.css';

export default function DevTab() {
  const { checkTabVisibility } = useVisibility();
  const { clearApiCache, setStarredTab } = useStore();
  const { success } = useToast();
  
  if (!checkTabVisibility('dev')) {
    return null;
  }

  const handleRefresh = async () => {
    try {
      // Star the developer tab before refreshing
      await setStarredTab('dev');
      
      // Clear dev-related API caches
      clearApiCache('dev');
      
      // Force a page refresh for complete reset
      window.location.reload();
      
      success('Dev tab refreshed');
    } catch (error) {
      console.error('Error starring dev tab before refresh:', error);
      
      // Still proceed with refresh even if starring fails
      clearApiCache('dev');
      window.location.reload();
      success('Dev tab refreshed');
    }
  };
  
  return (
    <div className="dev-tab">
      {/* Top Action Banner */}
      <div className="dev-action-banner">
        <div className="dev-action-buttons">
          <button
            onClick={handleRefresh}
            className="dev-action-btn refresh"
            title="Refresh dev tab content"
          >
            <i className="fas fa-sync-alt" />
            Refresh
          </button>
          <UnlockDeploy />
          <WipeDeployPartition />
          <DisableDevTab />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dev-content">
        <div className="dev-test-grid">
          <HardDriveTest />
          <ThermalTest />
        </div>
        <ThermalFailureWarning />
        <DevFiles />
        <CompletionGuide />
      </div>
    </div>
  );
} 