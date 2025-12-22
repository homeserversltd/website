// YouTube Premium Tab TypeScript Type Definitions

export interface YoutubeSubscription {
  id: string;
  url: string;
  name: string;
  audio_only?: boolean;
  added_at: string;
}

export interface YoutubeSettings {
  quality: string;
  format: string;
  auto_hardlink?: boolean;
  updated_at?: string;
}

export interface YoutubeSchedule {
  enabled: boolean;
  hour: number;
  minute: number;
}

export interface VideoInfo {
  title: string;
  channel: string;
  duration: number;
  view_count?: number;
  upload_date?: string;
  description?: string;
}

export interface DownloadResult {
  success: boolean;
  title?: string;
  channel?: string;
  duration?: number;
  filesize?: number;
  path?: string;
  error?: string;
}

export interface ChannelDownloadResult {
  success: boolean;
  downloaded_count: number;
  channel: string;
  path: string;
  error?: string;
}

export interface SubscriptionsResponse {
  success: boolean;
  subscriptions?: YoutubeSubscription[];
  error?: string;
}

export interface SubscriptionResponse {
  success: boolean;
  message?: string;
  subscription?: YoutubeSubscription;
  error?: string;
}

export interface SettingsResponse {
  success: boolean;
  settings?: YoutubeSettings;
  error?: string;
}

export interface ScheduleResponse {
  success: boolean;
  schedule?: YoutubeSchedule;
  error?: string;
}

export interface DownloadResponse {
  success: boolean;
  message?: string;
  data?: DownloadResult;
  error?: string;
}

export interface VideoInfoResponse {
  success: boolean;
  data?: VideoInfo;
  error?: string;
}

export interface LogsResponse {
  success: boolean;
  logs?: string;
  error?: string;
}

export interface FetchSubscriptionResponse {
  success: boolean;
  message?: string;
  data?: ChannelDownloadResult;
  error?: string;
}
