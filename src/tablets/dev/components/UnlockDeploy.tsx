import React, { useState } from 'react';
import { useDev } from '../useDev';
import { useToast } from '../../../hooks/useToast';
import './UnlockDeploy.css';

export default function UnlockDeploy() {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const { unlockDeployPartition } = useDev();
  const { success, error, warning } = useToast();

  const handleUnlockDeploy = async () => {
    try {
      setIsUnlocking(true);
      warning('Unlocking deploy partition...');
      const result = await unlockDeployPartition();
      if (result) {
        success('Deploy partition unlocked and mounted successfully at /deploy');
      }
    } catch (err: any) {
      console.error('Error unlocking deploy partition:', err);
      error('Failed to unlock deploy partition');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <button
      onClick={handleUnlockDeploy}
      disabled={isUnlocking}
      className="dev-action-btn unlock"
      title="Unlock and mount the encrypted deploy partition"
    >
      {isUnlocking ? (
        <>
          <i className="fas fa-spinner fa-spin" />
          Unlocking...
        </>
      ) : (
        <>
          <i className="fas fa-unlock-alt" />
          Unlock Deploy
        </>
      )}
    </button>
  );
} 