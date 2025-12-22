import React, { useState } from 'react';
import { DownloadResult } from '../types';

interface DownloadFormProps {
  onDownload: (url: string, audioOnly?: boolean) => Promise<DownloadResult>;
  isLoading?: boolean;
}

export const DownloadForm: React.FC<DownloadFormProps> = ({
  onDownload,
  isLoading = false
}) => {
  const [url, setUrl] = useState('');
  const [audioOnly, setAudioOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const modifiers = [
    {
      id: 'audio-only',
      label: 'Audio Only',
      description: 'Download as MP3',
      active: audioOnly,
      toggle: () => setAudioOnly(!audioOnly)
    }
    // Future modifiers can be added here:
    // {
    //   id: 'high-quality',
    //   label: 'High Quality',
    //   description: 'Best available quality',
    //   active: highQuality,
    //   toggle: () => setHighQuality(!highQuality)
    // },
    // {
    //   id: 'subtitles',
    //   label: 'Subtitles',
    //   description: 'Download captions',
    //   active: includeSubtitles,
    //   toggle: () => setIncludeSubtitles(!includeSubtitles)
    // },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setIsDownloading(true);
    try {
      const result = await onDownload(url, audioOnly);
      if (result.success) {
        setSuccess(`Download started: ${result.title || 'Video'}`);
        setUrl('');
        setAudioOnly(false);
      } else {
        setError(result.error || 'Download failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="download-form">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="youtube-url">YouTube URL</label>
          <input
            id="youtube-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={isDownloading || isLoading}
          />
        </div>

        <div className="form-group">
          <div className="modifiers-row">
            {modifiers.map((modifier) => (
              <button
                key={modifier.id}
                type="button"
                className={`modifier-button ${modifier.active ? 'active' : ''}`}
                onClick={modifier.toggle}
                disabled={isDownloading || isLoading}
                title={modifier.description}
              >
                <span className="modifier-label">{modifier.label}</span>
                {modifier.description && (
                  <span className="modifier-description">{modifier.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <button
          type="submit"
          disabled={isDownloading || isLoading || !url.trim()}
          className="download-button"
        >
          {isDownloading ? 'Downloading...' : 'Download'}
        </button>
      </form>
    </div>
  );
};

