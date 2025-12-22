import React, { useState, useEffect } from 'react';
import { YoutubeSubscription } from '../types';

interface SubscriptionListProps {
  subscriptions: YoutubeSubscription[];
  onAdd: (url: string, name?: string, audioOnly?: boolean) => Promise<void>;
  onRemove: (channelId: string) => Promise<void>;
  onFetch: (channelId: string) => Promise<void>;
  isLoading?: boolean;
}

export const SubscriptionList: React.FC<SubscriptionListProps> = ({
  subscriptions,
  onAdd,
  onRemove,
  onFetch,
  isLoading = false
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [audioOnly, setAudioOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newUrl.trim()) {
      setError('Please enter a channel URL');
      return;
    }

    setIsAdding(true);
    try {
      await onAdd(newUrl, newName || undefined, audioOnly);
      setNewUrl('');
      setNewName('');
      setAudioOnly(false);
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add subscription');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (channelId: string) => {
    if (!confirm('Are you sure you want to remove this subscription?')) {
      return;
    }

    try {
      await onRemove(channelId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove subscription');
    }
  };

  const handleFetch = async (channelId: string) => {
    if (fetchingIds.has(channelId)) {
      return; // Already fetching
    }

    setFetchingIds(prev => new Set(prev).add(channelId));
    try {
      await onFetch(channelId);
    } catch (err) {
      // Error already handled in parent component
    } finally {
      setFetchingIds(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  };

  return (
    <div className="subscription-list">
      <div className="subscription-header">
        <h3>Channel Subscriptions</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={isLoading}
          className="add-button"
        >
          {showAddForm ? 'Cancel' : 'Add Subscription'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="add-subscription-form">
          <div className="form-group">
            <label htmlFor="channel-url">Channel URL</label>
            <input
              id="channel-url"
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://www.youtube.com/channel/..."
              disabled={isAdding || isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="channel-name">Channel Name (Optional)</label>
            <input
              id="channel-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Leave empty to auto-detect"
              disabled={isAdding || isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="audio-only">
              <input
                id="audio-only"
                type="checkbox"
                checked={audioOnly}
                onChange={(e) => setAudioOnly(e.target.checked)}
                disabled={isAdding || isLoading}
              />
              <span>Audio only (download as MP3)</span>
            </label>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            disabled={isAdding || isLoading || !newUrl.trim()}
            className="submit-button"
          >
            {isAdding ? 'Adding...' : 'Add Subscription'}
          </button>
        </form>
      )}

      {subscriptions.length === 0 ? (
        <div className="no-subscriptions">
          <p>No subscriptions yet. Add a channel to automatically download new videos.</p>
        </div>
      ) : (
        <div className="subscriptions-grid">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="subscription-card">
              <div className="subscription-info">
                <h4>{sub.name}</h4>
                <p className="subscription-url">{sub.url}</p>
                {sub.audio_only && (
                  <p className="subscription-audio-only">Audio only (MP3)</p>
                )}
                <p className="subscription-date">Added: {new Date(sub.added_at).toLocaleDateString()}</p>
              </div>
              <div className="subscription-actions">
                <button
                  onClick={() => handleFetch(sub.id)}
                  disabled={isLoading || fetchingIds.has(sub.id)}
                  className="fetch-button"
                >
                  {fetchingIds.has(sub.id) ? 'Fetching...' : 'Fetch Now'}
                </button>
                <button
                  onClick={() => handleRemove(sub.id)}
                  disabled={isLoading}
                  className="remove-button"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

