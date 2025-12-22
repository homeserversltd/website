import React from 'react';
import { useStore } from '../../store';
import { StatusIndicators } from '../StatusIndicators';
import { showModal } from '../Popup/PopupManager';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useLoading } from '../../hooks/useLoading';
import { useTheme } from '../../hooks/useTheme';
import { useResponsiveTooltip } from '../../hooks/useTooltip';
import './Header.css';
import { API_ENDPOINTS } from '../../api/endpoints';
import { useApi } from '../../hooks/useApi';
import { debug, createComponentLogger } from '../../utils/debug';

export const Header: React.FC = () => {
  // Initialize component logger for Header
  const logger = createComponentLogger('Header');
  
  const { isAdmin, login, logout, wsStatus } = useAuth();
  const toast = useToast();
  const { currentTheme: theme, cycleTheme: toggleTheme } = useTheme();
  const { isLoading, withLoading } = useLoading();
  const api = useApi();

  const isFallbackActive = useStore(state => state.isFallbackActive);

  const [uptime, setUptime] = React.useState<string>('');
  const [isOnline, setIsOnline] = React.useState<boolean>(navigator.onLine);
  const [baseUptime, setBaseUptime] = React.useState<number | null>(null);
  const [startTime, setStartTime] = React.useState<number | null>(null);
  const [isInitializing, setIsInitializing] = React.useState<boolean>(true);

  const formatUptime = (totalSeconds: number): string => {
    if (totalSeconds < 0) return '';

    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  };

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setBaseUptime(null);
      setStartTime(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch initial uptime and maintain local timer
  React.useEffect(() => {
    let isMounted = true;

    const fetchInitialUptime = async () => {
      if (!isOnline) {
        if (isMounted) {
          setUptime('disconnected');
          setIsInitializing(false);
        }
        return;
      }

      try {
        const data = await api.get<{ uptime: string }>(API_ENDPOINTS.system.uptime);
        const uptimeSeconds = parseInt(data.uptime);
        
        if (isMounted && !isNaN(uptimeSeconds)) {
          const currentTime = Date.now() / 1000;
          setBaseUptime(uptimeSeconds);
          setStartTime(currentTime);
          setIsInitializing(false);
          setUptime(formatUptime(uptimeSeconds));
        } else {
          if (isMounted) {
            setIsInitializing(false);
          }
        }
      } catch (error) {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    // Update display based on local timer
    const updateLocalUptime = () => {
      if (!isOnline) {
        setUptime('disconnected');
        return;
      }

      if (isInitializing) {
        setUptime('connecting...');
        return;
      }

      if (baseUptime !== null && startTime !== null) {
        const currentTime = Date.now() / 1000;
        const elapsed = Math.floor(currentTime - startTime);
        const totalUptime = baseUptime + elapsed;
        const formattedUptime = formatUptime(totalUptime);
        setUptime(formattedUptime);
      }
    };

    fetchInitialUptime();
    const interval = setInterval(updateLocalUptime, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOnline, isInitializing, api]);

  // Create tooltips using useResponsiveTooltip
  const { wrapWithTooltip: wrapUptimeTooltip } = useResponsiveTooltip(
    () => `Server uptime: ${uptime}`,
    { delay: 300, forceShowOnMobile: true }
  );

  const { wrapWithTooltip: wrapThemeTooltip } = useResponsiveTooltip(
    () => `Current theme: ${theme}. Click to cycle themes.`,
    { delay: 300 }
  );

  const { wrapWithTooltip: wrapPinTooltip } = useResponsiveTooltip(
    'Change your admin PIN code',
    { delay: 300 }
  );

  const { wrapWithTooltip: wrapAdminEnterTooltip } = useResponsiveTooltip(
    'Enter admin mode to access advanced settings',
    { delay: 300 }
  );

  const { wrapWithTooltip: wrapAdminExitTooltip } = useResponsiveTooltip(
    'Exit admin mode',
    { delay: 300 }
  );

  const { wrapWithTooltip: wrapRefreshTooltip } = useResponsiveTooltip(
    'Refresh the page to reconnect and restore functionality',
    { delay: 300 }
  );

  const handleAdminButtonClick = () => {
    let pinValue = '';

    showModal({
      title: 'Enter Admin Mode',
      submitOnEnter: true,
      children: (
        <form 
          className="pin-modal"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const success = await withLoading(login(pinValue));
              if (!success) {
                const lockoutTime = useStore.getState().getPinLockoutTimeRemaining();
                if (lockoutTime > 0) {
                  toast.error(`Too many failed attempts. Please wait ${lockoutTime} seconds.`);
                } else {
                  toast.error('Invalid PIN - Please try again');
                }
              } else {
                // If successful login and we're in fallback mode, try to navigate to a visible tab
                const { activeTab, getVisibleTabs } = useStore.getState();
                if (activeTab === 'fallback') {
                  const visibleTabs = getVisibleTabs();
                  if (visibleTabs.length > 0) {
                    setTimeout(() => {
                      useStore.setState({ activeTab: visibleTabs[0] });
                    }, 100);
                  }
                }
              }
              return success;
            } catch (error) {
              toast.error('Failed to enter admin mode');
              return false;
            }
          }}
        >
          <input
            type="text"
            autoComplete="username"
            value="admin"
            readOnly
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <input
            type="password"
            placeholder="Enter PIN"
            autoComplete="current-password"
            onChange={(e) => {
              pinValue = e.target.value;
            }}
            autoFocus
            disabled={isLoading}
          />
        </form>
      ),
      onConfirm: async () => {
        try {
          const success = await withLoading(login(pinValue));
          if (!success) {
            const lockoutTime = useStore.getState().getPinLockoutTimeRemaining();
            if (lockoutTime > 0) {
              toast.error(`Too many failed attempts. Please wait ${lockoutTime} seconds.`);
            } else {
              toast.error('Invalid PIN - Please try again');
            }
          } else {
            // If successful login and we're in fallback mode, try to navigate to a visible tab
            const { activeTab, getVisibleTabs } = useStore.getState();
            if (activeTab === 'fallback') {
              const visibleTabs = getVisibleTabs();
              if (visibleTabs.length > 0) {
                setTimeout(() => {
                  useStore.setState({ activeTab: visibleTabs[0] });
                }, 100);
              }
            }
          }
          return success;
        } catch (error) {
          toast.error('Failed to enter admin mode');
          return false;
        }
      }
    });
  };

  const handleRefreshClick = () => {
    // Set a flag to indicate a page refresh is in progress
    try {
      sessionStorage.setItem('isPageRefreshing', 'true');
    } catch (e) {
      logger.warn('Could not set sessionStorage item for refresh detection:', e);
    }

    // Perform the page refresh
    window.location.reload();
  };

  const handlePinChange = () => {
    if (!isAdmin) {
      toast.error('Must be in admin mode to change PIN');
      return;
    }

    let currentPin = '';
    let newPin = '';
    let confirmPin = '';

    showModal({
      title: 'Change Admin PIN',
      children: (
        <form 
          className="pin-modal"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!currentPin || !newPin || !confirmPin) {
              toast.error('Please fill in all fields');
              return false;
            }
            if (newPin !== confirmPin) {
              toast.error('New PINs do not match');
              return false;
            }

            try {
              await withLoading(api.post(API_ENDPOINTS.auth.changePin, { currentPin, pin: newPin }));
              toast.success('PIN changed successfully');
              return true;
            } catch (error: any) {
              toast.error(error.message || 'Failed to change PIN');
              return false;
            }
          }}
        >
          <input
            type="text"
            autoComplete="username"
            value="admin"
            readOnly
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <input
            type="password"
            placeholder="Current PIN"
            autoComplete="current-password"
            onChange={(e) => {
              currentPin = e.target.value;
            }}
            required
            disabled={isLoading}
          />
          <input
            type="password"
            placeholder="New PIN"
            autoComplete="new-password"
            onChange={(e) => {
              newPin = e.target.value;
            }}
            required
            disabled={isLoading}
          />
          <input
            type="password"
            placeholder="Confirm new PIN"
            autoComplete="new-password"
            onChange={(e) => {
              confirmPin = e.target.value;
            }}
            required
            disabled={isLoading}
          />
        </form>
      ),
      onConfirm: async () => {
        if (!currentPin || !newPin || !confirmPin) {
          toast.error('Please fill in all fields');
          return false;
        }
        if (newPin !== confirmPin) {
          toast.error('New PINs do not match');
          return false;
        }

        try {
          await withLoading(api.post(API_ENDPOINTS.auth.changePin, { currentPin, pin: newPin }));
          toast.success('PIN changed successfully');
          return true;
        } catch (error: any) {
          toast.error(error.message || 'Failed to change PIN');
          return false;
        }
      }
    });
  };

  return (
    <header className="header">
      <div className="header-top-row">
        <div className="header-left">
          {wrapUptimeTooltip(<span className="uptime">{uptime}</span>)}
        </div>

        <div className="header-center">
          <StatusIndicators />
        </div>
      </div>

      <div className="header-right">
        {isAdmin ? (
          <>
            {wrapThemeTooltip(
              <button 
                className="theme-button"
                onClick={() => {
                  toggleTheme();
                }}
                disabled={isLoading}
              >
                <span>{theme}</span>
              </button>
            )}
            {wrapPinTooltip(
              <button 
                className="change-admin-pin-button"
                onClick={handlePinChange}
                disabled={isLoading}
              >
                Change PIN
              </button>
            )}
            {wrapAdminExitTooltip(
              <button 
                className="admin-button"
                onClick={() => {
                  logout();
                }}
                disabled={isLoading}
              >
                Exit Admin Mode
              </button>
            )}
          </>
        ) : (
          // Show refresh button when in fallback mode, otherwise show admin login button
          isFallbackActive ? (
            wrapRefreshTooltip(
              <button 
                className="admin-button"
                onClick={handleRefreshClick}
                disabled={isLoading}
              >
                Refresh Page
              </button>
            )
          ) : (
            wrapAdminEnterTooltip(
              <button 
                className="admin-button"
                onClick={handleAdminButtonClick}
                disabled={isLoading || wsStatus !== 'connected'}
              >
                Enter Admin Mode
              </button>
            )
          )
        )}
      </div>
    </header>
  );
};