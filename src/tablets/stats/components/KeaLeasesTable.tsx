import React, { useEffect, useState, useCallback } from 'react';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { showModal } from '../../../components/Popup/PopupManager';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPencil } from '@fortawesome/free-solid-svg-icons';
import { useStore } from '../../../store';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { useApi } from '../../../hooks/useApi';

interface Lease {
  hostname: string;
  ip: string;
  mac: string;
}

interface NetworkNotes {
  [mac: string]: string;
}

export const KeaLeasesTable: React.FC = () => {
  const [leases, setLeases] = useState<Lease[]>([]);
  const [notes, setNotes] = useState<NetworkNotes>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = useStore(state => state.isAdmin);
  const api = useApi();

  const fetchLeases = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<{ leases: Lease[] }>(API_ENDPOINTS.system.keaLeases);
      setLeases(data.leases || []);
    } catch (err: any) {
      setError('Failed to load Kea leases. Check server logs for details.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const fetchNotes = useCallback(async () => {
    try {
      // No loading/error state management here, as it's a secondary call
      const data = await api.get<NetworkNotes>(API_ENDPOINTS.network.notes);
      setNotes(data || {});
    } catch (err: any) {
      console.error('Failed to load network notes:', err);
      // Optionally set a different error state if notes loading failure is critical
    }
  }, [api]);

  useEffect(() => {
    fetchLeases();
    fetchNotes();
  }, [fetchLeases, fetchNotes]);

  const handleEditNote = async (mac: string, currentNote = '') => {
    console.debug('[KeaLeases] Opening edit note modal:', { mac, currentNote });
    
    const modalId = showModal({
      title: `Edit Note for ${mac}`,
      children: (
        <div 
          className="edit-note-modal"
          onClick={e => e.stopPropagation()} // Prevent clicks from bubbling
        >
          <textarea
            id="note-input"
            name="note-input"
            defaultValue={currentNote}
            placeholder="Enter device note..."
            rows={3}
            className="note-textarea"
            onClick={e => e.stopPropagation()}
            style={{ 
              minHeight: '100px',
              maxWidth: '100%',
              boxSizing: 'border-box'
            }}
            autoFocus
          />
        </div>
      ),
      onConfirm: async () => {
        console.debug('[KeaLeases] Modal confirm clicked');
        const noteInput = document.getElementById('note-input') as HTMLTextAreaElement;
        const newNote = noteInput?.value || '';
        
        try {
          console.debug('[KeaLeases] Saving note:', { mac, newNote });
          await api.put(API_ENDPOINTS.network.notes, { mac, note: newNote });
          
          setNotes(prev => ({
            ...prev,
            [mac]: newNote
          }));
          
          console.debug('[KeaLeases] Note saved successfully');
          return true;
        } catch (err) {
          console.error('[KeaLeases] Error saving note:', err);
          // Potentially show a toast notification for save failure
          return false;
        }
      }
    });
    
    console.debug('[KeaLeases] Modal opened with ID:', modalId);
  };

  if (loading) {
    return (
      <div className="kea-leases-loading">
        <LoadingSpinner size="medium" />
        <p>Loading Kea leases...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="kea-leases-error">
        <p>{error}</p>
        <button onClick={fetchLeases}>Retry</button>
      </div>
    );
  }

  if (!leases.length && !loading) {
    return <div>No Kea leases found.</div>;
  }

  return (
    <div className="kea-leases-table">
      <table>
        <thead>
          <tr>
            <th>Device Note</th>
            <th>Hostname</th>
            <th>IP Address</th>
            <th>MAC Address</th>
          </tr>
        </thead>
        <tbody>
          {leases.map((lease, index) => (
            <tr key={index}>
              <td className="device-note-cell" data-label="Note:">
                <span className="note-text">{notes[lease.mac] || ''}</span>
                {isAdmin && (
                  <button
                    className="edit-note-button"
                    onClick={() => handleEditNote(lease.mac, notes[lease.mac])}
                    title="Edit device note"
                  >
                    <FontAwesomeIcon icon={faPencil} />
                  </button>
                )}
              </td>
              <td data-label="Hostname:">{lease.hostname || 'N/A'}</td>
              <td data-label="IP:">{lease.ip}</td>
              <td data-label="MAC:" title={lease.mac}>{lease.mac}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}; 