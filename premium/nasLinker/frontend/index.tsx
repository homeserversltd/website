import React, { useState, useCallback } from 'react';
import { FileBrowser } from './components/FileBrowser';
import { DestinationPanel } from './components/DestinationPanel';
import { StatusBar } from './components/StatusBar';
import { showRenameModal } from './components/RenameModal';
import { useNasLinkerControls } from './hooks/useNasLinkerControls';
import './styles/nasLinker.css';

const NasLinkerTablet: React.FC = () => {
  const { renameItem } = useNasLinkerControls();
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const handleClearSelection = useCallback(() => {
    setSelectedPaths(new Set());
  }, []);

  const handleRename = useCallback(() => {
    if (selectedPaths.size === 0) {
      return;
    }

    const pathsArray = Array.from(selectedPaths);
    showRenameModal(pathsArray, renameItem, () => {
      // Refresh after rename - selection will be cleared by the modal completion
      setSelectedPaths(new Set());
    });
  }, [selectedPaths, renameItem]);

  const handleDeployComplete = useCallback(() => {
    // Clear selection after successful deploy
    setSelectedPaths(new Set());
  }, []);

  return (
    <div className="nas-linker-container">
      <StatusBar
        selectedCount={selectedPaths.size}
        onRename={handleRename}
        onClearSelection={handleClearSelection}
      />
      <div className="nas-linker-panels">
        <div className="nas-linker-panel-left">
          <FileBrowser
            selectedPaths={selectedPaths}
            onSelectionChange={setSelectedPaths}
          />
        </div>
        <div className="nas-linker-panel-right">
          <DestinationPanel
            selectedPaths={selectedPaths}
            onDeployComplete={handleDeployComplete}
          />
        </div>
      </div>
    </div>
  );
};

export default NasLinkerTablet;

