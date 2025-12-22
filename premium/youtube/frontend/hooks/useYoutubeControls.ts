import { useState, useCallback } from 'react';
import {
  YoutubeSubscription,
  YoutubeSettings,
  YoutubeSchedule,
  VideoInfo,
  DownloadResult,
  ChannelDownloadResult,
  SubscriptionsResponse,
  SubscriptionResponse,
  SettingsResponse,
  ScheduleResponse,
  DownloadResponse,
  VideoInfoResponse,
  LogsResponse,
  FetchSubscriptionResponse
} from '../types';

export const useYoutubeControls = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleError = (err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
    setError(errorMessage);
    setIsLoading(false);
    throw err;
  };

  const downloadVideo = useCallback(async (
    url: string,
    audioOnly: boolean = false
  ): Promise<DownloadResult> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          audio_only: audioOnly
        }),
      });
      
      const data: DownloadResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to download video');
      }
      
      setIsLoading(false);
      return data.data || { success: false, error: 'No data returned' };
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const getVideoInfo = useCallback(async (url: string): Promise<VideoInfo> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/youtube/download/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      
      const data: VideoInfoResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get video info');
      }
      
      setIsLoading(false);
      return data.data || { title: 'Unknown', channel: 'Unknown', duration: 0 };
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const getSubscriptions = useCallback(async (): Promise<YoutubeSubscription[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/youtube/subscriptions');
      const data: SubscriptionsResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get subscriptions');
      }
      
      setIsLoading(false);
      return data.subscriptions || [];
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const addSubscription = useCallback(async (
    url: string,
    name?: string,
    audioOnly?: boolean
  ): Promise<YoutubeSubscription> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/youtube/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          name,
          audio_only: audioOnly
        }),
      });
      
      const data: SubscriptionResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to add subscription');
      }
      
      setIsLoading(false);
      return data.subscription || { id: '', url, name: name || '', added_at: '' };
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const removeSubscription = useCallback(async (channelId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/youtube/subscriptions/${encodeURIComponent(channelId)}`, {
        method: 'DELETE',
      });
      
      const data: SubscriptionResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove subscription');
      }
      
      setIsLoading(false);
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const getSettings = useCallback(async (): Promise<YoutubeSettings> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/youtube/settings');
      const data: SettingsResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get settings');
      }
      
      setIsLoading(false);
      return data.settings || { quality: 'best', format: 'bestvideo+bestaudio' };
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const updateSettings = useCallback(async (settings: Partial<YoutubeSettings>): Promise<YoutubeSettings> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/youtube/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      
      const data: SettingsResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update settings');
      }
      
      setIsLoading(false);
      return data.settings || { quality: 'best', format: 'bestvideo+bestaudio' };
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const getSchedule = useCallback(async (): Promise<YoutubeSchedule> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/youtube/schedule');
      const data: ScheduleResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get schedule');
      }
      
      setIsLoading(false);
      return data.schedule || { enabled: false, hour: 2, minute: 0 };
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const updateSchedule = useCallback(async (
    enabled: boolean,
    hour: number,
    minute: number
  ): Promise<YoutubeSchedule> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/youtube/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled,
          hour,
          minute
        }),
      });
      
      const data: ScheduleResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update schedule');
      }
      
      setIsLoading(false);
      return data.schedule || { enabled, hour, minute };
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const getLogs = useCallback(async (): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/youtube/logs');
      const data: LogsResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get logs');
      }
      
      setIsLoading(false);
      return data.logs || '';
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  const fetchSubscription = useCallback(async (channelId: string): Promise<ChannelDownloadResult> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/youtube/subscriptions/${encodeURIComponent(channelId)}/fetch`, {
        method: 'POST',
      });
      
      const data: FetchSubscriptionResponse = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch subscription');
      }
      
      setIsLoading(false);
      return data.data || { success: false, downloaded_count: 0, channel: '', path: '', error: 'No data returned' };
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, []);

  return {
    downloadVideo,
    getVideoInfo,
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
  };
};
