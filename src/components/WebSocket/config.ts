/**
 * WebSocket Event Configuration
 * Single source of truth for all WebSocket event types and their categorization
 * The categorization here dictates how AdminModeManager handles subscriptions
 * during admin mode transitions.
 */

import { WebSocketEventMap } from './types';

/**
 * CORE_EVENTS
 * Defines events considered essential for basic application functionality.
 * - These are typically subscribed to early in the application lifecycle (e.g., by startup.ts).
 * - Some of these events MAY be "admin-enhanced"
 *   if they are NOT listed in EVENTS_WITHOUT_ADMIN_FIELDS these are admin-mode-enhanced
 *   will handle switching between standard and admin-enhanced versions of the subscription.
 */
export const CORE_EVENTS: Array<keyof WebSocketEventMap> = [
  'internet_status',
  'tailscale_status',
  'vpn_status',
  'services_status',
  'power_status'
];

/**
 * ADMIN_EVENTS
 * These events are only available in admin mode.
 * upon entering admin mode, the adminModeManager will subscribe to these events.
 * upon exiting admin mode, the adminModeManager will unsubscribe from these events, clearing the admin data.
 * admin tab presently uses these global events since they're so data heavy, rather than tab specific events.
 */
export const ADMIN_EVENTS: Array<keyof WebSocketEventMap> = [
  'admin_disk_info',
  'hard_drive_test',
  'hard_drive_test_status',
  'sync_status'
];

/**
 * EVENTS_WITHOUT_ADMIN_FIELDS
 * This list specifies either CORE_EVENTS or TAB_EVENTS that should definitively NOT be treated as admin-enhanced,
 * - If a CORE_EVENT is intended to be admin-enhanced, it should NOT be in this list.
 * - If a TAB_EVENT is intended to be admin-enhanced, it should NOT be in this list.
 */
export const EVENTS_WITHOUT_ADMIN_FIELDS: Array<keyof WebSocketEventMap> = [
  'power_status',
];

/**
 * Maps tab IDs to their required event subscriptions
 * For tab-specific events, we need to use string type to allow for custom events
 * that might not be in the WebSocketEventMap yet
 */
export const TAB_EVENT_MAP: Record<string, Array<string>> = {
  'stats': ['system_stats'],
  'upload': [],
  'portals': []
};

/*
 * Utility function to check if an event is a core event
 */
export const isValidCoreEvent = (event: string): boolean => {
  return CORE_EVENTS.includes(event as keyof WebSocketEventMap);
};

/**
 * Utility function to check if an event is an admin event
 */
export const isAdminEvent = (event: string): boolean => {
  return ADMIN_EVENTS.includes(event as keyof WebSocketEventMap);
};

/**
 * Utility function to get all events required for a specific tab
 */
export const getTabEvents = (tabId: string): Array<string> => {
  return TAB_EVENT_MAP[tabId] || [];
}; 