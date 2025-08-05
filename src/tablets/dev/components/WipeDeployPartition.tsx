import React, { useState } from 'react';
import { useDev } from '../useDev';
import { useToast } from '../../../hooks/useToast';
import './WipeDeployPartition.css';

export default function WipeDeployPartition() {
  const [isWiping, setIsWiping] = useState(false);
  const { wipeDeployPartition } = useDev();
  const { success, error, warning } = useToast();

  const handleWipePartition = async () => {
    try {
      setIsWiping(true);
      warning('Deploy partition wipe initiated - this may take several minutes...');
      
      const result = await wipeDeployPartition();
      
      if (result) {
        success('Deploy partition has been cryptographically destroyed. All encrypted data is now unrecoverable.');
      }
    } catch (err: any) {
      console.error('Error wiping deploy partition:', err);
      error('Failed to wipe deploy partition');
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <button
      onClick={handleWipePartition}
      disabled={isWiping}
      className="dev-action-btn wipe"
      title="Cryptographically destroy deploy partition"
    >
      {isWiping ? (
        <>
          <i className="fas fa-spinner fa-spin" />
          Wiping...
        </>
      ) : (
        <>
          <i className="fas fa-trash-alt" />
          Wipe Deploy Partition
        </>
      )}
    </button>
  );
} 