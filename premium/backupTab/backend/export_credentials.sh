#!/bin/bash

# Helper script to export credentials for backup providers using keyman
# This script handles the sudo call and outputs credentials in a clean format

if [ $# -ne 1 ]; then
    echo "Usage: $0 <service_name>"
    echo "Example: $0 backblaze"
    exit 1
fi

SERVICE_NAME="$1"

# Suppress output from exportkey.sh to avoid leaking sensitive information
if ! sudo /vault/keyman/exportkey.sh "$SERVICE_NAME" >/dev/null 2>&1; then
    # Check specifically for key system initialization error
    if grep -q "ERROR: Key system not initialized" <<< "$(sudo /vault/keyman/exportkey.sh "$SERVICE_NAME" 2>&1)"; then
        echo "ERROR: Key system not initialized"
        exit 1
    fi
    echo "ERROR: Failed to export $SERVICE_NAME key"
    exit 1
fi

# Read the decrypted key content securely
if ! KEY_CONTENT=$(sudo cat "/mnt/keyexchange/$SERVICE_NAME" 2>/dev/null); then
    echo "ERROR: Failed to read $SERVICE_NAME key file"
    exit 1
fi

# Extract username and password from key content
USERNAME=""
PASSWORD=""
while IFS= read -r line; do
    if [[ "$line" =~ ^username= ]]; then
        USERNAME=$(echo "$line" | cut -d'=' -f2 | sed 's/^"//;s/"$//')
    elif [[ "$line" =~ ^password= ]]; then
        PASSWORD=$(echo "$line" | cut -d'=' -f2 | sed 's/^"//;s/"$//')
    fi
done <<< "$KEY_CONTENT"

# For backup service, username might be missing - use service name as fallback
if [ -z "$USERNAME" ] && [ "$SERVICE_NAME" = "backup" ]; then
    USERNAME="$SERVICE_NAME"
fi

# Validate credential extraction
if [ -z "$PASSWORD" ]; then
    echo "ERROR: Failed to extract password from $SERVICE_NAME key file"
    exit 1
fi

# Output credentials in format: username=value password=value
echo "username=$USERNAME"
echo "password=$PASSWORD"
exit 0