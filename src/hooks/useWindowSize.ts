import { useState, useEffect } from 'react';

export const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    zoom: window.devicePixelRatio || 1,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
        zoom: window.devicePixelRatio || 1,
      });
    };

    // Listen for window resize events
    window.addEventListener('resize', handleResize);
    
    // Listen for zoom changes specifically
    // Different browsers might trigger different events for zoom
    window.addEventListener('wheel', handleResize, { passive: true });
    
    // Some browsers might trigger this on zoom
    window.matchMedia('(resolution)').addEventListener('change', handleResize);
    
    // Force an update on mount
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', handleResize);
      window.matchMedia('(resolution)').removeEventListener('change', handleResize);
    };
  }, []);

  return windowSize;
}; 