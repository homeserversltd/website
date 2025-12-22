import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faInfoCircle, faExclamationTriangle, faShieldAlt } from '@fortawesome/free-solid-svg-icons';
import './KeyManagementInfoModal.css'; // We'll create this CSS file next

interface KeyManagementInfoModalProps {
  onClose: () => void;
}

export const KeyManagementInfoModal: React.FC<KeyManagementInfoModalProps> = ({ onClose }) => {
  return (
    <div className="key-management-info-modal">
      <div className="modal-content">
        <section>
          <h4><FontAwesomeIcon icon={faShieldAlt} /> It is Strongly Recommended to use the defaults:</h4>
          <p>
            Creating a new key with the default settings will replace the onboard service suite key, 
            and set both the vault and nas keys to use the password you provide. Providing you access 
            to your home server via the password that came with the device, and the password you have set.
          </p>
        </section>

        <section>
          <h4><FontAwesomeIcon icon={faInfoCircle} /> Understanding Key Operations:</h4>
          <p><strong>Create New Key:</strong></p>
          <p>
            This is used to generate and implement a new primary encryption key for 
            the vault and/or NAS drives. This sets the sole <code>service_suite.key</code> and <code>nas.key</code> files 
            stored in your vault. These are set the same unless specified otherwise by performing other than the default settings. You can add new keys, replace all keys with your new password alone, 
            or add inplace a single slot your prefered password; this is the recommended path. 
          </p>
          <p><strong>Update Key on Drive:</strong></p>
          <p>
            While the &quot;Create New Key&quot; operation (especially with default settings) aims to update the vault and all currently managed/attached NAS drives with the new Service Suite Key, this &quot;Update Key on Drive&quot; function is primarily for:
          </p>
          <p>
            Applying the current <code>nas.key</code> (from the vault) to encrypted drives that were not attached, unlocked, or managed by the system during the initial &quot;Create New Key&quot; process.
          </p>
          <p>
            Synchronizing newly introduced encrypted drives with your system&apos;s existing NAS key.
          </p>
          <p>
            If &quot;Create New Key&quot; (using defaults) has just successfully updated all relevant drives, this step might not be immediately necessary for those drives. However, it remains essential for managing keys on drives added or reconnected later. This function uses the <code>nas.key</code> file stored in your vault to add/update the decryption key on the selected drive, ensuring consistent access.
          </p>
        </section>

        <section className="warning-section">
          <h4><FontAwesomeIcon icon={faExclamationTriangle} /> Critical Warning:</h4>
          <p>
            If you change the vault&apos;s password or a primary NAS encryption passphrase 
            without correctly updating the key slots on all associated drives, those drives 
            may become inaccessible. This could lead to data loss or require complex manual 
            recovery procedures. Always verify changes and ensure drive keys are updated. 
            Home server can only unlock your drive if the keys it has stored work on your drive. 
            If you change the keys, you must update the keys on your drive.
          </p>
        </section>
      </div>
    </div>
  );
}; 