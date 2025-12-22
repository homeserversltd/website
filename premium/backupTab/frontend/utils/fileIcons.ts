/**
 * Utility functions for determining file type icons based on file extensions and paths
 */

export interface FileTypeInfo {
  isDirectory: boolean;
  extension: string | null;
  emoji: string;
}

/**
 * Determines if a path represents a directory
 * @param path - The file or directory path
 * @returns true if the path ends with '/' or appears to be a directory
 */
export function isDirectory(path: string): boolean {
  return path.endsWith('/') || (!path.includes('.') && !path.includes('\\'));
}

/**
 * Extracts file extension from a path
 * @param path - The file path
 * @returns The file extension (without the dot) or null if no extension
 */
export function getFileExtension(path: string): string | null {
  const lastDotIndex = path.lastIndexOf('.');
  const lastSlashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  
  // Only consider it an extension if the dot comes after the last slash
  if (lastDotIndex > lastSlashIndex && lastDotIndex < path.length - 1) {
    return path.substring(lastDotIndex + 1).toLowerCase();
  }
  
  return null;
}

/**
 * Maps file extensions to appropriate emojis
 * @param extension - The file extension (lowercase)
 * @returns The appropriate emoji for the file type
 */
function getEmojiForExtension(extension: string): string {
  const extensionMap: Record<string, string> = {
    // Text and documents
    'txt': '📄',
    'md': '📝',
    'doc': '📄',
    'docx': '📄',
    'pdf': '📕',
    'rtf': '📄',
    
    // Code files
    'py': '🐍',
    'js': '📜',
    'ts': '📜',
    'tsx': '⚛️',
    'jsx': '⚛️',
    'html': '🌐',
    'css': '🎨',
    'scss': '🎨',
    'sass': '🎨',
    'json': '📋',
    'xml': '📋',
    'yaml': '📋',
    'yml': '📋',
    'toml': '📋',
    'ini': '⚙️',
    'conf': '⚙️',
    'cfg': '⚙️',
    'sh': '🐚',
    'bash': '🐚',
    'zsh': '🐚',
    'fish': '🐚',
    'c': '🔧',
    'cpp': '🔧',
    'h': '🔧',
    'hpp': '🔧',
    'java': '☕',
    'go': '🐹',
    'rs': '🦀',
    'php': '🐘',
    'rb': '💎',
    'pl': '🐪',
    'lua': '🌙',
    'sql': '🗃️',
    
    // Images
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'png': '🖼️',
    'gif': '🖼️',
    'bmp': '🖼️',
    'svg': '🖼️',
    'webp': '🖼️',
    'tiff': '🖼️',
    'ico': '🖼️',
    
    // Audio
    'mp3': '🎵',
    'wav': '🎵',
    'flac': '🎵',
    'aac': '🎵',
    'ogg': '🎵',
    'm4a': '🎵',
    'wma': '🎵',
    
    // Video
    'mp4': '🎬',
    'avi': '🎬',
    'mkv': '🎬',
    'mov': '🎬',
    'wmv': '🎬',
    'flv': '🎬',
    'webm': '🎬',
    'm4v': '🎬',
    
    // Archives
    'zip': '📦',
    'rar': '📦',
    '7z': '📦',
    'tar': '📦',
    'gz': '📦',
    'bz2': '📦',
    'xz': '📦',
    'tar.gz': '📦',
    'tar.bz2': '📦',
    'tar.xz': '📦',
    
    // Database
    'db': '🗄️',
    'sqlite': '🗄️',
    'sqlite3': '🗄️',
    'mdb': '🗄️',
    'accdb': '🗄️',
    
    // Logs
    'log': '📊',
    'logs': '📊',
    
    // System files
    'exe': '⚙️',
    'msi': '⚙️',
    'deb': '📦',
    'rpm': '📦',
    'dmg': '💿',
    'iso': '💿',
    'bin': '⚙️',
    
    // Fonts
    'ttf': '🔤',
    'otf': '🔤',
    'woff': '🔤',
    'woff2': '🔤',
    
    // Certificates and keys
    'pem': '🔐',
    'key': '🔐',
    'crt': '🔐',
    'cer': '🔐',
    'p12': '🔐',
    'pfx': '🔐',
    
    // Default for unknown extensions
    'default': '📄'
  };
  
  return extensionMap[extension] || extensionMap['default'];
}

/**
 * Gets file type information including appropriate emoji
 * @param path - The file or directory path
 * @returns FileTypeInfo object with directory status, extension, and emoji
 */
export function getFileTypeInfo(path: string): FileTypeInfo {
  const isDir = isDirectory(path);
  const extension = isDir ? null : getFileExtension(path);
  
  let emoji: string;
  
  if (isDir) {
    emoji = '📁';
  } else if (extension) {
    emoji = getEmojiForExtension(extension);
  } else {
    // File without extension
    emoji = '📄';
  }
  
  return {
    isDirectory: isDir,
    extension,
    emoji
  };
}

/**
 * Gets just the emoji for a file path (convenience function)
 * @param path - The file or directory path
 * @returns The appropriate emoji
 */
export function getFileEmoji(path: string): string {
  return getFileTypeInfo(path).emoji;
}