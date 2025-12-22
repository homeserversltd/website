export interface FileEntry {
    name: string;
    path: string;
    size: number;
    type: 'file' | 'directory';
    modified: string;
    permissions: string;
    owner: string;
    children?: DirectoryEntry[];
}

// New type for directory-only browsing
export interface DirectoryEntry {
    name: string;
    path: string;
    type: 'directory';
    children?: DirectoryEntry[] | null;
    isExpanded?: boolean;
    hasChildren?: boolean;
    isLoading?: boolean;
}

export interface DirectoryContents {
    path: string;
    entries: DirectoryEntry[];
    parent: string | null;
}

// New type for hierarchical directory response
export interface HierarchicalDirectoryResponse {
    path: string;
    entries: DirectoryEntry[];
    parent: string | null;
    hasChildren: boolean;
}

export interface UploadProgress {
    filename: string;
    progress: number;
    speed: number;
    uploaded: number;
    total: number;
    status: 'pending' | 'uploading' | 'completed' | 'error';
    error?: string;
}

export interface BlacklistRule {
    id: string;
    pattern: string;
    type: 'extension' | 'filename' | 'path';
    description?: string;
    enabled: boolean;
}

export interface UploadConfig {
    maxFileSize: number;
    allowedExtensions: string[];
    maxConcurrentUploads: number;
    defaultPath: string;
    blacklist: BlacklistRule[];
}