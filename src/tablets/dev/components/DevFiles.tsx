import React, { useState, useEffect } from 'react';
import { useDev } from '../useDev';
import { DevFilesResponse, DevFileData } from '../types';
import { useToast } from '../../../hooks/useToast';
import FinaleWrapup from './FinaleWrapup';
import './DevFiles.css';

interface DevFileCardProps {
  fileName: string;
  fileData: DevFileData;
  onCopy: (content: string) => void;
  isCompact?: boolean;
}

const DevFileCard: React.FC<DevFileCardProps> = ({ fileName, fileData, onCopy, isCompact = false }) => {
  const getFileIcon = (fileName: string) => {
    if (fileName.includes('results')) return 'fas fa-list-alt';
    if (fileName.includes('password')) return 'fas fa-key';
    return 'fas fa-file-alt';
  };

  const getCardStatus = () => {
    if (fileData.error) return 'error';
    return fileData.exists ? 'exists' : 'not-exists';
  };

  return (
    <div className={`dev-file-card ${getCardStatus()} ${isCompact ? 'compact' : ''}`}>
      <div className="dev-file-card-header">
        <div className="dev-file-icon">
          <i className={getFileIcon(fileName)} />
        </div>
        <div>
          <h3 className="dev-file-title">{fileName}</h3>
          <div className="dev-file-path">Path: {fileData.path}</div>
        </div>
      </div>

      <div className="dev-file-content">
        {fileData.exists && fileData.content ? (
          <div className="dev-file-content-text">
            {fileData.content}
          </div>
        ) : (
          <div className="dev-file-not-found">
            <i className="fas fa-file-excel" />
            {fileData.error ? `Error: ${fileData.error}` : 'File does not exist'}
          </div>
        )}
      </div>

      {fileData.exists && fileData.content && (
        <div className="dev-file-actions">
          <button
            className="dev-file-action-btn"
            onClick={() => onCopy(fileData.content!)}
            title="Copy file content to clipboard"
          >
            <i className="fas fa-copy" /> Copy Content
          </button>
        </div>
      )}
    </div>
  );
};

export default function DevFiles() {
  const [filesData, setFilesData] = useState<DevFilesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { getDevFiles } = useDev();
  const { success, error } = useToast();

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const data = await getDevFiles();
      setFilesData(data);
    } catch (err) {
      error('Failed to load development files');
      console.error('Error loading dev files:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleCopyContent = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      success('Content copied to clipboard');
    } catch (err) {
      error('Failed to copy content to clipboard');
    }
  };

  if (isLoading && !filesData) {
    return (
      <div className="dev-files-container">
        <div className="dev-files-loading">
          <i className="fas fa-spinner fa-spin" />
          Loading development files...
        </div>
      </div>
    );
  }

  return (
    <div className="dev-files-container">
      {filesData && (
        <div className="dev-files-grid dev-files-grid-extended">
          <div className="dev-files-left-column">
            <DevFileCard
              fileName="~/results.txt"
              fileData={filesData.files.results}
              onCopy={handleCopyContent}
              isCompact={false}
            />
            <FinaleWrapup />
          </div>
          <div className="dev-files-right-column">
            <DevFileCard
              fileName="~/password.txt"
              fileData={filesData.files.password}
              onCopy={handleCopyContent}
              isCompact={true}
            />
          </div>
        </div>
      )}
    </div>
  );
} 