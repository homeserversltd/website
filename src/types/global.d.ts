// Global type definitions for the application

// Theme Types
export type ThemeName = string & { __brand: 'ThemeName' };  // Branded type for type safety while allowing dynamic values

export interface Theme {
  background: string;
  text: string;
  primary: string;
  secondary: string;
  accent: string;
  error: string;
  success: string;
  warning: string;
  border: string;
  primaryHover: string;
  statusUp: string;
  statusDown: string;
  statusPartial: string;
  statusUnknown: string;
  hiddenTabBackground: string;
  hiddenTabText: string;
}

// Admin Mode Types
export interface AdminState {
  isAdmin: boolean;
  lastActivity: number;
  sessionTimeout: number;
}

// Visibility Types
export interface ElementVisibility {
  tab: boolean;
  elements: Record<string, boolean>;
}

export interface TabVisibility {
  [tabId: string]: ElementVisibility;
}

// Tab Types
export interface TabConfig {
  id: string;
  displayName: string;
  adminOnly: boolean;
  order: number;
  isEnabled: boolean;
}

export interface TabData {
  config: TabConfig;
  visibility: ElementVisibility;
  data?: Record<string, any>;
}

export interface TabsState {
  [tabId: string]: TabData;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Status Indicator Types
export type StatusState = 'up' | 'down' | 'partial' | 'unknown';

export interface ServiceStatus {
  jellyfin: StatusState;
  transmission: StatusState;
  piwigo: StatusState;
  mkdocs: StatusState;
  vaultwarden: StatusState;
  gogs: StatusState;
  navidrome: StatusState;
  filebrowser: StatusState;
  calibreweb: StatusState;
  yarr: StatusState;
  freshrss: StatusState;
  ttyd: StatusState;
  [key: string]: StatusState;  // Index signature
}

export interface ApiTabResponse {
  [tabId: string]: {
    config: TabConfig;
    visibility: ElementVisibility;
    data?: Record<string, any>;
  };
}

// Tab Component Props
export interface TabProps {
  tabId: string;
  tab: TabData;
  isActive: boolean;
  isStarred: boolean;
  isVisible: boolean;
  isAdmin?: boolean; // Whether the current user is in admin mode
  onTabClick: (tabId: string) => void;
  onStarClick: (e: React.MouseEvent, tabId: string) => void;
  onVisibilityToggle: (e: React.MouseEvent, tabId: string, visible: boolean) => void;
}

declare global {
  interface StoreState {
    tabs: TabsState;
    starredTab: string;
    initializeTabs: (config: { tabs: TabsState; starredTab: string }) => void;
    isAdmin: boolean;
    enterAdminMode: (pin: string) => Promise<boolean>;
    exitAdminMode: () => void;
    // Theme state
    theme: ThemeName;
    themeData: Theme;
    availableThemes: Record<ThemeName, Theme>;
    isLoadingThemes: boolean;
    setTheme: (theme: ThemeName) => void;
    toggleTheme: () => void;
    loadThemes: () => Promise<void>;
    // Session state
    lastActivity: number;
    sessionTimeout: number;
    updateLastActivity: () => void;
    checkSessionTimeout: () => boolean;
  }
}