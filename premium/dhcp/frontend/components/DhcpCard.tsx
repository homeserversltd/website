import React, { useState, useMemo } from 'react';
import { DhcpLease, DhcpReservation, UnifiedLeaseItem } from '../types';
import { anonymizeMac, anonymizeHostname } from '../utils/anonymize';

interface DhcpCardProps {
  item: UnifiedLeaseItem;
  onPin?: (lease: DhcpLease) => Promise<void>;
  onUpdateIp?: (identifier: string, newIp: string) => Promise<void>;
  onRemove?: (identifier: string) => void;
  className?: string;
  isAnonymized?: boolean;
}

export const DhcpCard: React.FC<DhcpCardProps> = ({ 
  item,
  onPin,
  onUpdateIp,
  onRemove,
  className = '',
  isAnonymized = false
}) => {
  const [isEditingIp, setIsEditingIp] = useState(false);
  const [editedIp, setEditedIp] = useState(item['ip-address']);
  const [isSaving, setIsSaving] = useState(false);
  const [ipError, setIpError] = useState<string | null>(null);

  const isReservation = item.type === 'reservation';
  const isLease = item.type === 'lease';

  // Anonymize display values when enabled
  const displayMac = useMemo(() => {
    return isAnonymized ? anonymizeMac(item['hw-address']) : item['hw-address'];
  }, [item['hw-address'], isAnonymized]);

  const displayHostname = useMemo(() => {
    if (!item.hostname) return undefined;
    return isAnonymized ? anonymizeHostname(item.hostname) : item.hostname;
  }, [item.hostname, isAnonymized]);

  const handlePin = async () => {
    if (onPin && isLease) {
      try {
        await onPin(item);
      } catch (err) {
        console.error('Failed to pin lease:', err);
      }
    }
  };

  const handleStartEdit = () => {
    if (isReservation && onUpdateIp) {
      setIsEditingIp(true);
      setEditedIp(item['ip-address']);
      setIpError(null);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingIp(false);
    setEditedIp(item['ip-address']);
    setIpError(null);
  };

  const validateIp = (ip: string): string | null => {
    // Basic IPv4 validation
    const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    if (!ipRegex.test(ip)) {
      return 'Invalid IP address format';
    }
    
    const parts = ip.split('.').map(Number);
    if (parts.some(p => p < 0 || p > 255)) {
      return 'IP address octets must be 0-255';
    }
    
    // For reservations, validate that IP is in reserved range (192.168.123.2 - 192.168.123.49)
    if (isReservation) {
      const [a, b, c, d] = parts;
      if (a !== 192 || b !== 168 || c !== 123) {
        return 'IP address must be in 192.168.123.x subnet';
      }
      if (d < 2 || d > 49) {
        return 'IP address must be in reserved range (192.168.123.2 - 192.168.123.49)';
      }
    }
    
    return null;
  };

  const handleSaveIp = async () => {
    if (!onUpdateIp || !isReservation) return;
    
    const error = validateIp(editedIp);
    if (error) {
      setIpError(error);
      return;
    }

    if (editedIp === item['ip-address']) {
      setIsEditingIp(false);
      return;
    }

    setIsSaving(true);
    setIpError(null);
    
    try {
      const identifier = item['hw-address'] || item['ip-address'];
      await onUpdateIp(identifier, editedIp);
      setIsEditingIp(false);
    } catch (err) {
      setIpError(err instanceof Error ? err.message : 'Failed to update IP address');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = () => {
    if (onRemove && isReservation) {
      const identifier = item['hw-address'] || item['ip-address'];
      onRemove(identifier);
    }
  };

  const formatExpireTime = (expire: string): string => {
    try {
      const expireTime = parseInt(expire);
      if (expireTime > 0) {
        const date = new Date(expireTime * 1000);
        return date.toLocaleString();
      }
    } catch {
      // Ignore
    }
    return expire;
  };

  return (
    <div className={`dhcp-list-item ${className} ${isReservation ? 'pinned' : 'lease'}`}>
      <div className="dhcp-list-item-content">
        <div className="dhcp-list-item-main">
          <div className="dhcp-list-item-info">
            <div className="dhcp-list-item-mac">
              <span className="info-label">MAC:</span>
              <span className="info-value">{displayMac}</span>
            </div>
            <div className="dhcp-list-item-ip">
              <span className="info-label">IP:</span>
              {isEditingIp && isReservation ? (
                <div className="ip-edit-container">
                  <input
                    type="text"
                    value={editedIp}
                    onChange={(e) => {
                      setEditedIp(e.target.value);
                      setIpError(null);
                    }}
                    className={`ip-edit-input ${ipError ? 'error' : ''}`}
                    disabled={isSaving}
                  />
                  {ipError && <span className="ip-error">{ipError}</span>}
                </div>
              ) : (
                <span className="info-value">{item['ip-address']}</span>
              )}
            </div>
            {displayHostname && (
              <div className="dhcp-list-item-hostname">
                <span className="info-label">Hostname:</span>
                <span className="info-value">{displayHostname}</span>
              </div>
            )}
            {isLease && 'expire' in item && item.expire && (
              <div className="dhcp-list-item-expire">
                <span className="info-label">Expires:</span>
                <span className="info-value">{formatExpireTime(item.expire)}</span>
              </div>
            )}
          </div>
          <div className="dhcp-list-item-badge">
            {isReservation ? (
              <span className="pinned-badge">Pinned</span>
            ) : (
              <span className="lease-badge">Lease</span>
            )}
          </div>
        </div>
        <div className="dhcp-list-item-actions">
          {isLease && onPin && (
            <button
              onClick={handlePin}
              className="pin-button"
              title="Pin this lease as a reservation"
            >
              Pin
            </button>
          )}
          {isReservation && onUpdateIp && (
            <>
              {isEditingIp ? (
                <>
                  <button
                    onClick={handleSaveIp}
                    className="save-button"
                    disabled={isSaving || !!ipError}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="cancel-button"
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStartEdit}
                  className="edit-button"
                  title="Edit IP address"
                >
                  Edit IP
                </button>
              )}
            </>
          )}
          {isReservation && onRemove && !isEditingIp && (
            <button
              onClick={handleRemove}
              className="remove-dhcp-pin"
              title="Remove reservation"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

