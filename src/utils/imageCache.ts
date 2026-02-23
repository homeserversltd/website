/**
 * imageCache.ts
 * Utility for caching images in localStorage for offline use
 */

// List of image paths to cache
const IMAGES_TO_CACHE = [
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/apple-touch-icon.png',
  '/favicon-32x32.png',
  '/favicon-16x16.png'
];

// The primary logo image that should be pre-loaded immediately
const PRIMARY_LOGO = '/android-chrome-192x192.png';

// Cache keys
const IMAGE_CACHE_PREFIX = 'homeserver_img_cache_';
const IMAGE_CACHE_TIMESTAMP = 'homeserver_img_cache_timestamp';

// Cache duration in milliseconds (1 day)
const CACHE_DURATION = 24 * 60 * 60 * 1000;

/**
 * Convert an image to a Data URL
 */
const imageToDataUrl = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // Create canvas and get data URL
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };
    
    img.onerror = () => {
      reject(new Error(`Failed to load image: ${url}`));
    };
    
    // Set source to load the image
    img.src = url;
  });
};

/**
 * Cache an image in localStorage
 */
const cacheImage = async (imagePath: string): Promise<void> => {
  try {
    const cacheKey = IMAGE_CACHE_PREFIX + imagePath.replace(/\//g, '_');
    
    // Check if already cached
    if (localStorage.getItem(cacheKey)) {
      return;
    }
    
    const dataUrl = await imageToDataUrl(imagePath);
    localStorage.setItem(cacheKey, dataUrl);
    console.log(`[ImageCache] Cached ${imagePath}`);
  } catch (err) {
    console.error(`[ImageCache] Failed to cache ${imagePath}:`, err);
  }
};

/**
 * Cache all specified images
 */
export const cacheAllImages = async (): Promise<void> => {
  // Check if cache is still fresh
  const timestamp = localStorage.getItem(IMAGE_CACHE_TIMESTAMP);
  const now = Date.now();
  
  if (timestamp && (now - parseInt(timestamp)) < CACHE_DURATION) {
    // console.log('[ImageCache] Using existing cache');
    return;
  }
  
  console.log('[ImageCache] Refreshing image cache');
  
  // Cache all images
  const promises = IMAGES_TO_CACHE.map(path => cacheImage(path));
  await Promise.allSettled(promises);
  
  // Update timestamp
  localStorage.setItem(IMAGE_CACHE_TIMESTAMP, now.toString());
};

/**
 * Get a cached image as a data URL
 */
export const getCachedImage = (imagePath: string): string | null => {
  const cacheKey = IMAGE_CACHE_PREFIX + imagePath.replace(/\//g, '_');
  return localStorage.getItem(cacheKey);
};

/**
 * Check if an image is cached
 */
export const isImageCached = (imagePath: string): boolean => {
  const cacheKey = IMAGE_CACHE_PREFIX + imagePath.replace(/\//g, '_');
  return !!localStorage.getItem(cacheKey);
};

/**
 * Remove a cached image (e.g. when it fails to load and is likely corrupt/truncated).
 */
export const clearCachedImage = (imagePath: string): void => {
  const cacheKey = IMAGE_CACHE_PREFIX + imagePath.replace(/\//g, '_');
  localStorage.removeItem(cacheKey);
};

/**
 * Safely get image path or cached version
 * Returns either the cached data URL or the original path if not cached
 */
export const getSafeImagePath = (imagePath: string): string => {
  const cachedImage = getCachedImage(imagePath);
  return cachedImage || imagePath;
};

/**
 * A fallback embedded logo - base64 encoded minimal version of the logo
 * Used as an absolutely last resort if localStorage is unavailable or empty
 */
export const FALLBACK_EMBEDDED_LOGO = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwBAMAAAClLOS0AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAMFBMVEUAAAD///////////////////////////////////////////////////////////87TQQwAAAAD3RSTlMAAhxUhrvZ8P8kPGaRHUPAJHFDAAAAAWJLR0QAiAUdSAAAAAlwSFlzAAALEgAACxIB0t1+/AAAAAd0SU1FB+UDAgUoNvKbq2gAAADqSURBVDjLY2DADwTQOQwMjBpoCrRQOSowjgFWDgMjXA4rB1FsKCrwgNHOQYLDJCcnV4rMMHbW1s6FIRaGDewgvbNnz84NEm1tbWVgCGXg5+8VFRUEsmdDzGdjFRQUZIDKMUgzMIhwQJ2HAzjzcLKysEMYTKwszMwsgmAGKwsTEzMzO4TB+tXExMTCwGf+/58JOQYZ6AKzZ8+ZOzcCzGCQ5OeH8KWgnNrZs7Oz9SD6ZIUFYXbHojpNUhRkNzODMxMOYMfABPcdC3YvYAF2DEwwtrYUDmCNFdgwxFuBSxxTvB07cIujc7AAACvdQJmQEK7YAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDIxLTAzLTAyVDA1OjQwOjU0KzAwOjAwou4p1QAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyMS0wMy0wMlQwNTo0MDo1NCswMDowMNOzkWkAAAAASUVORK5CYII=`;

// Try to pre-load the primary logo as soon as this module is loaded
try {
  // Only try to cache if we're in a browser environment with localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    const primaryLogoCacheKey = IMAGE_CACHE_PREFIX + PRIMARY_LOGO.replace(/\//g, '_');
    
    // If we don't have it cached yet, try to load it right away
    if (!localStorage.getItem(primaryLogoCacheKey)) {
      console.log('[ImageCache] Pre-loading primary logo');
      // We use the non-async version to ensure it runs immediately
      fetch(PRIMARY_LOGO)
        .then(response => response.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            localStorage.setItem(primaryLogoCacheKey, dataUrl);
            console.log('[ImageCache] Primary logo pre-loaded successfully');
          };
          reader.readAsDataURL(blob);
        })
        .catch(err => {
          console.error('[ImageCache] Failed to pre-load primary logo:', err);
        });
    }
  }
} catch (err) {
  console.error('[ImageCache] Error during module initialization:', err);
} 