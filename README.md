# HOMESERVER - Your Personal Digital Fortress

Ever wanted to own your entire digital life instead of renting it from Big Tech? HOMESERVER is your personal datacenter that fits in your house. It's like having your own Netflix, Spotify, Google Drive, and GitHub all running on your own hardware - no monthly subscriptions, no data mining, no corporate surveillance.

## What Makes HOMESERVER Special?

Think of HOMESERVER as the ultimate DIY project for digital freedom. Instead of paying monthly fees to companies that spy on you, you run everything yourself. It's not a consumer gadget - it's enterprise-grade infrastructure that happens to fit in your living room.

### The Freedom Package
- **14+ Services in One Box**: Media servers, file storage, password managers, git hosting, and more
- **Complete Network Control**: Your own firewall, DNS, and VPN - no more ISP snooping
- **Real-time Monitoring**: Watch your system's heartbeat, power usage, and network status live
- **Admin Controls**: Full system management through a sleek web interface

## What's Inside the Box?

### Media & Entertainment
- **Jellyfin**: Your personal Netflix (stream movies, TV shows, music)
- **Navidrome**: Your personal Spotify (stream your music collection)
- **Piwigo**: Your personal Instagram (photo gallery and sharing)
- **Calibre Web**: Your personal library (e-book management)

### Productivity & Development
- **Gogs**: Your personal GitHub (git repository hosting)
- **FileBrowser**: Your personal Google Drive (web-based file manager)
- **Vaultwarden**: Your personal password manager
- **Yarr**: Your personal news aggregator

### Network & Security
- **Tailscale**: Secure VPN for remote access
- **Transmission**: Torrent client with VPN integration
- **nftables**: Advanced firewall with ad blocking
- **kea**: DHCP server for network management
- **unbound**: DNS server with ad blocking

## How It Works

### The Frontend (What You See)
The web interface is built with React and runs on tablets or any web browser. It's like having a control panel for your entire digital world:

- **Real-time Dashboard**: Live system stats, service status, power consumption
- **Admin Mode**: PIN-protected access for system management
- **File Management**: Browse, upload, and manage files through your browser
- **Theme System**: Customize the look and feel to match your style

### The Backend (The Brains)
A Flask-based server that manages everything behind the scenes:

- **WebSocket Communication**: Real-time updates without refreshing pages
- **System Monitoring**: Tracks CPU, memory, disk usage, and service health
- **Authentication**: Secure admin access with session management
- **File Operations**: Handles uploads, downloads, and file system navigation

### State Management (The Memory)
Uses Zustand to keep track of everything:

- **User Sessions**: Who's logged in and what they can access
- **System Data**: Current stats, service status, network info
- **UI State**: What tabs are open, what's visible, theme settings
- **Real-time Updates**: Live data from system monitors

## Key Features That Matter

### Real-time Everything
- **Live System Stats**: Watch your CPU, memory, and disk usage in real-time
- **Service Health**: See which services are running and their status
- **Power Monitoring**: Track your system's power consumption
- **Network Status**: Monitor internet connectivity and VPN status

### Admin Controls
- **System Management**: Restart services, update software, manage disks
- **Network Configuration**: Set up firewalls, DNS, and VPN
- **File Operations**: Upload, download, and manage files
- **Security Settings**: Configure authentication and access controls

### Error Recovery
- **Graceful Degradation**: If something breaks, the system keeps working
- **Fallback Modes**: Alternative ways to access data if primary methods fail
- **Automatic Recovery**: System tries to fix itself when possible
- **Helpful Error Messages**: Clear explanations of what went wrong

## Technical Deep Dive (For the Nerds)

### Architecture Overview
```
React Frontend ←→ WebSocket ←→ Flask Backend ←→ Linux System
     ↓              ↓              ↓              ↓
Zustand Store   Real-time     System Commands  Hardware
```

### State Management
The app uses 14 specialized store slices:
- **Admin**: Authentication and session management
- **Theme**: Dynamic theming with CSS variables
- **Visibility**: Control what tabs and elements are shown
- **WebSocket**: Real-time communication management
- **Directory**: File system navigation and caching
- **Subscriptions**: Event handling and data streams

### WebSocket Communication
Real-time bidirectional communication:
1. **Monitors** collect system data at regular intervals
2. **Broadcast Manager** sends updates when data changes
3. **Frontend Hooks** subscribe to data streams
4. **UI Updates** happen automatically without page refreshes

### Configuration System
Dynamic configuration with multiple layers:
- **Environment Variables**: Development vs production settings
- **JSON Config**: `/var/www/homeserver/src/config/homeserver.json`
- **Dynamic Secrets**: Fresh encryption keys on each startup
- **Live Updates**: Configuration changes without restarting

## System Requirements

### Hardware
- **CPU**: Intel processor (for power monitoring features)
- **RAM**: 8GB+ recommended
- **Storage**: SSD for system, additional storage for NAS connection
- **Network**: Gigabit Ethernet for best performance
- **OS**: Linux (Ubuntu/Debian recommended)

## Why This Matters

### Digital Sovereignty
In a world where Big Tech controls your data, HOMESERVER gives you back control. No more:
- Monthly subscription fees
- Data mining and surveillance
- Corporate censorship
- Service outages you can't control

### Learning Opportunity
Building and maintaining HOMESERVER teaches you:
- Linux system administration
- Network security and configuration
- Web development (React, Flask)
- Real-time communication (WebSockets)
- System monitoring and troubleshooting

### Professional Skills
The technical skills you learn here translate to:
- DevOps and system administration
- Full-stack web development
- Network engineering
- Cybersecurity fundamentals

## Getting Started

HOMESERVER is designed for people who want to own their digital infrastructure. The setup process is comprehensive because you're building enterprise-grade systems, not consumer gadgets.

The complexity is a feature, not a bug - it means you have complete control over your digital life. No more renting your digital existence from corporations.

Ready to take control of your digital world? Let's build something amazing.

