import React, { useState, useEffect } from 'react';
import { showModal, closeModal } from '../../../components/Popup/PopupManager';
import { RenameResponse } from '../types';
import './RenameModal.css';

interface RenameModalProps {
  selectedPaths: string[];
  renameItem: (path: string, newName: string) => Promise<RenameResponse>;
  onComplete: () => void;
}

export const showRenameModal = (
  selectedPaths: string[],
  renameItem: (path: string, newName: string) => Promise<RenameResponse>,
  onComplete: () => void
) => {
  if (selectedPaths.length === 0) {
    return;
  }

  let currentIndex = 0;
  const errors: string[] = [];

  const processNext = async () => {
    if (currentIndex >= selectedPaths.length) {
      closeModal();
      if (errors.length > 0) {
        alert(`Rename completed with ${errors.length} error(s):\n${errors.join('\n')}`);
      }
      onComplete();
      return;
    }

    const currentPath = selectedPaths[currentIndex];
    const currentName = currentPath.split('/').pop() || '';

    const handleSubmit = async (submittedName: string) => {
      if (!submittedName || submittedName.trim() === '') {
        return;
      }

      try {
        const result = await renameItem(currentPath, submittedName.trim());
        if (!result.success) {
          errors.push(`${currentName}: ${result.error || 'Unknown error'}`);
        }
      } catch (err) {
        errors.push(`${currentName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      currentIndex++;
      processNext();
    };

    showModal({
      title: 'Rename Item',
      children: (
        <RenameModalContent
          previousName={currentName}
          onSubmit={handleSubmit}
        />
      ),
      hideActions: true
    });
  };

  processNext();
};

interface RenameModalContentProps {
  previousName: string;
  onSubmit: (newName: string) => void;
}

const RenameModalContent: React.FC<RenameModalContentProps> = ({
  previousName,
  onSubmit
}) => {
  const [newName, setNewName] = useState(previousName);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    if (newName.trim()) {
      onSubmit(newName.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      closeModal();
    }
  };

  return (
    <div className="rename-modal-content">
      <div className="rename-modal-previous">
        {previousName}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={handleKeyDown}
        className="rename-modal-input"
      />
      <button
        onClick={handleSubmit}
        className="rename-modal-submit"
        type="button"
      >
        Submit
      </button>
    </div>
  );
};
