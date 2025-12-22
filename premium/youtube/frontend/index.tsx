import React, { useState, useEffect } from 'react';
import './PortalCard.css';
import { YoutubeSubscription, YoutubeSettings, YoutubeSchedule } from './types';
import { DownloadForm } from './components/DownloadForm';
import { SubscriptionList } from './components/SubscriptionList';
import { ScheduleConfig } from './components/ScheduleConfig';
import { DownloadSettings } from './components/DownloadSettings';
import { LogsView } from './components/LogsView';
import { useYoutubeControls } from './hooks/useYoutubeControls';

type TabType = 'download' | 'config' | 'subscriptions' | 'logs';

const YoutubeTablet: React.FC = () => {
  const {
    downloadVideo,
    getSubscriptions,
    addSubscription,
    removeSubscription,
    fetchSubscription,
    getSettings,
    updateSettings,
    getSchedule,
    updateSchedule,
    getLogs,
    isLoading,
    error
  } = useYoutubeControls();

  const [activeTab, setActiveTab] = useState<TabType>('download');
  const [subscriptions, setSubscriptions] = useState<YoutubeSubscription[]>([]);
  const [settings, setSettings] = useState<YoutubeSettings>({ quality: 'best', format: 'bestvideo+bestaudio', auto_hardlink: false });
  const [schedule, setSchedule] = useState<YoutubeSchedule>({ enabled: false, hour: 2, minute: 0 });

  useEffect(() => {
    if (activeTab === 'subscriptions') {
      loadSubscriptions();
    } else if (activeTab === 'config') {
      loadConfig();
    }
  }, [activeTab]);

  const loadSubscriptions = async () => {
    try {
      const subscriptionsData = await getSubscriptions();
      setSubscriptions(subscriptionsData);
    } catch (err) {
      console.error('[YouTube] Failed to load subscriptions:', err);
    }
  };

  const loadConfig = async () => {
    try {
      const [settingsData, scheduleData] = await Promise.all([
        getSettings().catch(() => ({ quality: 'best', format: 'bestvideo+bestaudio', auto_hardlink: false })),
        getSchedule().catch(() => ({ enabled: false, hour: 2, minute: 0 }))
      ]);
      setSettings(settingsData);
      setSchedule(scheduleData);
    } catch (err) {
      console.error('[YouTube] Failed to load config:', err);
    }
  };

  const handleDownload = async (url: string, audioOnly?: boolean) => {
    const result = await downloadVideo(url, audioOnly);
    return result;
  };

  const handleAddSubscription = async (url: string, name?: string, audioOnly?: boolean) => {
    await addSubscription(url, name, audioOnly);
    await loadSubscriptions();
  };

  const handleRemoveSubscription = async (channelId: string) => {
    await removeSubscription(channelId);
    await loadSubscriptions();
  };

  const handleFetchSubscription = async (channelId: string) => {
    try {
      const result = await fetchSubscription(channelId);
      if (result.success) {
        alert(`Download started! ${result.downloaded_count} video(s) will be downloaded.`);
      } else {
        alert(`Failed to start download: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to fetch subscription');
    }
  };

  const handleUpdateSettings = async (newSettings: Partial<YoutubeSettings>) => {
    const updated = await updateSettings(newSettings);
    setSettings(updated);
  };

  const handleUpdateSchedule = async (enabled: boolean, hour: number, minute: number) => {
    const updated = await updateSchedule(enabled, hour, minute);
    setSchedule(updated);
  };

  return (
    <div className="youtube-tablet">
      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <div className="youtube-tabs">
        <button
          className={`tab-button ${activeTab === 'download' ? 'active' : ''}`}
          onClick={() => setActiveTab('download')}
          disabled={isLoading}
        >
          Download
        </button>
        <button
          className={`tab-button ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
          disabled={isLoading}
        >
          Config
        </button>
        <button
          className={`tab-button ${activeTab === 'subscriptions' ? 'active' : ''}`}
          onClick={() => setActiveTab('subscriptions')}
          disabled={isLoading}
        >
          Subscriptions
        </button>
        <button
          className={`tab-button ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
          disabled={isLoading}
        >
          Logs
        </button>
      </div>

      <div className="youtube-content">
        {activeTab === 'download' && (
          <div className="youtube-section">
            <DownloadForm
              onDownload={handleDownload}
              isLoading={isLoading}
            />
          </div>
        )}

        {activeTab === 'config' && (
          <div className="youtube-sections">
            <div className="youtube-section">
              <DownloadSettings
                settings={settings}
                onUpdate={handleUpdateSettings}
                isLoading={isLoading}
              />
            </div>
            <div className="youtube-section">
              <ScheduleConfig
                schedule={schedule}
                onUpdate={handleUpdateSchedule}
                isLoading={isLoading}
              />
            </div>
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <div className="youtube-section">
            <SubscriptionList
              subscriptions={subscriptions}
              onAdd={handleAddSubscription}
              onRemove={handleRemoveSubscription}
              onFetch={handleFetchSubscription}
              isLoading={isLoading}
            />
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="youtube-section">
            <LogsView
              onGetLogs={getLogs}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default YoutubeTablet;
