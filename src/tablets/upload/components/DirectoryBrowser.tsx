import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { FileEntry, DirectoryEntry, DirectoryContents } from '../types';
import { useLoading } from '../../../hooks/useLoading';
import { useToast } from '../../../hooks/useToast';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { useApi } from '../../../hooks/useApi';
import { API_ENDPOINTS } from '../../../api/endpoints';
import { useDirectory } from '../../../store';
import { isOfflineApiError } from '../../../api/interceptors';
import { createComponentLogger, debug, debugPerformance, debugState } from '../../../utils/debug';
import './DirectoryBrowser.css';

interface DirectoryBrowserProps {
  onPathChange: (path: string) => void;
  isActive?: boolean;
  onRefresh?: () => void;
  isAdmin?: boolean;
  onDirectoryLoaded?: (isLoaded: boolean) => void;
  onForceAllowUpload?: () => void;
  onSetDefaultDirectory?: () => void;
  onManageBlacklist?: () => void;
  onViewHistory?: () => void;
  isAdminLoading?: boolean;
  isPinRequiredForUpload?: boolean;
  onTogglePinRequirement?: () => void;
  isSavingPinStatus?: boolean;
}

// Define the ref interface
export interface DirectoryBrowserRef {
  refreshTree: () => Promise<void>;
}

export const DirectoryBrowser = forwardRef<DirectoryBrowserRef, DirectoryBrowserProps>(({
  onPathChange,
  isActive = false,
  onRefresh,
  isAdmin = false,
  onDirectoryLoaded,
  onForceAllowUpload,
  onSetDefaultDirectory,
  onManageBlacklist,
  onViewHistory,
  isAdminLoading = false,
  isPinRequiredForUpload = false,
  onTogglePinRequirement,
  isSavingPinStatus = false,
}, ref) => {
  const [treeData, setTreeData] = useState<DirectoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>('/mnt/nas');
  const [isLocalLoading, setIsLocalLoading] = useState(true);
  const isInitialized = useRef(false);
  const toast = useToast();
  const api = useApi();

  // Create component-specific logger
  const logger = createComponentLogger('DirectoryBrowser');

  // Get directory cache methods
  const { 
    loadDirectoryDeep,
    loadDirectoryHierarchical,
    toggleDirectoryExpansion,
    expandDirectory,
    directoryCache,
    updateDirectoryTree,
    getDirectoryTree,
    invalidateCache 
  } = useDirectory();

  const loadHierarchicalTree = useCallback(async (basePath: string) => {
    try {
      debug('Loading hierarchical tree for path:', basePath);
      setIsLocalLoading(true);
      setError(null);

      // Get cached data first
      const cachedTree = getDirectoryTree(basePath);
      if (cachedTree) {
        debug('Using cached hierarchical tree for path:', basePath);
        setTreeData(cachedTree);
        onDirectoryLoaded?.(true);
        setIsLocalLoading(false);
        return;
      }

      // If no cache, load hierarchical tree (only one level)
      debug('No cache found, loading fresh hierarchical data for path:', basePath);
      const entries = await loadDirectoryHierarchical(basePath);
      debug(`Loaded fresh hierarchical data for path: ${basePath}, entries count: ${entries.length}`);
      setTreeData(entries);
      onDirectoryLoaded?.(true);
      
    } catch (err: any) {
      logger.error('Failed to load hierarchical directory tree:', err);
      
      // Check if this is a NAS unavailable error
      if (err?.response?.data?.nas_unavailable) {
        const nasErrorMsg = '⚠️ NAS Storage Unavailable';
        setError(nasErrorMsg);
        toast.error('NAS storage is not mounted or accessible');
      } else {
        const errorMsg = 'Failed to load directory tree';
        setError(errorMsg);
        if (!isOfflineApiError(err)) {
          toast.error(errorMsg);
        }
      }
      onDirectoryLoaded?.(false);
    } finally {
      setIsLocalLoading(false);
    }
  }, [loadDirectoryHierarchical, getDirectoryTree, onDirectoryLoaded, toast]);

  // Expand the directory tree down to a target path
  const expandPathToTarget = useCallback(async (targetPath: string) => {
    logger.debug('🎯 Auto-expanding path to default directory', {
      targetPath,
      operation: 'auto-expand-start'
    });
    
    // Break the path into segments
    const pathSegments = targetPath.split('/').filter(Boolean);
    if (pathSegments.length < 2 || pathSegments[0] !== 'mnt' || pathSegments[1] !== 'nas') {
      logger.warn('⚠️ Invalid target path for auto-expansion', {
        targetPath,
        segments: pathSegments,
        expectedStart: '/mnt/nas'
      });
      return;
    }
    
    // Start from /mnt/nas and expand each level
    let currentPath = '/mnt/nas';
    const segmentsToExpand = pathSegments.slice(2); // Skip 'mnt' and 'nas'
    
    logger.debug('📋 Planning expansion path', {
      targetPath,
      segmentsToExpand,
      totalDepth: segmentsToExpand.length
    });
    
    // Track expansion progress
    for (let i = 0; i < segmentsToExpand.length; i++) {
      const nextSegment = segmentsToExpand[i];
      const nextPath = `${currentPath}/${nextSegment}`;
      
      logger.debug('🔄 Expanding path segment', {
        segmentIndex: i + 1,
        totalSegments: segmentsToExpand.length,
        currentPath,
        nextSegment,
        nextPath,
        operation: 'segment-expand'
      });
      
      try {
        // Track the expansion timing
        const expandResult = await debugPerformance.timeAsync(
          `Auto-expand segment: ${currentPath}`,
          () => expandDirectory(currentPath)
        );
        
        logger.debug('✅ Segment expansion completed', {
          currentPath,
          expandResult,
          timeMs: expandResult
        });
        
        // Update tree data to reflect the expansion
        const updatedTree = getDirectoryTree('/mnt/nas');
        if (updatedTree) {
          debugState.stateChange('TreeData', `auto-expand-${i}`, treeData, updatedTree);
          setTreeData(updatedTree);
          
          logger.debug('🔄 Tree updated after segment expansion', {
            segmentIndex: i + 1,
            currentPath,
            treeSize: updatedTree.length
          });
        } else {
          logger.warn('⚠️ No tree data after segment expansion', {
            currentPath,
            segmentIndex: i + 1
          });
        }
        
        // Move to the next level
        currentPath = nextPath;
      } catch (error) {
        logger.error('❌ Auto-expansion failed for segment', {
          currentPath,
          nextSegment,
          error: error instanceof Error ? error.message : String(error),
          segmentIndex: i + 1,
          operation: 'segment-expand-error'
        });
        break; // Stop expanding if we hit an error
      }
    }
    
    logger.debug('🎯 Auto-expansion completed', {
      targetPath,
      finalPath: currentPath,
      reachedTarget: currentPath === targetPath,
      operation: 'auto-expand-complete'
    });
  }, [expandDirectory, getDirectoryTree, logger, treeData]);

  // Initialize directory tree
  const initializeTree = useCallback(async () => {
    const initStart = performance.now();
    
    logger.debug('🚀 Directory tree initialization started', {
      operation: 'init-start',
      timestamp: new Date().toISOString()
    });
    
    try {
      setIsLocalLoading(true);
      setError(null);
      
      // Fetch default directory configuration
      logger.debug('📁 Fetching default directory configuration', {
        endpoint: API_ENDPOINTS.upload.setDefaultDirectory
      });
      
      const configResponse = await debugPerformance.timeAsync(
        'Default directory config fetch',
        () => api.get<{ defaultPath: string }>(API_ENDPOINTS.upload.setDefaultDirectory)
      );
      
      const defaultPath = configResponse.defaultPath || '/mnt/nas';
      
      logger.debug('📋 Configuration loaded', {
        defaultPath,
        configuredPath: configResponse.defaultPath,
        usingFallback: !configResponse.defaultPath,
        operation: 'config-loaded'
      });
      
      // Always start from /mnt/nas (root)
      logger.debug('🌳 Loading root hierarchy', {
        rootPath: '/mnt/nas',
        operation: 'root-load-start'
      });
      
      await debugPerformance.timeAsync(
        'Root hierarchy load',
        () => loadHierarchicalTree('/mnt/nas')
      );
      
      logger.debug('✅ Root hierarchy loaded', {
        rootPath: '/mnt/nas',
        operation: 'root-load-complete'
      });
      
      // If default path is deeper than /mnt/nas, expand the path to it
      if (defaultPath !== '/mnt/nas') {
        logger.debug('🎯 Expanding to default path', {
          defaultPath,
          operation: 'default-path-expand-start'
        });
        
        await debugPerformance.timeAsync(
          `Expand to default: ${defaultPath}`,
          () => expandPathToTarget(defaultPath)
        );
        
        logger.debug('✅ Expanded to default path', {
          defaultPath,
          operation: 'default-path-expand-complete'
        });
      } else {
        logger.debug('🏠 Default path is root, no expansion needed', {
          defaultPath
        });
      }
      
      // Set the default path as selected
      debugState.stateChange('SelectedPath', 'initialization', selectedPath, defaultPath);
      setSelectedPath(defaultPath);
      onPathChange(defaultPath);
      
      logger.debug('✅ Directory tree initialization completed successfully', {
        defaultPath,
        selectedPath: defaultPath,
        operation: 'init-success'
      });
      
    } catch (err: any) {
      logger.error('❌ Directory tree initialization failed', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        operation: 'init-error'
      });
      
      // Check if this is a NAS unavailable error
      if (err?.response?.data?.nas_unavailable) {
        const nasErrorMsg = '⚠️ NAS Storage Unavailable';
        setError(nasErrorMsg);
        toast.error('NAS storage is not mounted or accessible');
        
        logger.error('💾 NAS storage unavailable', {
          nasUnavailable: true,
          responseData: err.response?.data
        });
      } else {
        const errorMsg = 'Failed to load directory tree';
        setError(errorMsg);
        if (!isOfflineApiError(err)) {
          toast.error(errorMsg);
        }
        
        logger.error('🌳 General directory tree load failure', {
          isOfflineError: isOfflineApiError(err),
          error: err instanceof Error ? err.message : String(err)
        });
      }
      onDirectoryLoaded?.(false);
    } finally {
      setIsLocalLoading(false);
      
      const initEnd = performance.now();
      const totalTime = initEnd - initStart;
      debug(`Complete directory initialization took ${totalTime.toFixed(2)}ms`);
      
      logger.debug('🏁 Directory initialization completed', {
        totalTimeMs: totalTime,
        operation: 'init-complete'
      });
    }
  }, [loadHierarchicalTree, expandPathToTarget, onPathChange, onDirectoryLoaded, toast, api, logger, selectedPath]);

  // Regular refresh - reloads entire tree
  const refreshTree = useCallback(async () => {
    debug('Refreshing tree - invalidating cache');
    
    // Complete reset - clear state first
    setTreeData([]);
    setIsLocalLoading(true);
    
    // Invalidate cache
    // debug('Invalidating cache for path and children');
    invalidateCache('/mnt/nas'); 
    
    try {
      // debug('Loading fresh tree data after cache invalidation');
      setError(null);
      
      // Force fresh API call
              // debug('Forcing fresh API call for /mnt/nas');
      const entries = await loadDirectoryHierarchical('/mnt/nas', true);
              // debug('API returned fresh data, entries count:', entries.length);
              // debug('Entries received:', entries.map(e => e.name).join(', '));
      
      // Update state with new data
      setTreeData(entries);
      setSelectedPath('/mnt/nas');
      onPathChange('/mnt/nas');
      onDirectoryLoaded?.(true);
      
              // debug('Tree refresh completed, calling onRefresh callback');
      onRefresh?.();
    } catch (err: any) {
      logger.error('Failed to refresh directory tree:', err);
      
      // Check if this is a NAS unavailable error
      if (err?.response?.data?.nas_unavailable) {
        const nasErrorMsg = '⚠️ NAS Storage Unavailable';
        setError(nasErrorMsg);
        toast.error('NAS storage is not mounted or accessible');
      } else {
        const errorMsg = 'Failed to refresh directory tree';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } finally {
      setIsLocalLoading(false);
    }
  }, [loadDirectoryHierarchical, invalidateCache, onRefresh, onPathChange, onDirectoryLoaded, toast]);

  // Expose refreshTree method via ref
  useImperativeHandle(ref, () => ({
    refreshTree
  }), [refreshTree]);

  // Handle directory selection
  const handleEntrySelect = useCallback((entry: DirectoryEntry) => {
    setSelectedPath(entry.path);
    onPathChange(entry.path);
  }, [onPathChange]);

  // Handle directory expansion toggle
  const handleToggleExpansion = useCallback(async (entry: DirectoryEntry, event: React.MouseEvent) => {
    // Performance timing for the entire operation
    const expandStart = performance.now();
    
    event.stopPropagation(); // Prevent selection when clicking expand/collapse
    
    // Click lifecycle logging removed after verification

    logger.debug('🔧 Expand button clicked', {
      path: entry.path,
      hasChildren: entry.hasChildren,
      isExpanded: entry.isExpanded,
      isLoading: entry.isLoading,
      childrenCount: entry.children?.length || 0,
      eventType: event.type,
      timestamp: new Date().toISOString()
    });
    
    // Prevent multiple clicks while loading
    if (entry.isLoading) {
      logger.debug('🚫 Click ignored - directory already loading', {
        path: entry.path,
        loadingState: entry.isLoading
      });
      return;
    }
    
    // Log initial state before any changes
    debugState.stateChange('DirectoryEntry', 'pre-expansion', {
      path: entry.path,
      isExpanded: entry.isExpanded,
      isLoading: entry.isLoading,
      hasChildren: entry.hasChildren,
      childrenCount: entry.children?.length || 0
    }, null);
    
    // Rely on global store to manage loading/expanded state to avoid UI/store races
    // Dispatch to store
    
    logger.debug('🚀 Initiating server request', {
      path: entry.path,
      operation: 'toggleDirectoryExpansion',
      cacheState: directoryCache[entry.path] ? 'cached' : 'not-cached',
      timestamp: new Date().toISOString()
    });
    
    try {
      // Track the actual toggle operation
      const toggleResult = await debugPerformance.timeAsync(
        `Directory expansion toggle: ${entry.path}`,
        () => toggleDirectoryExpansion(entry.path)
      );
      
      // Store toggle resolved

      logger.debug('✅ Server response received', {
        path: entry.path,
        toggleResult,
        operation: 'toggle-completed'
      });
      
      // Force a state refresh by getting the updated tree
      const updatedTree = getDirectoryTree('/mnt/nas');
      if (updatedTree) {
        logger.debug('🔄 Updating tree data from store', {
          path: entry.path,
          newTreeEntryCount: updatedTree.length,
          operation: 'tree-refresh',
          cacheKeys: Object.keys(directoryCache)
        });
        
        debugState.stateChange('TreeData', 'server-response-update', treeData, updatedTree);
        // Sync UI with store cache
        setTreeData(updatedTree);
        
        // Find and log the updated entry state
        const findUpdatedEntry = (entries: DirectoryEntry[], targetPath: string): DirectoryEntry | null => {
          for (const e of entries) {
            if (e.path === targetPath) return e;
            if (e.children) {
              const found = findUpdatedEntry(e.children, targetPath);
              if (found) return found;
            }
          }
          return null;
        };
        
        const updatedEntry = findUpdatedEntry(updatedTree, entry.path);
        if (updatedEntry) {
          logger.debug('📊 Final entry state after toggle', {
            path: updatedEntry.path,
            isExpanded: updatedEntry.isExpanded,
            isLoading: updatedEntry.isLoading,
            hasChildren: updatedEntry.hasChildren,
            childrenCount: updatedEntry.children?.length || 0,
            wasExpanded: entry.isExpanded,
            operation: 'success'
          });
        }
      } else {
        logger.warn('⚠️ No updated tree found after expansion toggle', {
          path: entry.path,
          cacheState: directoryCache['/mnt/nas'] ? 'has-root-cache' : 'no-root-cache',
          operation: 'tree-refresh-failed'
        });
        // No updated tree found after toggle
        
        // Reset loading state if no tree found
        setTreeData(prevTreeData => {
          const resetEntryLoading = (entries: DirectoryEntry[]): DirectoryEntry[] => {
            return entries.map(e => {
              if (e.path === entry.path) {
                logger.debug('🔄 Resetting loading state due to missing tree', {
                  path: e.path,
                  wasLoading: e.isLoading
                });
                // Local reset loading due to missing tree
                return { ...e, isLoading: false };
              }
              if (e.children) {
                return { ...e, children: resetEntryLoading(e.children) };
              }
              return e;
            });
          };
          return resetEntryLoading(prevTreeData);
        });
      }
    } catch (error) {
      logger.error('❌ Directory expansion failed', {
        path: entry.path,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        operation: 'toggle-error'
      });
      // Toggle failed
      
      toast.error('Failed to expand directory');
      
      // Reset loading state on error
      setTreeData(prevTreeData => {
        const resetEntryLoading = (entries: DirectoryEntry[]): DirectoryEntry[] => {
          return entries.map(e => {
            if (e.path === entry.path) {
              logger.debug('🔄 Resetting loading state due to error', {
                path: e.path,
                wasLoading: e.isLoading,
                errorMessage: error instanceof Error ? error.message : String(error)
              });
              return { ...e, isLoading: false };
            }
            if (e.children) {
              return { ...e, children: resetEntryLoading(e.children) };
            }
            return e;
          });
        };
        const resetTree = resetEntryLoading(prevTreeData);
        debugState.stateChange('TreeData', 'error-recovery', prevTreeData, resetTree);
        return resetTree;
      });
    } finally {
      // Log final performance metrics
      const expandEnd = performance.now();
      const totalTime = expandEnd - expandStart;
      debug(`Complete expand operation for ${entry.path} took ${totalTime.toFixed(2)}ms`);
      
      logger.debug('🏁 Expand operation completed', {
        path: entry.path,
        totalTimeMs: totalTime,
        operation: 'complete',
        finalTreeSize: treeData.length
      });
      // Toggle lifecycle complete
    }
  }, [toggleDirectoryExpansion, getDirectoryTree, toast, logger, directoryCache, treeData]);

  // Breadcrumb navigation
  const renderBreadcrumbs = useCallback(() => {
    const pathParts = selectedPath.split('/').filter(Boolean);
    const breadcrumbs = [{ name: 'nas', path: '/mnt/nas' }];
    
    let currentPath = '/mnt/nas';
    for (const part of pathParts.slice(2)) { // Skip 'mnt' and 'nas'
      currentPath = `${currentPath}/${part}`;
      breadcrumbs.push({ name: part, path: currentPath });
    }

    return (
      <div className="breadcrumb-navigation">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.path}>
            <span
              className={`breadcrumb-item ${crumb.path === selectedPath ? 'current' : ''}`}
              onClick={() => {
                if (crumb.path !== selectedPath) {
                  handleEntrySelect({ name: crumb.name, path: crumb.path, type: 'directory' });
                }
              }}
              style={{
                cursor: crumb.path !== selectedPath ? 'pointer' : 'default',
                fontWeight: crumb.path === selectedPath ? 'bold' : 'normal'
              }}
            >
              {crumb.name}
            </span>
            {index < breadcrumbs.length - 1 && (
              <span className="breadcrumb-separator"> / </span>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }, [selectedPath, handleEntrySelect]);

  // Initialize once when component becomes active
  useEffect(() => {
    if (!isActive || isInitialized.current) {
      return;
    }
    isInitialized.current = true;
    void initializeTree();
  }, [isActive, initializeTree]);

  // Monitor tree data changes for debugging
  useEffect(() => {
    // debug('Tree data updated:', treeData.length, 'entries');
    // debug('Entry names:', treeData.map(entry => entry.name));
  }, [treeData]);

  // Keep UI in sync with store changes
  useEffect(() => {
    const updatedTree = getDirectoryTree('/mnt/nas');
    if (updatedTree && JSON.stringify(updatedTree) !== JSON.stringify(treeData)) {
      logger.debug('🔄 Syncing tree data with store changes', {
        operation: 'store-sync',
        oldTreeSize: treeData.length,
        newTreeSize: updatedTree.length,
        cacheKeys: Object.keys(directoryCache),
        triggeredBy: 'directoryCache-change'
      });
      
      debugState.stateChange('TreeData', 'store-sync', treeData, updatedTree);
      setTreeData(updatedTree);
    }
  }, [directoryCache, getDirectoryTree, treeData, logger]);

  const renderDirectory = useCallback((entry: DirectoryEntry, depth = 0, isLast = false, parentLines: boolean[] = []) => {
    const cachedData = directoryCache[entry.path];
    const isLoading = cachedData?.isLoading || entry.isLoading;
    const hasChildren = entry.hasChildren || (entry.children && entry.children.length > 0);
    const isExpanded = entry.isExpanded || false;

    return (
      <React.Fragment key={entry.path}>
        <div
          className={`directory-entry ${selectedPath === entry.path ? 'selected' : ''} ${isLoading ? 'loading' : ''}`}
          onClick={() => handleEntrySelect(entry)}
          style={{ 
            position: 'relative',
            paddingLeft: `${24 * depth + 12}px`,
            marginBottom: '2px',
            borderRadius: '8px'
          }}
          role="treeitem"
          aria-selected={selectedPath === entry.path}
          aria-expanded={hasChildren ? isExpanded : undefined}
        >
          {/* Tree lines */}
          {depth > 0 && parentLines.map((isLine, index) => (
            <div
              key={index}
              className="tree-line vertical"
              style={{
                position: 'absolute',
                left: `${24 * index + 6}px`,
                top: 0,
                bottom: 0,
                width: '1px',
                background: isLine ? '#e0e0e0' : 'transparent'
              }}
            />
          ))}
          {depth > 0 && (
            <div
              className="tree-line horizontal"
              style={{
                position: 'absolute',
                left: `${24 * (depth - 1) + 6}px`,
                width: '16px',
                height: '1px',
                top: '50%',
                background: '#e0e0e0'
              }}
            />
          )}
          
          {/* Expand/collapse control */}
          {hasChildren && (
            <span 
              className="expand-control"
              onClick={(e) => handleToggleExpansion(entry, e)}
              style={{
                cursor: 'pointer',
                marginRight: '4px',
                userSelect: 'none',
                fontSize: '12px',
                width: '24px',
                height: '24px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'background-color 0.2s ease'
              }}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isLoading ? '⟳' : (isExpanded ? '▼' : '▶')}
            </span>
          )}
          {!hasChildren && (
            <span style={{ width: '28px', display: 'inline-block' }}></span>
          )}
          
          <span className="entry-icon">📁</span>
          <span className="entry-name">{entry.name}</span>
          {selectedPath === entry.path && (
            <span className="entry-selected" aria-hidden="true">✓</span>
          )}
          {isLoading && <LoadingSpinner size="small" />}
        </div>
        {/* Render children only if expanded */}
        {isExpanded && entry.children?.map((child, index, array) => 
          renderDirectory(
            child, 
            depth + 1, 
            index === array.length - 1,
            [...parentLines, index < array.length - 1]
          )
        )}
      </React.Fragment>
    );
  }, [selectedPath, handleEntrySelect, handleToggleExpansion, directoryCache]);

  if (!isActive && !isAdmin) {
    return null;
  }

  return (
    <div className="directory-browser">
      <div className="directory-browser-header">
        <button 
          onClick={refreshTree} 
          className="refresh-button" 
          disabled={isLocalLoading || isAdminLoading}
          title="Refresh Directory Tree"
        >
          {isLocalLoading ? <LoadingSpinner size="small" /> : '🔄'} 
        </button>
        {isAdmin && (
          <>
            <button 
              onClick={onForceAllowUpload} 
              className="admin-button force-allow-button"
              disabled={isAdminLoading || isLocalLoading}
              title="Force Allow Upload (Admin)"
            >
              🛡️ Allow
            </button>
            <button 
              onClick={onSetDefaultDirectory} 
              className="admin-button set-default-button"
              disabled={isAdminLoading || isLocalLoading}
              title="Set as Default Directory (Admin)"
            >
              📌 Default
            </button>
            <button 
              onClick={onManageBlacklist} 
              className="admin-button blacklist-button"
              disabled={isAdminLoading || isLocalLoading}
              title="Manage Blacklist (Admin)"
            >
              🚫 Blacklist
            </button>
            <button 
              onClick={onViewHistory}
              className="admin-button upload-history-button"
              disabled={isAdminLoading || isLocalLoading}
              title="View Upload History (Admin)"
            >
              📜 History
            </button>
            {onTogglePinRequirement && (
              <button 
                onClick={onTogglePinRequirement} 
                disabled={isLocalLoading || isAdminLoading || isSavingPinStatus} 
                title={isPinRequiredForUpload ? "Disable PIN requirement for uploads (Currently Active)" : "Enable PIN requirement for uploads (Currently Off)"}
                className={`toggle-pin-button ${isPinRequiredForUpload ? 'active' : ''}`}
                aria-label={`Toggle PIN requirement (currently ${isPinRequiredForUpload ? 'enabled' : 'disabled'})`}
              >
                {isSavingPinStatus && <LoadingSpinner size="small" />}
              </button>
            )}
          </>
        )}
      </div>

      {/* Breadcrumb navigation */}
      {!error && selectedPath && (
        <div className="directory-breadcrumb-container">
          {renderBreadcrumbs()}
        </div>
      )}

      {error && (
        <div 
          className={`directory-error ${error.includes('⚠️ NAS Storage Unavailable') ? 'nas-unavailable' : ''}`}
          data-nas-unavailable={error.includes('⚠️ NAS Storage Unavailable') ? 'true' : 'false'}
        >
          {error}
        </div>
      )}
      
      {isLocalLoading && treeData.length === 0 && (
        <div className="directory-loading-initial">
          <LoadingSpinner size="large" />
        </div>
      )}

      {!isLocalLoading || treeData.length > 0 ? (
        <div className="directory-tree-container">
          {treeData.length > 0 
            ? treeData.map((entry, index) => renderDirectory(entry, 0, index === treeData.length - 1))
            : !isLocalLoading && <div className="directory-empty">Directory is empty or inaccessible.</div>
          }
        </div>
      ) : null}
    </div>
  );
});

DirectoryBrowser.displayName = 'DirectoryBrowser';