import React, { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../../api/endpoints';
import { encryptDataAsync } from '../../utils/secureTransmission';
import { getSafeImagePath, FALLBACK_EMBEDDED_LOGO } from '../../utils/imageCache';
import { VersionInfo } from '../../utils/versionCache';
import { useLoading } from '../../hooks/useLoading';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../hooks/useAuth';
import './VaultAuth.css';

interface VaultAuthProps {
  onSuccess: () => void;
  versionInfo: VersionInfo;
}

export const VaultAuth: React.FC<VaultAuthProps> = ({ onSuccess, versionInfo }) => {
  const [pin, setPin] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPinAuthenticated, setIsPinAuthenticated] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(true);
  const [logoSrc, setLogoSrc] = useState<string>(FALLBACK_EMBEDDED_LOGO);
  
  const api = useApi();
  const { login: adminLogin } = useAuth();
  
  const { isLoading, withLoading } = useLoading({
    minDuration: 300
  });

  useEffect(() => {
    const cachedLogoPath = getSafeImagePath('/android-chrome-192x192.png');
    setLogoSrc(cachedLogoPath || FALLBACK_EMBEDDED_LOGO);
    
    return () => {
      setIsMounted(false);
    };
  }, []); // Run only once on mount

  useEffect(() => {
    // Effect for handling PIN authentication state changes
  }, [isPinAuthenticated]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) {
      setPinError('Admin PIN is required');
      return;
    }
    setPinError(null);
    setError(null);

    try {
      const success = await withLoading(adminLogin(pin));
      if (success) {
        setIsPinAuthenticated(true);
        setPin('');
        setTimeout(() => {
            const vaultPassInput = document.querySelector('.vault-auth-input-password') as HTMLInputElement;
            vaultPassInput?.focus();
        }, 0);
      } else {
        console.error('[VaultAuth] Admin PIN login failed.');
        setPinError('Invalid PIN or authentication failed. Please try again.');
      }
    } catch (authError: any) {
      console.error('[VaultAuth] PIN Authentication error:', authError);
      setPinError(authError?.message || 'PIN authentication failed due to an unexpected error.');
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      setError('Vault password is required');
      return;
    }

    setError(null);
    
    try {
      await withLoading(submitVaultPassword(password));
    } catch (error) {
      // Error is already logged and handled in submitVaultPassword by setting 'error' state
    }
  };
  
  const submitVaultPassword = useCallback(async (pwd: string) => {
    try {
      const encryptedPassword = await encryptDataAsync(pwd);
      
      if (!encryptedPassword) {
        throw new Error('Failed to encrypt password securely');
      }

      await api.post(API_ENDPOINTS.status.vault.preUnlock, { encryptedPassword });

      setPassword('');
      
      if (isMounted) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('[VaultAuth] Error during vault unlock (post-PIN auth):', error);
      const message = error?.response?.data?.message || error?.message || 'Failed to unlock vault. Please check your password and try again.';
      setError(message);
      throw error; 
    }
  }, [api, isMounted, onSuccess, withLoading]);

  const displayVersion = () => {
    const gen = versionInfo.generation || '—';
    const build = versionInfo.buildId !== 'unknown' ? versionInfo.buildId : '—';
    return `Version ${gen} (${build})`;
  };

  return (
    <div className="vault-auth-container">
      <div className="vault-auth-card">
        <img src={logoSrc} alt="HomeServer Logo" className="vault-auth-logo" />
        <h1>HomeServer</h1>
        
        {isPinAuthenticated ? (
          <>
            <h2>Vault Authentication</h2>
            <p className="vault-auth-desc">
              Admin PIN verified. Please enter your vault password to continue.
            </p>
            <form onSubmit={handlePasswordSubmit} className="vault-auth-form">
              <div className="form-group">
                <input
                  type="password"
                  placeholder="Enter vault password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                  className="vault-auth-input vault-auth-input-password"
                  autoComplete="current-password"
                />
              </div>
              {error && <div className="vault-auth-error">{error}</div>}
              <button 
                type="submit" 
                className="vault-auth-button"
                disabled={isLoading}
              >
                {isLoading ? 'Unlocking...' : 'Unlock Vault'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2>Admin Authentication</h2>
            <p className="vault-auth-desc">
              Please enter your Admin PIN to proceed.
            </p>
            <form onSubmit={handlePinSubmit} className="vault-auth-form">
              <div className="form-group">
                <input
                  type="password"
                  placeholder="Enter Admin PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                  className="vault-auth-input"
                  autoComplete="off"
                />
              </div>
              {pinError && <div className="vault-auth-error">{pinError}</div>}
              <button 
                type="submit" 
                className="vault-auth-button"
                disabled={isLoading}
              >
                {isLoading ? 'Authenticating...' : 'Authenticate PIN'}
              </button>
            </form>
          </>
        )}
        
        <small>Product of HOMESERVER LLC</small>
        <div className="version-info">
          <small>
            {displayVersion()}
          </small>
        </div>
      </div>
    </div>
  );
};

