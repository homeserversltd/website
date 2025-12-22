# DHCP Premium Tab

## Overview

The DHCP Premium Tab is an add-on module for the homeserver platform that provides comprehensive DHCP management functionality. It integrates with the Kea DHCP server to provide a unified interface for viewing active DHCP leases, managing static IP reservations, and configuring network address allocation.

## Features

### Unified Device View
- **Combined Display**: Shows both static IP reservations (pinned devices) and active DHCP leases in a single unified list
- **Visual Distinction**: Reservations are marked with a "Pinned" badge, while leases show a "Lease" badge
- **Automatic Deduplication**: Leases that have corresponding reservations are automatically filtered from the lease list
- **Add New Reservation Form**: Input fields at the top of the list allow manual creation of reservations by MAC and IP address

### Static IP Reservation Management
- **Auto-Assignment**: When pinning a lease to create a reservation, IP addresses are automatically assigned from the current reserved range in ascending order
- **Dynamic Reserved Range**: Reserved range is determined by the pool boundary setting (default: 192.168.123.2 - 192.168.123.51 for 50 reservations)
- **Manual IP Editing**: Edit IP addresses for existing reservations (must be within current reserved range)
- **MAC-Based Operations**: Reservations can be added, updated, or removed by MAC address or IP address
- **Hostname Preservation**: Hostnames from leases are automatically preserved when creating reservations

### Pool Boundary Management
- **Dynamic Allocation**: Adjust the boundary between reserved IP range and DHCP pool range using an interactive, collapsible slider
- **Range**: Boundary can be set from 0 (full pool, no reservations) to 249 (all IPs reserved, no pool)
- **Recommended Value**: System suggests 20% reservations (50) and 80% leases (199) as optimal balance
- **Smart Constraints**: 
  - Minimum: Current number of reservations (cannot go below existing reservations)
  - Maximum: 249 minus active leases (ensures active leases have capacity), or 249 if no active leases
- **Real-time Updates**: Boundary changes immediately update the Kea DHCP configuration
- **Visual Feedback**: Slider displays reserved range and pool range that will result from the setting

### Statistics Dashboard
- **Network Overview**: Displays homeserver IP address, current reservation count vs. maximum allowed, total hosts, and active lease count vs. pool capacity
- **Hosts Definition**: Total unique devices = reservations count + active leases (for non-reserved devices)
- **Capacity Monitoring**: Real-time tracking of reservation and lease utilization
- **Boundary Information**: Shows current maximum reservations setting based on pool boundary

### Lease Management
- **Active Lease Viewing**: View all active DHCP leases with IP addresses, MAC addresses, hostnames, and expiration times
- **Lease-to-Reservation Conversion**: One-click "Pin" button converts temporary leases to permanent reservations with auto-assigned IP
- **Automatic Filtering**: Leases for devices with existing reservations are automatically excluded from the display

## Terminology

Understanding the key terms used in the DHCP tab:

- **Reservations**: Static IP address assignments tied to specific MAC addresses. These are permanent and persist across device reboots.
- **Leases**: Temporary IP address assignments from the DHCP pool. These expire after a set time and are reassigned dynamically.
- **Hosts**: Total unique devices on the network, calculated as reservations count + active leases (for devices without reservations).
- **Active Leases**: DHCP leases for devices that do NOT have corresponding reservations. These are counted separately from reservations.
- **Pool Boundary**: The maximum number of reservations allowed, which determines where the reserved range ends and the pool range begins.
- **Reserved Range**: The IP address range allocated for static reservations (192.168.123.2 to 192.168.123.(max_reservations+1)).
- **Pool Range**: The IP address range available for dynamic DHCP leases (192.168.123.(max_reservations+2) to 192.168.123.250).

## Architecture

### IP Address Allocation Model

The DHCP tab implements a dynamic two-tier IP allocation system:

1. **Reserved Range** (192.168.123.2 - 192.168.123.(max_reservations+1)): Static IP reservations for devices that require fixed addresses
   - Range is dynamically calculated based on the pool boundary setting
   - If max_reservations = 50, reserved range is 192.168.123.2 - 192.168.123.51
   - If max_reservations = 0, there is no reserved range (all IPs go to pool)
   - Total available IPs: 249 (192.168.123.2 to 192.168.123.250)

2. **Pool Range** (192.168.123.(max_reservations+2) - 192.168.123.250): Dynamic DHCP pool for temporary lease assignments
   - Automatically adjusts based on the boundary setting
   - If max_reservations = 50, pool range is 192.168.123.52 - 192.168.123.250
   - If max_reservations = 0, pool range is 192.168.123.2 - 192.168.123.250 (full range)

The boundary between these ranges is configurable via the pool boundary slider (0-249) and determines the maximum number of reservations allowed. The pool range automatically adjusts based on the boundary setting.

### Auto-Assignment Algorithm

When creating a reservation without specifying an IP address (or if the provided IP is in the pool range), the system:
1. Determines the current reserved range based on the pool boundary setting
2. Checks existing reservations to find used IPs within that range
3. Searches the reserved range in ascending order (starting from 192.168.123.2)
4. Assigns the first available IP address within the current reserved range
5. Validates the assignment is within the reserved range (not in pool range)

## Requirements

- Kea DHCP server installed and configured
- Admin privileges required for all operations
- Kea DHCP configuration file at `/etc/kea/kea-dhcp4.conf`
- Lease database at `/var/lib/kea/kea-leases4.csv`
- Atomic update script at `/usr/local/sbin/update-kea-dhcp.sh` for safe configuration updates

## API Endpoints

### Service Management
- `GET /api/dhcp/status` - Get DHCP service status (active/inactive)
- `GET /api/dhcp/health` - Health check endpoint (service status + config validation)

### Lease Operations
- `GET /api/dhcp/leases` - Get all active DHCP leases (deduplicated by MAC address)

### Reservation Operations
- `GET /api/dhcp/reservations` - Get all static IP reservations
- `POST /api/dhcp/reservations` - Add new reservation (auto-assigns IP if not provided)
  - Body: `{ "hw-address": "mac:address", "ip-address": "optional", "hostname": "optional" }`
- `PUT /api/dhcp/reservations/<identifier>` - Update reservation IP address
  - Body: `{ "ip-address": "new.ip.address" }`
- `DELETE /api/dhcp/reservations/<identifier>` - Remove reservation (by MAC or IP)

### Configuration Management
- `GET /api/dhcp/config` - Get current Kea DHCP configuration
- `POST /api/dhcp/config` - Update Kea DHCP configuration
  - Body: `{ "config": { ... } }`

### Statistics and Boundary
- `GET /api/dhcp/statistics` - Get network statistics
  - Returns: `{ homeserver_ip, reservations_count, reservations_total, leases_count, leases_total }`
  - `leases_count` = active leases for devices WITHOUT reservations
  - `reservations_total` = maximum reservations based on current boundary
- `GET /api/dhcp/pool-boundary` - Get current maximum reservations setting (pool boundary)
  - Returns: `{ max_reservations: <number> }` (0-249)
- `POST /api/dhcp/pool-boundary` - Update pool boundary (adjust reservations-to-hosts ratio)
  - Body: `{ "max_reservations": <number> }` (must be integer, 0-249)
  - Validates constraints: min = current reservations, max = 249 - active leases (or 249 if no active leases)

## Configuration

The tab is configured in `homeserver.patch.json` with:
- `displayName`: "DHCP"
- `adminOnly`: true
- `order`: 85

## Permissions

The tab requires sudo permissions for:
- Reading and writing Kea DHCP configuration file (`/etc/kea/kea-dhcp4.conf`)
- Executing atomic update script (`/usr/local/sbin/update-kea-dhcp.sh`)
- Reading lease database (`/var/lib/kea/kea-leases4.csv`)
- Validating configuration (`kea-dhcp4 -t`)
- Checking service status (`systemctl`)

All permissions are defined in `permissions/flask-dhcp`.

## Installation

Install using the premium tab installer:

```bash
sudo python3 /var/www/homeserver/premium/installer.py install dhcp
```

## Usage

### Basic Workflow

1. **View Network Devices**: Navigate to the DHCP tab to see all active leases and reservations in a unified list
2. **Add New Reservation**: Use the form at the top to manually create a reservation by entering MAC and IP address
3. **Pin a Device**: Click the "Pin" button on any lease to convert it to a permanent reservation with auto-assigned IP from the reserved range
4. **Edit IP Address**: Click "Edit IP" on a reservation to manually assign a specific IP (must be within current reserved range)
5. **Remove Reservation**: Click "Remove" to unpin a device and return it to the DHCP pool
6. **Adjust Capacity**: Click "Configure Reservations vs Leases" to open the slider and adjust the boundary between reserved and pool ranges
7. **Refresh Data**: Click "Refresh" to reload all lease and reservation data

### Statistics Banner

The top banner displays:
- **Homeserver IP**: The router/gateway IP address (typically 192.168.123.1)
- **Reservations**: Current count vs. maximum allowed (based on boundary setting)
- **Hosts**: Total unique devices = reservations count + active leases (for non-reserved devices)
- **Leases**: Active leases count (for devices without reservations) vs. pool capacity

### Pool Boundary Configuration

The collapsible boundary slider allows you to:
- **Adjust Range**: Set maximum reservations from 0 (full pool) to 249 (all IPs reserved)
- **View Constraints**: See minimum (current reservations) and maximum (249 - active leases, or 249 if no active leases)
- **Apply Recommended**: One-click button to set 20% reservations (50) and 80% leases (199)
- **Preview Changes**: See the resulting reserved range and pool range before applying
- **Smart Validation**: System ensures changes don't conflict with existing reservations or active leases
- **Real-time Updates**: Changes immediately update the Kea DHCP configuration

## Technical Details

### Configuration Update Process

Configuration updates use an atomic update mechanism:
1. Validate JSON structure and required fields
2. Write new configuration to temporary file
3. Execute atomic update script via sudo
4. Script validates configuration before applying
5. On success, replaces old configuration atomically
6. On failure, preserves existing configuration

### Lease Database Parsing

The lease database is a CSV file with the following format:
- Fields: `address`, `hwaddr`, `client_id`, `valid_lifetime`, `expire`, `subnet_id`, `fqdn_fwd`, `fqdn_rev`, `hostname`, `state`, `user_context`
- Only active leases (`state=0`) with future expiration times are included
- Duplicate MAC addresses are deduplicated (keeps lease with latest expiration)

## Development

For development iterations, use the reinstall command:

```bash
# Sync files to server
rsync -av --delete ./dhcp/ root@server:/var/www/homeserver/premium/dhcp/

# Reinstall
sudo python3 /var/www/homeserver/premium/installer.py reinstall dhcp
```

## Watch Commands

**Watch IP Pool:**
```bash
watch -n 1 'jq -r ".Dhcp4.subnet4[0].pools[0].pool" /etc/kea/kea-dhcp4.conf'
```

**Watch Reserved IPs (IP addresses only):**
```bash
watch -n 1 'jq -r ".Dhcp4.subnet4[0].reservations[] | .[\"ip-address\"]" /etc/kea/kea-dhcp4.conf'
```

## Integration with Homeserver Platform

This tab integrates with the homeserver platform's premium tab system:
- Uses the standard premium tab installer for deployment
- Follows homeserver's permission model (sudo-based operations)
- Integrates with homeserver's admin authentication system
- Uses homeserver's standard API response format (`{ success: boolean, ... }`)
