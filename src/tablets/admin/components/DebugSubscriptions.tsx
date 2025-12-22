import React, { useState, useEffect } from 'react';
import { useSubscription } from '../../../store';
import { SubscriptionType } from '../../../components/WebSocket/types';
import './DebugSubscriptions.css';

/**
 * Debug component for monitoring active WebSocket subscriptions
 * 
 * This component provides a visual representation of all active subscriptions
 * categorized by type and tab. It's useful during development for debugging
 * subscription-related issues.
 * 
 * Usage:
 * 
 * ```tsx
 * // Import in App.tsx or another component
 * import { DebugSubscriptions } from './components/DebugSubscriptions';
 * 
 * // Add to JSX - typically in development mode only
 * {process.env.NODE_ENV !== 'production' && <DebugSubscriptions />}
 * ```
 */
export const DebugSubscriptions: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  const {
    subscriptions,
    getSubscriptionsStats
  } = useSubscription();
  
  // Auto-refresh statistics every 2 seconds
  useEffect(() => {
    if (!isVisible) return;
    
    const timer = setInterval(() => {
      setRefreshCounter(prev => prev + 1);
    }, 2000);
    
    return () => clearInterval(timer);
  }, [isVisible]);
  
  // Get subscription statistics
  const stats = getSubscriptionsStats();
  
  // Get subscription type as string
  const getSubscriptionTypeString = (typeKey: string): string => {
    // Map enum string keys to display names
    switch (typeKey) {
      case 'core':
        return 'Core';
      case 'admin':
        return 'Admin';
      case 'tab':
        return 'Tab';
      default:
        return 'Standard';
    }
  };
  
  // Format timestamp as relative time
  const formatRelativeTime = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };
  
  if (!isVisible) {
    return (
      <div className="subscription-debug-toggle">
        <button onClick={() => setIsVisible(true)}>
          Show Subscriptions ({stats.totalCount})
        </button>
      </div>
    );
  }
  
  // Group subscriptions by tab
  const subscriptionsByTab: Record<string, typeof subscriptions> = {
    'core': [],
    'admin': [],
    'standard': [],
  };
  
  // Add all tab IDs to the subscriptionsByTab object
  subscriptions.forEach(sub => {
    if (sub.tabId && !subscriptionsByTab[sub.tabId]) {
      subscriptionsByTab[sub.tabId] = [];
    }
  });
  
  // Sort subscriptions into groups
  subscriptions.forEach(sub => {
    if (sub.type === SubscriptionType.CORE) {
      subscriptionsByTab.core.push(sub);
    } else if (sub.type === SubscriptionType.ADMIN) {
      subscriptionsByTab.admin.push(sub);
    } else if (sub.type === SubscriptionType.TAB && sub.tabId) {
      subscriptionsByTab[sub.tabId].push(sub);
    } else {
      subscriptionsByTab.standard.push(sub);
    }
  });
  
  return (
    <div className="subscription-debug-panel">
      <div className="subscription-debug-header">
        <h3>WebSocket Subscriptions</h3>
        <div>
          <button onClick={() => setRefreshCounter(prev => prev + 1)}>
            Refresh
          </button>
          <button onClick={() => setIsVisible(false)}>
            Hide
          </button>
        </div>
      </div>
      
      <div className="subscription-stats">
        <div>Total: {stats.totalCount}</div>
        {Object.entries(stats.byType).map(([type, count]) => (
          <div key={type}>
            {getSubscriptionTypeString(type)}
          </div>
        ))}
      </div>
      
      <div className="subscription-tabs">
        {/* Core subscriptions */}
        {subscriptionsByTab.core.length > 0 && (
          <div className="subscription-tab">
            <h4>Core Subscriptions</h4>
            <ul>
              {subscriptionsByTab.core.map(sub => (
                <li key={sub.id}>
                  <div className="subscription-event">{sub.event}</div>
                  <div className="subscription-time">{formatRelativeTime(sub.createdAt)}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Admin subscriptions */}
        {subscriptionsByTab.admin.length > 0 && (
          <div className="subscription-tab">
            <h4>Admin Subscriptions</h4>
            <ul>
              {subscriptionsByTab.admin.map(sub => (
                <li key={sub.id}>
                  <div className="subscription-event">{sub.event}</div>
                  <div className="subscription-time">{formatRelativeTime(sub.createdAt)}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Standard subscriptions */}
        {subscriptionsByTab.standard.length > 0 && (
          <div className="subscription-tab">
            <h4>Standard Subscriptions</h4>
            <ul>
              {subscriptionsByTab.standard.map(sub => (
                <li key={sub.id}>
                  <div className="subscription-event">{sub.event}</div>
                  <div className="subscription-time">{formatRelativeTime(sub.createdAt)}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Tab-specific subscriptions */}
        {Object.entries(subscriptionsByTab)
          .filter(([tabId]) => 
            tabId !== 'core' && tabId !== 'admin' && tabId !== 'standard' && 
            subscriptionsByTab[tabId].length > 0
          )
          .map(([tabId, subs]) => (
            <div className="subscription-tab" key={tabId}>
              <h4>Tab: {tabId}</h4>
              <ul>
                {subs.map(sub => (
                  <li key={sub.id}>
                    <div className="subscription-event">{sub.event}</div>
                    <div className="subscription-time">{formatRelativeTime(sub.createdAt)}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        }
      </div>
    </div>
  );
}; 