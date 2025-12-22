# HOMESERVER Backup API Examples

## Overview

This document provides examples of how the backup system integrates with the frontend UI for restore operations.

## API Endpoints

### 1. List Available Backups

**Endpoint**: `GET /api/backup/list`
**Description**: Lists all available backups from all configured providers

**Response**:
```json
[
  {
    "name": "homeserver_backup_20241201_020000.encrypted",
    "size": 1048576,
    "provider": "aws_s3",
    "mtime": "2024-12-01T02:00:00"
  },
  {
    "name": "homeserver_backup_20241130_020000.encrypted", 
    "size": 1048576,
    "provider": "local",
    "path": "/var/www/homeserver/backup/homeserver_backup_20241130_020000.encrypted",
    "mtime": "2024-11-30T02:00:00"
  }
]
```

### 2. Get Backup Metadata

**Endpoint**: `GET /api/backup/metadata?provider=aws_s3&backup_name=homeserver_backup_20241201_020000.encrypted`
**Description**: Gets detailed metadata about a specific backup

**Response**:
```json
{
  "timestamp": "20241201_020000",
  "backup_name": "homeserver_backup_20241201_020000",
  "items": [
    {
      "source_path": "/var/www/homeserver/src",
      "backup_name": "src",
      "type": "directory",
      "size": 524288,
      "permissions": "755",
      "owner": "33:33",
      "mtime": "2024-12-01T01:45:00"
    },
    {
      "source_path": "/var/lib/gogs",
      "backup_name": "gogs", 
      "type": "directory",
      "size": 1048576,
      "permissions": "755",
      "owner": "1000:1000",
      "mtime": "2024-12-01T01:30:00"
    }
  ],
  "created_at": "2024-12-01T02:00:00",
  "homeserver_version": "1.0.0"
}
```

### 3. Restore Backup

**Endpoint**: `POST /api/backup/restore`
**Description**: Restores specific items from a backup

**Request Body**:
```json
{
  "backup_name": "homeserver_backup_20241201_020000.encrypted",
  "provider": "aws_s3",
  "items": [
    {
      "source_name": "src",
      "target_path": "/var/www/homeserver/src",
      "type": "directory",
      "owner": "www-data:www-data",
      "permissions": "755"
    },
    {
      "source_name": "homeserver.json",
      "target_path": "/etc/homeserver/homeserver.json", 
      "type": "file",
      "owner": "www-data:www-data",
      "permissions": "644"
    }
  ],
  "backup_existing": true,
  "dry_run": false
}
```

**Response**:
```json
{
  "success": true,
  "restored_items": [
    "/var/www/homeserver/src",
    "/etc/homeserver/homeserver.json"
  ],
  "failed_items": [],
  "backed_up_items": [
    "/var/www/homeserver/src.backup.1701234567"
  ]
}
```

## Frontend Integration Examples

### 1. Backup Selection Component

```typescript
interface BackupItem {
  name: string;
  size: number;
  provider: string;
  mtime: string;
  path?: string;
}

const BackupSelector = () => {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);

  useEffect(() => {
    // Load available backups
    fetch('/api/backup/list')
      .then(res => res.json())
      .then(setBackups);
  }, []);

  const loadMetadata = (backupName: string, provider: string) => {
    fetch(`/api/backup/metadata?provider=${provider}&backup_name=${backupName}`)
      .then(res => res.json())
      .then(setMetadata);
  };

  return (
    <div>
      <h3>Select Backup to Restore</h3>
      <select 
        value={selectedBackup || ''} 
        onChange={(e) => {
          setSelectedBackup(e.target.value);
          const backup = backups.find(b => b.name === e.target.value);
          if (backup) loadMetadata(backup.name, backup.provider);
        }}
      >
        <option value="">Select a backup...</option>
        {backups.map(backup => (
          <option key={backup.name} value={backup.name}>
            {backup.name} ({backup.provider}) - {new Date(backup.mtime).toLocaleString()}
          </option>
        ))}
      </select>
      
      {metadata && (
        <BackupContents 
          metadata={metadata} 
          onRestore={handleRestore}
        />
      )}
    </div>
  );
};
```

### 2. Backup Contents Selection

```typescript
interface RestoreItem {
  source_name: string;
  target_path: string;
  type: 'file' | 'directory';
  owner?: string;
  permissions?: string;
}

const BackupContents = ({ metadata, onRestore }: { 
  metadata: any; 
  onRestore: (items: RestoreItem[]) => void;
}) => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [customPaths, setCustomPaths] = useState<Record<string, string>>({});

  const toggleItem = (itemName: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemName)) {
      newSelected.delete(itemName);
    } else {
      newSelected.add(itemName);
    }
    setSelectedItems(newSelected);
  };

  const updateTargetPath = (itemName: string, path: string) => {
    setCustomPaths(prev => ({ ...prev, [itemName]: path }));
  };

  const handleRestore = () => {
    const restoreItems: RestoreItem[] = Array.from(selectedItems).map(itemName => {
      const item = metadata.items.find((i: any) => i.backup_name === itemName);
      return {
        source_name: itemName,
        target_path: customPaths[itemName] || item.source_path,
        type: item.type,
        owner: item.owner,
        permissions: item.permissions
      };
    });

    onRestore(restoreItems);
  };

  return (
    <div>
      <h4>Select Items to Restore</h4>
      {metadata.items.map((item: any) => (
        <div key={item.backup_name} className="restore-item">
          <label>
            <input
              type="checkbox"
              checked={selectedItems.has(item.backup_name)}
              onChange={() => toggleItem(item.backup_name)}
            />
            {item.backup_name} ({item.type}) - {item.size} bytes
          </label>
          
          {selectedItems.has(item.backup_name) && (
            <div className="restore-config">
              <label>
                Target Path:
                <input
                  type="text"
                  value={customPaths[item.backup_name] || item.source_path}
                  onChange={(e) => updateTargetPath(item.backup_name, e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      ))}
      
      <button onClick={handleRestore} disabled={selectedItems.size === 0}>
        Restore Selected Items
      </button>
    </div>
  );
};
```

### 3. Restore Progress Component

```typescript
const RestoreProgress = ({ restoreId }: { restoreId: string }) => {
  const [status, setStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`/api/backup/restore/status/${restoreId}`)
        .then(res => res.json())
        .then(data => {
          setStatus(data.status);
          setProgress(data.progress);
          setLogs(data.logs);
        });
    }, 1000);

    return () => clearInterval(interval);
  }, [restoreId]);

  return (
    <div>
      <h4>Restore Progress</h4>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>
      <p>Status: {status}</p>
      
      <div className="logs">
        {logs.map((log, index) => (
          <div key={index} className="log-entry">{log}</div>
        ))}
      </div>
    </div>
  );
};
```

## Backend Implementation Notes

### 1. Flask Route Examples

```python
@app.route('/api/backup/list', methods=['GET'])
def list_backups():
    """List all available backups."""
    try:
        result = subprocess.run([
            'sudo', '-u', 'www-data', 
            '/var/www/homeserver/backup/list_backups.py', 'all'
        ], capture_output=True, text=True, check=True)
        
        backups = json.loads(result.stdout)
        return jsonify(backups)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/backup/metadata', methods=['GET'])
def get_backup_metadata():
    """Get metadata for a specific backup."""
    provider = request.args.get('provider')
    backup_name = request.args.get('backup_name')
    
    try:
        result = subprocess.run([
            'sudo', '-u', 'www-data',
            '/var/www/homeserver/backup/list_backups.py', 
            provider, '--metadata', backup_name
        ], capture_output=True, text=True, check=True)
        
        metadata = json.loads(result.stdout)
        return jsonify(metadata)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/backup/restore', methods=['POST'])
def restore_backup():
    """Restore specific items from a backup."""
    restore_config = request.json
    
    # Write restore config to temp file
    config_file = f"/tmp/restore_config_{uuid.uuid4()}.json"
    with open(config_file, 'w') as f:
        json.dump(restore_config, f)
    
    try:
        result = subprocess.run([
            'sudo', '-u', 'www-data',
            '/var/www/homeserver/backup/restore_service.py',
            config_file
        ], capture_output=True, text=True, check=True)
        
        # Parse result and return
        return jsonify({'success': True, 'output': result.stdout})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up temp file
        os.unlink(config_file)
```

### 2. Security Considerations

- All restore operations run as `www-data` user
- Input validation on all restore paths
- Backup existing files before overwriting
- Log all restore operations for audit
- Validate restore permissions and ownership

### 3. Error Handling

- Comprehensive error messages for failed operations
- Rollback capability for failed restores
- Detailed logging for troubleshooting
- User-friendly error reporting in UI

This API design provides a complete restore workflow that integrates seamlessly with the HOMESERVER backup system while maintaining security and usability.
