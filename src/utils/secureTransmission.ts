import CryptoJS from 'crypto-js';
import { api } from '../api/client';
import { API_ENDPOINTS } from '../api/endpoints';
import { debug, createComponentLogger } from './debug';

// Create component-specific logger
const logger = createComponentLogger('SecureTransmission');

// --- AES Encryption/Decryption Configuration (Matches backend) ---
// Instead of hardcoding, we'll retrieve the key from the server
let SECRET_KEY: CryptoJS.lib.WordArray | null = null;
const IV_LENGTH = 16; // AES block size in bytes (128 bits)
// --- End AES Configuration ---

/**
 * Fetches the encryption key from the server.
 * This requires admin authentication.
 * 
 * @returns A Promise that resolves to the secret key as a WordArray, or null on error
 */
export async function fetchSecretKey(): Promise<CryptoJS.lib.WordArray | null> {
  try {
    // Only fetch if we don't already have it
    if (SECRET_KEY) {
      debug('Using cached encryption key');
      return SECRET_KEY;
    }

    // Get the admin token from localStorage
    const token = api.admin.getToken();
    if (!token) {
      logger.warn('No admin token available, using fallback key for initial authentication');
      // For initial authentication, we need to use a fallback key
      // The proper key will be fetched after authentication
      const fallbackKey = CryptoJS.enc.Utf8.parse('0123456789abcdef0123456789abcdef');
      return fallbackKey;
    }

    // Fetch the key from the server
    debug('Fetching encryption key from server');
    const response = await api.get<{success: boolean, key: string}>(API_ENDPOINTS.crypto.getKey);

    if (response.success && response.key) {
      // Convert the hex string to a WordArray
      SECRET_KEY = CryptoJS.enc.Hex.parse(response.key);
      debug('Successfully retrieved encryption key');
      return SECRET_KEY;
    } else {
      logger.error('Failed to retrieve key:', response);
      return null;
    }
  } catch (error: any) {
    logger.error('Error fetching encryption key:', error.message || error);
    // For error recovery, use fallback key
    logger.warn('Using fallback encryption key due to fetch error');
    return CryptoJS.enc.Utf8.parse('0123456789abcdef0123456789abcdef');
  }
}

/**
 * Ensures we have a valid secret key, either by using the cached one or fetching from server.
 * If both fail, falls back to the default key for backward compatibility.
 * 
 * @returns A Promise that resolves to the secret key as a WordArray
 */
async function getSecretKey(): Promise<CryptoJS.lib.WordArray> {
  // Try to fetch from server
  const key = await fetchSecretKey();
  if (key) {
    return key;
  }
  
  // Fall back to default key if fetch fails
  logger.warn('Using fallback encryption key');
  return CryptoJS.enc.Utf8.parse('0123456789abcdef0123456789abcdef');
}

/**
 * Encrypts data using AES-CBC with the shared secret key.
 * Generates a random IV, prepends it to the ciphertext, and returns a Base64 encoded string.
 * Async version that retrieves the key from the server.
 *
 * @param plainText The string data to encrypt.
 * @returns A Promise that resolves to the Base64 encoded string (IV + Ciphertext), or null on error.
 */
export async function encryptDataAsync(plainText: string): Promise<string | null> {
  try {
    // Get the secret key
    const secretKey = await getSecretKey();
    
    // Generate random IV
    const iv = CryptoJS.lib.WordArray.random(IV_LENGTH);
    
    // Encrypt using AES-CBC with PKCS7 padding (matches backend)
    const encrypted = CryptoJS.AES.encrypt(plainText, secretKey, {
      iv: iv,
      padding: CryptoJS.pad.Pkcs7,
      mode: CryptoJS.mode.CBC
    });
    
    // Concatenate IV (WordArray) and ciphertext (WordArray)
    const ivBytes = iv;
    const ciphertextBytes = encrypted.ciphertext; // Access the WordArray from CipherParams
    const ivAndCiphertext = ivBytes.concat(ciphertextBytes);
    
    // Return as base64 string
    const payload = ivAndCiphertext.toString(CryptoJS.enc.Base64);
    debug(`AES encryption successful. Payload length (Base64): ${payload.length}`);
    return payload;
    
  } catch (e: any) {
    logger.error(`AES encryption failed: ${e.message || e}`);
    return null;
  }
}

/**
 * Decrypts data encrypted with AES-CBC using the shared secret key.
 * Expects a Base64 encoded string containing IV + Ciphertext.
 * Async version that retrieves the key from the server.
 *
 * @param encryptedPayloadB64 The Base64 encoded string (IV + Ciphertext).
 * @returns A Promise that resolves to the decrypted string, or null on error.
 */
export async function decryptDataAsync(encryptedPayloadB64: string): Promise<string | null> {
  try {
    // Get the secret key
    const secretKey = await getSecretKey();
    
    // Decode Base64 to get IV + Ciphertext bytes
    const ivAndCiphertext = CryptoJS.enc.Base64.parse(encryptedPayloadB64);
    
    // Extract IV (first 16 bytes)
    const iv = CryptoJS.lib.WordArray.create(ivAndCiphertext.words.slice(0, IV_LENGTH / 4)); // word = 4 bytes
    
    // Extract Ciphertext (remaining bytes)
    const ciphertext = CryptoJS.lib.WordArray.create(ivAndCiphertext.words.slice(IV_LENGTH / 4));
    // Adjust sigBytes for the extracted ciphertext
    ciphertext.sigBytes = ivAndCiphertext.sigBytes - IV_LENGTH;
    
    debug(`AES Decryption: Extracted IV (len=${iv.sigBytes}), Ciphertext (len=${ciphertext.sigBytes})`);

    // Create CipherParams object for decryption
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: ciphertext
    });

    // Decrypt using AES-CBC with PKCS7 padding
    const decrypted = CryptoJS.AES.decrypt(cipherParams, secretKey, {
      iv: iv,
      padding: CryptoJS.pad.Pkcs7,
      mode: CryptoJS.mode.CBC
    });
    
    // Convert decrypted WordArray to UTF8 string
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedString) {
        // This can happen if padding is incorrect or key is wrong
        throw new Error("Decryption resulted in empty string, potentially due to incorrect key or padding.");
    }
    
    debug("AES decryption successful.");
    return decryptedString;

  } catch (e: any) {
    logger.error(`AES decryption failed: ${e.message || e}`);
    return null;
  }
}

// For backward compatibility with synchronous code
// This will use the cached key if available, or the fallback key
export function encryptDataSync(plainText: string): string | null {
  try {
    // Use cached key or fallback
    const secretKey = SECRET_KEY || CryptoJS.enc.Utf8.parse('0123456789abcdef0123456789abcdef');
    
    // Generate random IV
    const iv = CryptoJS.lib.WordArray.random(IV_LENGTH);
    
    // Encrypt using AES-CBC with PKCS7 padding
    const encrypted = CryptoJS.AES.encrypt(plainText, secretKey, {
      iv: iv,
      padding: CryptoJS.pad.Pkcs7,
      mode: CryptoJS.mode.CBC
    });
    
    // Concatenate IV and ciphertext
    const ivAndCiphertext = iv.concat(encrypted.ciphertext);
    
    // Return as base64 string
    return ivAndCiphertext.toString(CryptoJS.enc.Base64);
    
  } catch (e: any) {
    logger.error(`Sync encryption failed: ${e.message || e}`);
    return null;
  }
}

// Aliases for backward compatibility
export const encryptData = encryptDataSync;
export const decryptData = decryptDataSync;

export function decryptDataSync(encryptedPayloadB64: string): string | null {
  try {
    // Use cached key or fallback
    const secretKey = SECRET_KEY || CryptoJS.enc.Utf8.parse('0123456789abcdef0123456789abcdef');
    
    // Decode Base64
    const ivAndCiphertext = CryptoJS.enc.Base64.parse(encryptedPayloadB64);
    
    // Extract IV and ciphertext
    const iv = CryptoJS.lib.WordArray.create(ivAndCiphertext.words.slice(0, IV_LENGTH / 4));
    const ciphertext = CryptoJS.lib.WordArray.create(ivAndCiphertext.words.slice(IV_LENGTH / 4));
    ciphertext.sigBytes = ivAndCiphertext.sigBytes - IV_LENGTH;
    
    // Create CipherParams and decrypt
    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext });
    const decrypted = CryptoJS.AES.decrypt(cipherParams, secretKey, {
      iv: iv,
      padding: CryptoJS.pad.Pkcs7,
      mode: CryptoJS.mode.CBC
    });
    
    return decrypted.toString(CryptoJS.enc.Utf8);
    
  } catch (e: any) {
    logger.error(`Sync decryption failed: ${e.message || e}`);
    return null;
  }
}
