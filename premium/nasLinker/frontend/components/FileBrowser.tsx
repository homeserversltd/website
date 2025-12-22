import React, { useState, useEffect, useCallback } from 'react';
import { FileEntry } from '../types';
import { useNasLinkerControls } from '../hooks/useNasLinkerControls';
import { PathBreadcrumb } from './PathBreadcrumb';
import { FileItem } from './FileItem';
import { ActionBar } from './ActionBar';
import { showModal, closeModal } from '../../../components/Popup/PopupManager';
import './FileBrowser.css';

const BASE_PATH = '/mnt/nas';

interface FileBrowserProps {
  initialPath?: string;
  selectedPaths: Set<string>;
  onSelectionChange: (selectedPaths: Set<string>) => void;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({
  initialPath = BASE_PATH,
  selectedPaths,
  onSelectionChange
}) => {
  const {
    browse,
    deleteItem,
    renameItem,
    createDirectory,
    isLoading,
    error,
    clearError
  } = useNasLinkerControls();

  const [currentPath, setCurrentPath] = useState(initialPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    clearError();
    try {
      const result = await browse(path);
      if (result.success) {
        setCurrentPath(result.path);
        setEntries(result.entries);
      } else {
        console.error('Failed to browse directory:', result.error);
      }
    } catch (err) {
      console.error('Error loading directory:', err);
    } finally {
      setLoading(false);
    }
  }, [browse, clearError]);

  useEffect(() => {
    loadDirectory(initialPath);
  }, [initialPath, loadDirectory]);

  const handleNavigate = (path: string) => {
    loadDirectory(path);
  };

  const handleItemSelect = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    onSelectionChange(next);
  };

  const handleItemDoubleClick = (path: string) => {
    loadDirectory(path);
  };

  const handleDelete = async (path: string) => {
    if (!confirm(`Are you sure you want to delete "${path.split('/').pop()}"?`)) {
      return;
    }

    try {
      const result = await deleteItem(path);
      if (result.success) {
        await loadDirectory(currentPath);
        const next = new Set(selectedPaths);
        next.delete(path);
        onSelectionChange(next);
      } else {
        alert(`Failed to delete: ${result.error}`);
      }
    } catch (err) {
      console.error('Error deleting:', err);
      alert('Failed to delete item');
    }
  };

  const handleRename = (path: string) => {
    const currentName = path.split('/').pop() || '';
    
    const handleRenameSubmit = async (newName: string) => {
      if (!newName || newName.trim() === '') {
        return;
      }

      try {
        const result = await renameItem(path, newName.trim());
        if (result.success) {
          await loadDirectory(currentPath);
        } else {
          alert(`Failed to rename: ${result.error}`);
        }
      } catch (err) {
        console.error('Error renaming:', err);
        alert('Failed to rename directory');
      }
    };

    showModal({
      title: 'Rename Directory',
      children: (
        <div className="rename-modal-content">
          <label>
            New name:
            <input
              type="text"
              defaultValue={currentName}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameSubmit((e.target as HTMLInputElement).value);
                  closeModal();
                } else if (e.key === 'Escape') {
                  closeModal();
                }
              }}
            />
          </label>
          <div className="rename-modal-actions">
            <button onClick={() => {
              const input = document.querySelector('.rename-modal-content input') as HTMLInputElement;
              if (input) {
                handleRenameSubmit(input.value);
              }
              closeModal();
            }}>
              OK
            </button>
            <button onClick={() => closeModal()}>Cancel</button>
          </div>
        </div>
      ),
      hideActions: true
    });
  };

  const handleNewDirectory = () => {
    const handleCreateSubmit = async (dirName: string) => {
      if (!dirName || dirName.trim() === '') {
        return;
      }

      try {
        const result = await createDirectory(currentPath, dirName.trim());
        if (result.success) {
          await loadDirectory(currentPath);
        } else {
          alert(`Failed to create directory: ${result.error}`);
        }
      } catch (err) {
        console.error('Error creating directory:', err);
        alert('Failed to create directory');
      }
    };

    showModal({
      title: 'Create New Directory',
      children: (
        <div className="newdir-modal-content">
          <label>
            Directory name:
            <input
              type="text"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateSubmit((e.target as HTMLInputElement).value);
                  closeModal();
                } else if (e.key === 'Escape') {
                  closeModal();
                }
              }}
            />
          </label>
          <div className="newdir-modal-actions">
            <button onClick={() => {
              const input = document.querySelector('.newdir-modal-content input') as HTMLInputElement;
              if (input) {
                handleCreateSubmit(input.value);
              }
              closeModal();
            }}>
              Create
            </button>
            <button onClick={() => closeModal()}>Cancel</button>
          </div>
        </div>
      ),
      hideActions: true
    });
  };

  const handleGoUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    if (parentPath.startsWith(BASE_PATH) || parentPath === BASE_PATH) {
      loadDirectory(parentPath || BASE_PATH);
    }
  };

  const canGoUp = currentPath !== BASE_PATH && currentPath.startsWith(BASE_PATH);

  return (
    <div className="file-browser">
      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
          <button onClick={clearError}>✕</button>
        </div>
      )}

      <PathBreadcrumb
        currentPath={currentPath}
        onNavigate={handleNavigate}
        basePath={BASE_PATH}
      />

      <ActionBar
        currentPath={currentPath}
        basePath={BASE_PATH}
        onNewDirectory={handleNewDirectory}
        onRefresh={() => loadDirectory(currentPath)}
        canGoUp={canGoUp}
        onGoUp={handleGoUp}
      />

      <div className="file-browser-content">
        {loading || isLoading ? (
          <div className="loading-indicator">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="empty-directory">Directory is empty</div>
        ) : (
          <div className="file-grid">
            {entries.map((entry) => (
              <FileItem
                key={entry.path}
                entry={entry}
                isSelected={selectedPaths.has(entry.path)}
                onSelect={handleItemSelect}
                onDoubleClick={handleItemDoubleClick}
                onDelete={handleDelete}
                onRename={entry.is_dir ? handleRename : undefined}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

