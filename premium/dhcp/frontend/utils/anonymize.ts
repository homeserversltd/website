/**
 * Anonymization utilities for DHCP data
 * Provides deterministic anonymization - same input always produces same output
 */

/**
 * Simple hash function for deterministic randomization
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate a random MAC address based on seed
 */
function generateMacFromSeed(seed: number): string {
  const hexChars = '0123456789abcdef';
  const parts: string[] = [];
  
  // Use seed to generate 6 hex pairs
  for (let i = 0; i < 6; i++) {
    const value = (seed + i * 7919) % 256; // 7919 is a prime for better distribution
    parts.push(
      hexChars[Math.floor(value / 16)] + 
      hexChars[value % 16]
    );
  }
  
  return parts.join(':');
}

/**
 * Generate a random hostname based on seed and original length
 */
function generateHostnameFromSeed(seed: number, originalLength: number): string {
  const adjectives = ['quick', 'lazy', 'smart', 'fast', 'cool', 'bold', 'calm', 'wise', 'keen', 'neat'];
  const nouns = ['device', 'host', 'node', 'system', 'unit', 'box', 'hub', 'core', 'edge', 'link'];
  const numbers = ['01', '02', '03', '04', '05', '10', '20', '30', '50', '99'];
  
  // Use seed to pick deterministic values
  const adjIndex = seed % adjectives.length;
  const nounIndex = (seed * 7) % nouns.length;
  const numIndex = (seed * 13) % numbers.length;
  
  const base = `${adjectives[adjIndex]}${nouns[nounIndex]}${numbers[numIndex]}`;
  
  // If original had domain suffix, add .local
  if (originalLength > 15) {
    return `${base}.local`;
  }
  
  return base;
}

/**
 * Anonymize a MAC address deterministically
 */
export function anonymizeMac(mac: string): string {
  const seed = hashString(mac.toLowerCase());
  return generateMacFromSeed(seed);
}

/**
 * Anonymize a hostname deterministically
 */
export function anonymizeHostname(hostname: string): string {
  if (!hostname || hostname.trim() === '') {
    return 'anonymous-device';
  }
  
  const seed = hashString(hostname.toLowerCase());
  return generateHostnameFromSeed(seed, hostname.length);
}