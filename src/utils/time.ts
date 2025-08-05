/**
 * Format a timestamp into MM:SS format
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
}; 