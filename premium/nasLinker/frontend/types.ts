// TypeScript type definitions for nasLinker premium tab

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_hardlink: boolean;
  nlink: number;
  size: number | null;
  modified: number;
}

export interface BrowseResponse {
  success: boolean;
  path: string;
  entries: FileEntry[];
  parent: string | null;
  error?: string;
}

export interface DeployRequest {
  sources: string[];
  destination: string;
  conflict_strategy?: 'fail' | 'skip' | 'overwrite' | 'rename';
}

export interface DeployResponse {
  success: boolean;
  success_count: number;
  fail_count: number;
  errors: string[];
}

export interface DeleteResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface RenameRequest {
  path: string;
  new_name: string;
}

export interface RenameResponse {
  success: boolean;
  message?: string;
  new_path?: string;
  error?: string;
}

export interface NewDirRequest {
  parent_path: string;
  dir_name: string;
}

export interface NewDirResponse {
  success: boolean;
  message?: string;
  path?: string;
  error?: string;
}

export interface HardlinkEntry {
  path: string;
  name: string;
  nlink: number;
  inode: number;
  is_hardlink: boolean;
  is_dir: boolean;
}

export interface ScanResponse {
  success: boolean;
  path: string;
  hardlinks: HardlinkEntry[];
  error?: string;
}

export interface NasLinkerConfig {
  tab_name: string;
  display_name: string;
  description: string;
  version: string;
  base_directory: string;
  capabilities: {
    browse: boolean;
    hardlink_creation: boolean;
    delete: boolean;
    rename: boolean;
    create_directory: boolean;
    hardlink_detection: boolean;
  };
}

export interface UseNasLinkerControlsReturn {
  browse: (path: string) => Promise<BrowseResponse>;
  deploy: (sources: string[], destination: string, conflict_strategy?: string) => Promise<DeployResponse>;
  deleteItem: (path: string) => Promise<DeleteResponse>;
  renameItem: (path: string, new_name: string) => Promise<RenameResponse>;
  createDirectory: (parent_path: string, dir_name: string) => Promise<NewDirResponse>;
  scan: (path: string) => Promise<ScanResponse>;
  getConfig: () => Promise<NasLinkerConfig>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}
