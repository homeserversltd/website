import CryptoJS from 'crypto-js';
import { encryptData, encryptDataAsync, fetchSecretKey } from './secureTransmission'; // Import fetchSecretKey and encryptDataAsync
import { debug, createComponentLogger } from './debug';

// Create component-specific logger
const logger = createComponentLogger('SecureAuth');

interface AuthChallenge {
  nonce: string;
  timestamp: string;
  sid: string;
}

/**
 * Handles secure WebSocket authentication with encryption
 */
export class SecureAuthClient {
  private socket: any;  // SocketIO client instance
  private connectionTimestamp: number;

  constructor(socket: any) {
    this.socket = socket;
    this.connectionTimestamp = Date.now();
  }

  /**
   * Securely authenticate as admin
   * @param pin The admin PIN
   * @returns Promise that resolves on successful auth
   */
  public authenticateAdmin(pin: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // First fetch the secret key
      fetchSecretKey().then(secretKey => {
        // Request an auth challenge from the server
        this.socket.emit('auth_challenge_request');
        
        // Listen for the challenge
        this.socket.once('auth_challenge', async (challenge: AuthChallenge) => {
          try {
            debug('Attempting secure authentication');
            
            // Create encrypted auth payload
            const encryptedPayload = await this.createAuthPayload(pin, challenge);
            
            // Send the encrypted authentication
            this.socket.emit('admin_auth', {
              encrypted_payload: encryptedPayload,
              timestamp: challenge.timestamp,
              nonce: challenge.nonce
            });
            
            // Wait for auth response
            this.socket.once('admin_auth_response', (response: any) => {
              if (response.status === 'authenticated') {
                resolve();
              } else {
                reject(new Error(response.message || 'Authentication failed'));
              }
            });
          } catch (err) {
            reject(err);
          }
        });
      }).catch(error => {
        logger.error('Failed to fetch secret key:', error);
        reject(new Error('Failed to fetch encryption key for authentication'));
      });
    });
  }
  
  /**
   * Create an encrypted authentication payload
   */
  private async createAuthPayload(pin: string, challenge: AuthChallenge): Promise<string> {
    debug('Creating auth payload...');
    // Method 1: Try AES-CBC Encryption using the async utility that fetches the key
    const encryptedPayload = await encryptDataAsync(pin);
    
    if (encryptedPayload) {
      debug(`AES payload created via utility (Base64): ${encryptedPayload.substring(0, 10)}...`);
      return encryptedPayload;
    } else {
      logger.error('AES encryption failed via utility. Falling back to Base64.');
      // Method 2: Fallback to simple Base64 encoding
      try {
        const payload = btoa(pin);
        debug(`AES failed, using Base64 fallback: ${payload.substring(0, 10)}...`);
        return payload;
      } catch (b64Error: any) {
        logger.error(`Base64 fallback also failed: ${b64Error.message || b64Error}. Cannot create payload.`);
        // If both fail, we cannot authenticate securely
        throw new Error('Failed to create authentication payload using AES or Base64.');
      }
    }
  }
}

// Make sure the module is recognized by adding a default export
export default SecureAuthClient; 