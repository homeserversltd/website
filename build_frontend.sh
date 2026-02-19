#!/bin/bash

# HOMESERVER Frontend Build Script
# 
# This script handles the complete frontend build process for the HOMESERVER
# web application. It performs the following operations:
#   1. Cleans existing build artifacts to ensure fresh builds
#   2. Copies application files from source to webroot
#   3. Sets appropriate ownership and permissions
#   4. Installs npm dependencies
#   5. Builds the production frontend bundle
#
# Usage: ./build_frontend.sh [source_dir] [webroot_dir]
#   source_dir:  Source directory containing application files (default: current dir)
#   webroot_dir: Target webroot directory (default: /var/www/homeserver)
#
# Author: HOMESERVER Development Team
# License: BSL 1.1

set -e  # Exit on any error

# Script configuration
SCRIPT_NAME="build_frontend.sh"
VERSION="1.0.0"

# Default paths
DEFAULT_SOURCE="$(pwd)"
DEFAULT_WEBROOT="/var/www/homeserver"

# Parse command line arguments
SOURCE_DIR="${1:-$DEFAULT_SOURCE}"
WEBROOT="${2:-$DEFAULT_WEBROOT}"

# Validate paths
if [ ! -d "$SOURCE_DIR" ]; then
    echo "ERROR: Source directory does not exist: $SOURCE_DIR"
    exit 1
fi

if [ ! -w "$(dirname "$WEBROOT")" ]; then
    echo "ERROR: Cannot write to webroot parent directory: $(dirname "$WEBROOT")"
    exit 1
fi

echo "=== HOMESERVER FRONTEND BUILD SCRIPT v$VERSION ==="
echo "Starting at: $(date)"
echo "Source directory: $SOURCE_DIR"
echo "Target webroot: $WEBROOT"
echo "Current working directory: $(pwd)"
echo ""

# Clean existing build artifacts to ensure fresh builds
echo "=== STEP 1: Cleaning existing build artifacts ==="
if [ -d "$WEBROOT/node_modules" ]; then
    echo "Removing existing node_modules directory"
    rm -rf "$WEBROOT/node_modules"
fi
if [ -d "$WEBROOT/build" ]; then
    echo "Removing existing build directory"
    rm -rf "$WEBROOT/build"
fi
echo "✓ Build artifacts cleaned"
echo ""

# Function to copy individual files with proper error handling
copy_file() {
    local src="$1"
    local dest="$2"
    local description="$3"
    
    echo "Copying $description: $src -> $dest"
    
    if [ ! -f "$src" ]; then
        echo "ERROR: Source file not found: $src"
        return 1
    fi
    
    # Create destination directory if needed
    mkdir -p "$(dirname "$dest")"
    
    # Copy file and set permissions
    cp "$src" "$dest"
    chmod 755 "$dest"
    
    echo "✓ Copied: $description"
}

# Function to copy directories with proper error handling
copy_directory() {
    local src="$1"
    local dest="$2"
    local description="$3"
    
    echo "Copying $description: $src -> $dest"
    
    if [ ! -d "$src" ]; then
        echo "ERROR: Source directory not found: $src"
        return 1
    fi
    
    # Remove destination if it exists
    if [ -d "$dest" ]; then
        echo "Removing existing destination: $dest"
        rm -rf "$dest"
    fi
    
    # Copy directory recursively
    cp -r "$src" "$dest"
    
    # Set permissions recursively (excluding node_modules)
    find "$dest" -type d -not -path "*/node_modules/*" -exec chmod 755 {} \;
    find "$dest" -type f -not -path "*/node_modules/*" -exec chmod 755 {} \;
    
    echo "✓ Copied: $description"
}

# Step 2: Copy application files
echo "=== STEP 2: Copying application files ==="

# Copy core application files
copy_file "$SOURCE_DIR/main.py" "$WEBROOT/main.py" "main.py"
copy_file "$SOURCE_DIR/config.py" "$WEBROOT/config.py" "config.py"
copy_file "$SOURCE_DIR/requirements.txt" "$WEBROOT/requirements.txt" "requirements.txt"
copy_file "$SOURCE_DIR/package.json" "$WEBROOT/package.json" "package.json"
copy_file "$SOURCE_DIR/tsconfig.json" "$WEBROOT/tsconfig.json" "tsconfig.json"
copy_file "$SOURCE_DIR/vite.config.ts" "$WEBROOT/vite.config.ts" "vite.config.ts"

# Copy source directory (frontend code)
copy_directory "$SOURCE_DIR/src" "$WEBROOT/src" "src directory (frontend code)"

# Copy backend directory
if [ -d "$SOURCE_DIR/backend" ]; then
    copy_directory "$SOURCE_DIR/backend" "$WEBROOT/backend" "backend directory"
else
    echo "Backend directory not found, skipping"
fi

# Copy public assets
if [ -d "$SOURCE_DIR/public" ]; then
    copy_directory "$SOURCE_DIR/public" "$WEBROOT/public" "public assets"
else
    echo "Public directory not found, skipping"
fi

# Copy premium modules
if [ -d "$SOURCE_DIR/premium" ]; then
    copy_directory "$SOURCE_DIR/premium" "$WEBROOT/premium" "premium modules"
else
    echo "Premium directory not found, skipping"
fi

# Copy backup directory
if [ -d "$SOURCE_DIR/backup" ]; then
    copy_directory "$SOURCE_DIR/backup" "$WEBROOT/backup" "backup directory"
else
    echo "Backup directory not found, skipping"
fi

echo "✓ All application files copied"
echo ""

# Step 3: Set ownership and permissions
echo "=== STEP 3: Setting ownership and permissions ==="

echo "Setting ownership to www-data:www-data"
chown -R www-data:www-data "$WEBROOT"

echo "Setting directory permissions to 755 (excluding node_modules)"
find "$WEBROOT" -type d -not -path "*/node_modules/*" -exec chmod 755 {} \;

echo "Setting file permissions to 755 (excluding node_modules)"
find "$WEBROOT" -type f -not -path "*/node_modules/*" -exec chmod 755 {} \;

echo "✓ Permissions set (npm-managed directories preserved)"
echo ""

# Step 4: Install npm dependencies
echo "=== STEP 4: Installing npm dependencies ==="

cd "$WEBROOT"
echo "Changed to directory: $(pwd)"
echo "Running: npm install --quiet"

if npm install --quiet; then
    echo "✓ npm install completed successfully"
else
    echo "✗ npm install failed"
    exit 1
fi
echo ""

# Step 5: Build production frontend
echo "=== STEP 5: Building production frontend ==="

echo "Running: npm run build"

if npm run build; then
    echo "✓ npm run build completed successfully"
    echo ""
    echo "=== BUILD SUCCESS! ==="
    echo "HOMESERVER frontend has been successfully built and deployed"
    echo "Build artifacts are ready in: $WEBROOT/build"
    echo ""
    echo "Build completed at: $(date)"
else
    echo "✗ npm run build failed"
    echo ""
    echo "=== BUILD FAILED! ==="
    echo "Frontend build process encountered an error"
    echo "Please check the logs above for details"
    exit 1
fi

echo ""
echo "=== HOMESERVER FRONTEND BUILD COMPLETE ==="
echo "Script execution finished at: $(date)"
echo "Total execution time: $SECONDS seconds"
