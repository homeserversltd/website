import React, { useState, useEffect, useRef } from 'react';
import { YoutubeSettings } from '../types';

interface DownloadSettingsProps {
  settings: YoutubeSettings;
  onUpdate: (settings: Partial<YoutubeSettings>) => Promise<void>;
  isLoading?: boolean;
}

// Mapping of quality presets to their format strings
const QUALITY_FORMAT_MAP: Record<string, string> = {
  'best': 'best',
  'bestvideo+bestaudio': 'bestvideo+bestaudio',
  'worst': 'worst',
  'bestvideo': 'bestvideo',
  'bestaudio': 'bestaudio',
  'custom': '' // Will be set by user input
};

// Reverse lookup: find quality preset from format string
const getQualityFromFormat = (format: string): string => {
  for (const [quality, formatStr] of Object.entries(QUALITY_FORMAT_MAP)) {
    if (format === formatStr) {
      return quality;
    }
  }
  return 'custom';
};

export const DownloadSettings: React.FC<DownloadSettingsProps> = ({
  settings,
  onUpdate,
  isLoading = false
}) => {
  const [quality, setQuality] = useState(settings.quality);
  const [format, setFormat] = useState(settings.format);
  const [autoHardlink, setAutoHardlink] = useState(settings.auto_hardlink ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const formatManuallyEdited = useRef(false);

  useEffect(() => {
    const matchingQuality = getQualityFromFormat(settings.format);
    setQuality(matchingQuality);
    setFormat(settings.format);
    setAutoHardlink(settings.auto_hardlink ?? false);
    formatManuallyEdited.current = (matchingQuality === 'custom');
  }, [settings]);

  // When quality changes, update format field (unless it was manually edited)
  const handleQualityChange = (newQuality: string) => {
    setQuality(newQuality);
    if (!formatManuallyEdited.current && newQuality !== 'custom') {
      setFormat(QUALITY_FORMAT_MAP[newQuality] || newQuality);
    }
  };

  // When format changes manually, check if it matches a preset or mark as custom
  const handleFormatChange = (newFormat: string) => {
    setFormat(newFormat);
    formatManuallyEdited.current = true;
    
    // Check if the new format matches a preset
    const matchingQuality = getQualityFromFormat(newFormat);
    if (matchingQuality !== 'custom') {
      setQuality(matchingQuality);
      formatManuallyEdited.current = false;
    } else {
      setQuality('custom');
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    setIsSaving(true);
    try {
      await onUpdate({ quality, format, auto_hardlink: autoHardlink });
      setSuccess('Settings updated successfully');
      formatManuallyEdited.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="download-settings">
      <div className="settings-form">
        <div className="form-group">
          <label htmlFor="default-quality">Default Quality</label>
          <select
            id="default-quality"
            value={quality}
            onChange={(e) => handleQualityChange(e.target.value)}
            disabled={isSaving || isLoading}
          >
            <option value="best">Best Available</option>
            <option value="bestvideo+bestaudio">Best Video + Audio</option>
            <option value="worst">Worst Available</option>
            <option value="bestvideo">Best Video Only</option>
            <option value="bestaudio">Best Audio Only</option>
            <option value="custom">Custom Format</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="default-format">Default Format</label>
          <input
            id="default-format"
            type="text"
            value={format}
            onChange={(e) => handleFormatChange(e.target.value)}
            placeholder="bestvideo+bestaudio"
            disabled={isSaving || isLoading}
          />
          <small>
            {quality === 'custom' 
              ? 'Custom format string (e.g., "bestvideo[height<=1080]+bestaudio")'
              : 'Format string used for subscription downloads. Edit to use custom format.'}
          </small>
        </div>

        <div className="form-group">
          <label htmlFor="auto-hardlink" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              id="auto-hardlink"
              type="checkbox"
              checked={autoHardlink}
              onChange={(e) => setAutoHardlink(e.target.checked)}
              disabled={isSaving || isLoading}
            />
            <span>Auto-hardlink to /mnt/nas/media/YouTube</span>
          </label>
          <small>
            Automatically create hardlinks in /mnt/nas/media/YouTube after downloads complete
          </small>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <button
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="save-button"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

