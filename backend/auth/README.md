# How the Token System Works

Our current token system leverages the admin PIN stored in `homeserver.json` (specifically under the global section for admin) as the authentication token. Here’s how it functions:

## Token Generation & Storage
The admin PIN defined in your configuration (or via an environment variable like `ADMIN_TOKEN`) acts as the token. In our current setup, this is a simple implementation whereby the token is expected to exactly match the stored PIN.

## Client-Side Authentication
When the admin user wants to access admin-only functions, they provide this token (via a login form, for example). The client then emits an `admin_auth` event over the WebSocket connection. The payload includes a `token` field containing the admin PIN.

## Server-Side Validation
The server-side `SocketAuthManager` receives the token in the `admin_auth` event handler. It uses the helper function `validate_admin_session()` (located in `admin/utils.py`) to compare the provided token with the stored value. If the token is valid, an admin session is created for that socket (tracked by the Socket ID) and the socket is allowed to perform admin-only actions via protected events (like `admin_command`).

## Session Management & Renewal
Admin sessions are renewed whenever the socket sends an admin-protected command. Sessions automatically expire after 30 minutes of inactivity. Upon disconnect, the admin session is removed.

> **Note:** While this implementation reuses the PIN from `homeserver.json`, for production scenarios you should consider a more robust token generation and encryption mechanism. For now, this design ensures admin WebSocket authentication is consistent with our existing HTTP endpoints and state management.


# Frontend Integration Guide for Admin WebSocket Authentication

This guide explains how to integrate your React/TypeScript application with our new WebSocket-based admin authentication system.

## Overview

Our WebSocket authentication system uses a token-based approach. The token is currently the admin PIN defined in your `homeserver.json` (or provided via an environment variable such as `ADMIN_TOKEN`). When a socket connection is established, admin users must authenticate by sending their token, allowing them to access admin-only events.

## Authentication Flow

1. **Establish a Socket Connection:**  
   The client connects to the WebSocket server using Socket.IO. Once connected, it receives a unique Socket ID (SID).

2. **Admin Authentication:**  
   - **User Action:** The admin enters their token (the admin PIN) via a secure login form.
   - **Emitting the Token:**  
     The client emits an `admin_auth` event along with the token:
     ```typescript
     socket.emit('admin_auth', { token: adminToken });
     ```
   - **Server Validation:**  
     The server validates the token against the stored value. If valid, it responds with an `admin_auth_response` event indicating a successful authentication; otherwise, an error message is returned.

3. **Post-Authentication:**  
   - With successful authentication, the socket is granted access to admin-only functionality.
   - Admin-only events (e.g., `admin_command`) are protected by the server using the `@socket_admin_required` decorator.
   - The admin session is maintained on the server and renewed with each admin action.