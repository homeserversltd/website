# Backblaze B2 Provider

**HOMESERVER Backup System - Backblaze B2 Integration**

## Overview

The Backblaze B2 provider offers enterprise-grade cloud storage integration for the HOMESERVER backup system. It provides reliable, cost-effective cloud storage with advanced features including encryption, bandwidth throttling, connection pooling, and comprehensive error handling.

## Features

### Core Functionality
- **File Upload/Download**: Reliable file transfer with retry logic
- **File Management**: List, delete, and manage files in B2 buckets
- **Connection Testing**: Comprehensive connectivity validation
- **Error Handling**: Robust error handling with exponential backoff

### Advanced Features
- **Encryption**: Client-side encryption using Fernet (AES-256)
- **Bandwidth Throttling**: Rate limiting to respect network constraints
- **Connection Pooling**: Efficient connection management
- **Multipart Uploads**: Automatic handling of large files
- **Progress Tracking**: Real-time upload/download progress
- **Retry Logic**: Configurable retry attempts with exponential backoff

### Enterprise Features
- **Account Information**: Detailed account and usage statistics
- **Bucket Management**: Comprehensive bucket information and metadata
- **Lifecycle Management**: File lifecycle and retention policies
- **Storage Analytics**: Usage statistics and monitoring
- **Security**: Application key restrictions and access controls

## Configuration

### Required Settings

```json
{
  "backblaze": {
    "enabled": true,
    "application_key_id": "K0052b835fcc4fa40000000001",
    "application_key": "K005nURrQ++tCOEIEBlYH19ffnrGZgI",
    "bucket": "homeServer-serverGenesis",
    "region": "us-west-000"
  }
}
```

### Optional Settings

```json
{
  "backblaze": {
    "max_retries": 3,
    "retry_delay": 1.0,
    "timeout": 300,
    "max_bandwidth": null,
    "upload_chunk_size": 104857600,
    "encryption_enabled": false,
    "encryption_key": null,
    "encryption_salt": null,
    "connection_pool_size": 5
  }
}
```

### Configuration Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | false | Enable/disable the provider |
| `application_key_id` | string | - | Backblaze application key ID |
| `application_key` | string | - | Backblaze application key |
| `bucket` | string | - | B2 bucket name |
| `region` | string | us-west-000 | B2 region |
| `max_retries` | integer | 3 | Maximum retry attempts |
| `retry_delay` | float | 1.0 | Base delay between retries (seconds) |
| `timeout` | integer | 300 | Request timeout (seconds) |
| `max_bandwidth` | integer | null | Bandwidth limit (bytes/second) |
| `upload_chunk_size` | integer | 104857600 | Chunk size for large uploads (bytes) |
| `encryption_enabled` | boolean | false | Enable client-side encryption |
| `encryption_key` | string | null | Encryption key (auto-generated if null) |
| `encryption_salt` | string | null | Encryption salt (auto-generated if null) |
| `connection_pool_size` | integer | 5 | Maximum connections in pool |

## Setup Instructions

### 1. Create Backblaze B2 Account

1. Visit [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html)
2. Sign up for a B2 Cloud Storage account
3. Create a new bucket for HOMESERVER backups

### 2. Generate Application Keys

1. Navigate to **App Keys** in your B2 account
2. Click **Add a New Application Key**
3. Configure key settings:
   - **Key Name**: `HOMESERVER-Backup`
   - **Allow access to Bucket(s)**: Select your backup bucket
   - **Type of Access**: `Read and Write`
4. Save the **Key ID** and **Application Key**

### 3. Configure HOMESERVER

Use the backup CLI to configure credentials:

```bash
# Set Backblaze credentials
./backup-venv set-credentials backblaze \
  --username "K0052b835fcc4fa40000000001" \
  --password "K005nURrQ++tCOEIEBlYH19ffnrGZgI"

# Enable the provider
./backup-venv enable-provider backblaze

# Test the connection
./backup-venv test-providers
```

## Usage Examples

### Basic Operations

```bash
# Create a backup
./backup-venv create

# List available backups
./backup-venv list

# Download a backup
./backup-venv download homeserver_backup_20250911_100606.tar.encrypted

# Test provider connection
./backup-venv test-providers
```

### Advanced Configuration

```bash
# Set bandwidth limit (1 MB/s)
./backup-venv set-config backblaze max_bandwidth 1048576

# Enable encryption
./backup-venv set-config backblaze encryption_enabled true

# Set custom retry settings
./backup-venv set-config backblaze max_retries 5
./backup-venv set-config backblaze retry_delay 2.0
```

## API Reference

### Core Methods

#### `upload(file_path, remote_name, progress_callback=None)`
Upload a file to Backblaze B2.

**Parameters:**
- `file_path` (Path): Local file path to upload
- `remote_name` (str): Remote filename in B2
- `progress_callback` (callable, optional): Progress callback function

**Returns:** `bool` - Success status

#### `download(remote_name, local_path, progress_callback=None)`
Download a file from Backblaze B2.

**Parameters:**
- `remote_name` (str): Remote filename in B2
- `local_path` (Path): Local destination path
- `progress_callback` (callable, optional): Progress callback function

**Returns:** `bool` - Success status

#### `list_files(prefix="", max_files=1000)`
List files in the B2 bucket.

**Parameters:**
- `prefix` (str): File name prefix filter
- `max_files` (int): Maximum number of files to return

**Returns:** `List[Dict[str, Any]]` - List of file information

#### `delete(remote_name)`
Delete a file from Backblaze B2.

**Parameters:**
- `remote_name` (str): Remote filename to delete

**Returns:** `bool` - Success status

#### `test_connection()`
Test connection to Backblaze B2.

**Returns:** `bool` - Connection status

### Advanced Methods

#### `get_bucket_info()`
Get detailed bucket information.

**Returns:** `Dict[str, Any]` - Bucket metadata

#### `get_account_info()`
Get account information and capabilities.

**Returns:** `Dict[str, Any]` - Account details

#### `get_storage_usage()`
Get storage usage statistics.

**Returns:** `Dict[str, Any]` - Usage metrics

#### `set_bandwidth_limit(bytes_per_second)`
Set bandwidth limit for transfers.

**Parameters:**
- `bytes_per_second` (int): Bandwidth limit in bytes per second

#### `get_bandwidth_usage()`
Get current bandwidth usage statistics.

**Returns:** `Dict[str, Any]` - Bandwidth metrics

## Error Handling

The provider includes comprehensive error handling:

### Connection Errors
- **B2ConnectionError**: Network connectivity issues
- **B2RequestTimeout**: Request timeout errors
- **B2SimpleError**: API-specific errors

### Retry Logic
- Configurable retry attempts (default: 3)
- Exponential backoff delay
- Automatic reconnection on failures

### Error Recovery
- Automatic API reinitialization
- Connection pool management
- Graceful degradation on failures

## Security Features

### Authentication
- Application key-based authentication
- Key restriction to specific buckets
- Secure credential storage

### Encryption
- Client-side encryption using Fernet (AES-256)
- PBKDF2 key derivation
- Configurable encryption keys and salts

### Access Control
- Bucket-level access restrictions
- Application key capabilities
- File-level permissions

## Performance Optimization

### Bandwidth Management
- Configurable bandwidth limits
- Real-time rate monitoring
- Automatic throttling

### Connection Pooling
- Reusable connections
- Configurable pool size
- Connection lifecycle management

### Large File Handling
- Automatic multipart uploads
- Chunked transfer processing
- Progress tracking

## Monitoring and Logging

### Logging Levels
- **INFO**: General operations and status
- **WARNING**: Non-critical issues and retries
- **ERROR**: Failures and critical issues
- **DEBUG**: Detailed operation information

### Metrics Available
- Upload/download success rates
- Bandwidth utilization
- Connection pool status
- Retry attempt statistics
- Storage usage metrics

## Troubleshooting

### Common Issues

#### Authentication Failures
```
ERROR: B2 API initialization failed: Application key is restricted to bucket: homeServer-serverGenesis
```
**Solution**: Ensure the application key has access to the correct bucket.

#### Connection Timeouts
```
ERROR: B2 connection test failed - network error: Connection timeout
```
**Solution**: Check network connectivity and increase timeout settings.

#### File Not Found
```
ERROR: File not found in B2: backup_file.tar.encrypted
```
**Solution**: Verify the file exists and check the bucket name configuration.

### Debug Mode

Enable debug logging for detailed troubleshooting:

```python
import logging
logging.getLogger('homeserver_backup.backblaze').setLevel(logging.DEBUG)
```

### Health Checks

```bash
# Test provider connection
./backup-venv test-providers

# Check provider status
./backup-venv get-provider-status backblaze

# List files to verify connectivity
./backup-venv list
```

## Best Practices

### Security
1. Use application keys with minimal required permissions
2. Enable client-side encryption for sensitive data
3. Regularly rotate application keys
4. Monitor access logs for suspicious activity

### Performance
1. Set appropriate bandwidth limits based on network capacity
2. Use connection pooling for high-volume operations
3. Monitor storage usage and implement lifecycle policies
4. Test with realistic file sizes and volumes

### Reliability
1. Configure appropriate retry settings for your network
2. Monitor error rates and adjust timeouts accordingly
3. Implement backup verification procedures
4. Test disaster recovery scenarios regularly

## Support

For issues specific to the Backblaze B2 provider:

1. Check the troubleshooting section above
2. Review Backblaze B2 documentation
3. Enable debug logging for detailed error information
4. Contact HOMESERVER support with specific error messages

## Changelog

### Version 1.0.0
- Initial implementation with core functionality
- Support for file upload/download/list/delete
- Basic error handling and retry logic
- Configuration management

### Version 1.1.0
- Added encryption support
- Implemented bandwidth throttling
- Added connection pooling
- Enhanced error handling

### Version 1.2.0
- Fixed B2 SDK API compatibility issues
- Improved file listing with proper filtering
- Added comprehensive monitoring
- Enhanced documentation

---

**Copyright (C) 2024 HOMESERVER LLC - All rights reserved.**