# Setting Up New Backup Providers

**HOMESERVER Backup System - Provider Integration Guide**

*Based on real-world experience integrating Backblaze B2 provider*

## Overview

This guide provides a step-by-step process for integrating new cloud storage providers into the HOMESERVER backup system. It's based on our successful integration of Backblaze B2 and covers all the lessons learned, common pitfalls, and best practices.

## Prerequisites

Before starting, ensure you have:
- Access to the target cloud storage service
- Valid API credentials for the service
- Understanding of the service's API limitations and quirks
- Test environment for development and testing

## Step-by-Step Integration Process

### 1. Research and Analysis

#### Service Capabilities Assessment
- **API Documentation**: Study the official API docs thoroughly
- **Rate Limits**: Understand request limits and throttling mechanisms
- **Authentication**: Identify required credentials and auth methods
- **File Operations**: Verify support for upload, download, list, delete
- **Error Handling**: Review error codes and retry recommendations
- **SDK Availability**: Check for official Python SDKs or REST API options

#### HOMESERVER Requirements Mapping
- **BaseProvider Interface**: Ensure the service can implement all required methods
- **Configuration Schema**: Plan how service settings will map to our config structure
- **Error Types**: Identify which errors need special handling
- **Progress Tracking**: Determine if the service supports upload/download progress
- **Large File Handling**: Check for multipart upload capabilities

### 2. Provider Class Implementation

#### Create Provider File
```bash
# Create new provider file
touch src/providers/new_provider.py
```

#### Implement BaseProvider Interface
```python
"""
New Provider Implementation
Copyright (C) 2024 HOMESERVER LLC

Provider for [Service Name] storage.
"""

from typing import List, Dict, Any, Optional, Callable
from pathlib import Path
from .base import BaseProvider

class NewProvider(BaseProvider):
    """[Service Name] provider implementation."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        # Initialize service-specific configuration
        self._initialize_service()
    
    def upload(self, file_path: Path, remote_name: str, progress_callback: Optional[Callable] = None) -> bool:
        """Upload file to service."""
        pass
    
    def download(self, remote_name: str, local_path: Path, progress_callback: Optional[Callable] = None) -> bool:
        """Download file from service."""
        pass
    
    def list_files(self, prefix: str = "", max_files: int = 1000) -> List[Dict[str, Any]]:
        """List files in service storage."""
        pass
    
    def delete(self, remote_name: str) -> bool:
        """Delete file from service."""
        pass
    
    def test_connection(self) -> bool:
        """Test connection to service."""
        pass
```

#### Key Implementation Patterns

**Configuration Validation**
```python
def _validate_config(self) -> bool:
    """Validate service-specific configuration."""
    required_fields = ['api_key', 'bucket_name']
    for field in required_fields:
        if not self.config.get(field):
            self.logger.error(f"Missing required field: {field}")
            return False
    return True
```

**Error Handling with Retry Logic**
```python
def _upload_with_retry(self, file_path: Path, remote_name: str) -> bool:
    """Upload with retry logic."""
    for attempt in range(self.max_retries):
        try:
            # Upload logic here
            return True
        except ServiceConnectionError as e:
            if attempt < self.max_retries - 1:
                time.sleep(self.retry_delay * (2 ** attempt))
            else:
                self.logger.error(f"Upload failed after {self.max_retries} attempts")
                return False
        except ServiceAPIError as e:
            self.logger.error(f"API error: {e}")
            return False
```

**Progress Callback Integration**
```python
def upload(self, file_path: Path, remote_name: str, progress_callback: Optional[Callable] = None) -> bool:
    """Upload with progress tracking."""
    if progress_callback:
        progress_callback(0, file_path.stat().st_size)
    
    # Upload logic here
    
    if progress_callback:
        progress_callback(file_path.stat().st_size, file_path.stat().st_size)
    
    return True
```

### 3. Configuration Schema Design

#### Standard Configuration Structure
```json
{
  "new_provider": {
    "enabled": false,
    "credentials_key": "new_provider",
    "container": "homeserver-backups",
    "container_type": "bucket",
    "username": "",
    "password": "",
    "api_key": "",
    "secret_key": "",
    "region": "us-east-1",
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

#### Service-Specific Fields
Add service-specific configuration fields as needed:
- **API Endpoints**: Custom API base URLs
- **Authentication**: Service-specific auth methods
- **Regional Settings**: Service-specific region configurations
- **Feature Flags**: Enable/disable service-specific features

### 4. CLI Integration

#### Update Provider Registry
```python
# In src/providers/__init__.py
try:
    from .new_provider import NewProvider
except ImportError as e:
    print(f"WARNING: Failed to import New Provider: {e}")
    class NewProvider(BaseProvider):
        # Stub implementation
        pass

PROVIDERS = {
    'local': LocalProvider,
    'aws_s3': AWSS3Provider,
    'google_cloud_storage': GoogleCloudStorageProvider,
    'backblaze': BackblazeProvider,
    'new_provider': NewProvider  # Add new provider
}
```

#### Update Credential Mapping
```python
# In backup CLI set_provider_credentials method
def set_provider_credentials(self, provider_name: str, username: str, password: str) -> bool:
    """Set credentials for a specific provider."""
    updates = {"username": username, "password": password}
    
    # Handle provider-specific credential mapping
    if provider_name == "backblaze":
        updates["application_key_id"] = username
        updates["application_key"] = password
        updates["bucket"] = "homeServer-serverGenesis"
    elif provider_name == "aws_s3":
        updates["access_key"] = username
        updates["secret_key"] = password
    elif provider_name == "new_provider":
        updates["api_key"] = username
        updates["secret_key"] = password
        updates["container"] = "homeserver-backups"
    
    # ... rest of method
```

### 5. Testing and Validation

#### Unit Testing
```python
def test_provider_initialization():
    """Test provider initialization with valid config."""
    config = {
        'api_key': 'test_key',
        'secret_key': 'test_secret',
        'bucket_name': 'test-bucket'
    }
    provider = NewProvider(config)
    assert provider.name == 'new'
    assert provider.test_connection() == True

def test_upload_download_cycle():
    """Test complete upload/download cycle."""
    # Create test file
    test_file = Path('/tmp/test_file.txt')
    test_file.write_text('test content')
    
    # Upload file
    success = provider.upload(test_file, 'test_file.txt')
    assert success == True
    
    # Download file
    download_path = Path('/tmp/downloaded_file.txt')
    success = provider.download('test_file.txt', download_path)
    assert success == True
    assert download_path.read_text() == 'test content'
```

#### Integration Testing
```bash
# Test provider connection
./backup-venv test-providers

# Test complete backup cycle
./backup-venv test-cycle

# Test file operations
./backup-venv list
./backup-venv download <filename>
```

### 6. Common Pitfalls and Solutions

#### API Compatibility Issues
**Problem**: SDK methods don't match expected parameters
**Solution**: 
- Test SDK methods thoroughly before implementation
- Implement wrapper functions for complex API calls
- Handle different SDK versions gracefully

**Example from Backblaze**:
```python
# B2 SDK ls() method doesn't accept parameters directly
# We had to implement client-side filtering
for file_info in self.bucket.ls():
    if prefix and not file_obj.file_name.startswith(prefix):
        continue
    if len(files) >= max_files:
        break
```

#### Authentication Complexity
**Problem**: Service uses different auth methods than expected
**Solution**:
- Map service auth to our standard username/password pattern
- Implement service-specific credential handling
- Provide clear documentation for credential setup

**Example from Backblaze**:
```python
# Backblaze uses application_key_id and application_key
# We map these to username and password in CLI
if provider_name == "backblaze":
    updates["application_key_id"] = username
    updates["application_key"] = password
```

#### Error Handling Variations
**Problem**: Different services have different error types and codes
**Solution**:
- Create service-specific error handling
- Map service errors to standard retry/no-retry categories
- Implement comprehensive logging

#### File Listing Differences
**Problem**: Services return different file metadata formats
**Solution**:
- Standardize file information format
- Handle missing or optional metadata gracefully
- Implement consistent filtering and pagination

### 7. Documentation Requirements

#### Provider-Specific README
Create a comprehensive README for each provider:

```markdown
# [Service Name] Provider

## Overview
Brief description of the service and its capabilities

## Configuration
- Required settings
- Optional settings
- Parameter reference table

## Setup Instructions
- Account creation
- Credential generation
- HOMESERVER configuration

## Usage Examples
- Basic operations
- Advanced configuration
- API reference

## Troubleshooting
- Common issues
- Error messages
- Debug procedures

## Security Features
- Authentication methods
- Encryption support
- Access controls
```

#### Update Main Documentation
- Add provider to supported services list
- Update configuration examples
- Include in troubleshooting guides

### 8. Deployment and Rollout

#### Staging Deployment
1. Deploy to test environment
2. Run comprehensive test suite
3. Test with realistic data volumes
4. Validate error handling scenarios

#### Production Deployment
1. Deploy with provider disabled by default
2. Enable for testing users first
3. Monitor error rates and performance
4. Gradually roll out to all users

#### Monitoring and Maintenance
- Set up monitoring for provider-specific metrics
- Track error rates and performance
- Monitor API usage and costs
- Plan for service updates and changes

### 9. Maintenance and Updates

#### Regular Maintenance Tasks
- Monitor service API changes
- Update SDKs when new versions are available
- Review and update error handling
- Test with new service features

#### Service-Specific Considerations
- **Rate Limits**: Monitor and adjust for service limits
- **Costs**: Track usage and optimize for cost
- **Reliability**: Monitor service uptime and performance
- **Security**: Review and update security practices

### 10. Quality Assurance Checklist

#### Before Release
- [ ] All BaseProvider methods implemented
- [ ] Configuration validation working
- [ ] Error handling comprehensive
- [ ] Retry logic implemented
- [ ] Progress callbacks working
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Documentation complete
- [ ] CLI integration working
- [ ] Security review completed

#### Post-Release
- [ ] Monitoring in place
- [ ] Error tracking configured
- [ ] Performance metrics collected
- [ ] User feedback collected
- [ ] Documentation updated
- [ ] Support procedures defined

## Lessons Learned from Backblaze Integration

### What Went Well
1. **Comprehensive Provider Class**: The Backblaze provider includes advanced features like encryption, bandwidth throttling, and connection pooling
2. **Robust Error Handling**: Multiple retry mechanisms with exponential backoff
3. **Flexible Configuration**: Extensive configuration options for different use cases
4. **Good Documentation**: Detailed README with examples and troubleshooting

### Challenges Overcome
1. **API Compatibility**: B2 SDK had different method signatures than expected
2. **Credential Mapping**: Service used different auth fields than our standard pattern
3. **File Listing**: SDK returned tuples instead of objects, requiring special handling
4. **CLI Integration**: Needed to map service-specific fields to CLI parameters

### Best Practices Established
1. **Test Early and Often**: Start with simple operations and build up
2. **Handle Edge Cases**: Account for different SDK versions and API changes
3. **Comprehensive Logging**: Include debug information for troubleshooting
4. **Graceful Degradation**: Handle missing features or API limitations
5. **Documentation First**: Write documentation as you implement features

## Future Provider Integration

When integrating new providers in the future:

1. **Start with this guide** as a template
2. **Study the Backblaze implementation** as a reference
3. **Follow the established patterns** for consistency
4. **Test thoroughly** before production deployment
5. **Document everything** for future maintenance

## Support and Resources

- **Provider Documentation**: Each provider should have its own README
- **Main Backup Documentation**: Updated with new provider information
- **Troubleshooting Guides**: Service-specific issue resolution
- **API References**: Links to official service documentation
- **Community Support**: Forums and issue tracking

---

**Remember**: Every service is different. Use this guide as a foundation, but be prepared to adapt and innovate based on the specific requirements and quirks of each new provider.

**Copyright (C) 2024 HOMESERVER LLC - All rights reserved.**