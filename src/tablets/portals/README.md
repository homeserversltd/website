# Portals

**Portals** is the HOMESERVER **service launchpad**: one screen that lists the applications running on your box, opens them in a click, and (for administrators) exposes status and controls tied to real systemd services. You use it from the **Portals** tab in the web UI at `home.arpa`.

This document is for anyone reading the source tree or deployment files. The live system is what you see in that tab.

---

## What it is

- A **grid of cards**. Each card is a **portal**: a named entry point to a service (local URL, optional remote behavior on Tailscale, optional link to one or more systemd units).
- **Configuration-driven.** The list comes from `homeserver.json` under `tabs.portals.data.portals`, merged with visibility rules under `tabs.portals.visibility.elements`.
- **Factory vs custom.** The platform ships a **factory** portal set (baseline services). Administrators can **add** custom portals and **remove** only non-factory entries. Factory names are resolved against the factory config on the unit so the UI knows what is safe to delete.
- **Roles.** Non-admin users only see portals that stay **visible** for them. Administrators can toggle per-portal visibility and manage services where the card supports it.

---

## Problems it solves

| Problem | How Portals addresses it |
|--------|---------------------------|
| **Scattered bookmarks and mystery ports** | One ordered grid at a known host. You are not hunting `https://…:32400` on a sticky note. |
| **“What do we actually run here?”** | Cards carry short descriptions and, for integrated services, tie to **systemd** so status and start/stop/restart stay next to the link. |
| **Households with different needs** | Admins can **hide** a portal from the default view without uninstalling the service. Guests or family members see a curated set. |
| **Remote access without re-teaching URLs** | When you reach the UI over a **Tailscale** hostname matching `home.<tailnet>.ts.net`, many portals get a **computed HTTPS URL** (including the `1` port-prefix convention for standard service ports). Link-type portals can follow paths on that same host. |
| **Homelab drift** | **Custom portals** (admin) let you add internal tools or external links as first-class cards, still governed by visibility and config. |
| **Operator clarity** | Add and delete paths go through the API and safe config writes; factory portals stay protected from accidental deletion in normal operation. |

---

## What you can do (by role)

**Everyone (for visible portals)**

- Open a service from a card (local or remote URL, depending on how you connected).

**Administrators**

- Toggle **visibility** per portal (eye control on the card).
- **Add** a portal: full entry with **systemd** services and port, or **link-only** for arbitrary URLs or paths.
- **Delete** portals that are **not** in the factory set.
- **Start, stop, restart**, and inspect **status** for services wired to a card (where applicable).
- Drop **custom card images** as `Name.png` under `tablets/portals/images/` on the server tree (see below).

---

## Portal types (behavioral)

1. **Systemd-backed**  
   The card knows a **port** and one or more **service** names. The UI can reflect liveness and drive **systemctl** actions through the backend.

2. **Link**  
   A lighter card: **localURL** drives navigation. If the URL is external, it opens as-is; if it targets your LAN or Tailscale host, the UI can rewrite it for remote sessions when the hostname pattern matches.

---

## Remote access (Tailscale)

If the browser hostname looks like `home.<something>.ts.net`, the front end builds remote URLs from the current tailnet name and the portal definition (including the `1` + port pattern for standard services). If you are not on that pattern, some portals may not render in remote mode by design (no guessed URL).

---

## Configuration and images

- **Live config** on the appliance is typically under `/var/www/homeserver/src/config/homeserver.json` (paths may differ in development). Portals live under `tabs.portals`.
- **Factory reference** on a shipped unit is used to classify portals; the backend also exposes factory portal names for the UI.
- **Icons:** PNGs served from `/var/www/homeserver/src/tablets/portals/images/` via `/api/portals/images/<filename>`. Prefer backing up icons you care about; they are part of your site tree on that machine.

---

## How this fits HOMESERVER

HOMESERVER is built as **one box, one domain** (`home.arpa`), with many services behind it. Portals is the **operator and household-facing layer** that turns that stack into a **single pane of glass** for opening apps and, for admins, keeping them honest against systemd. It is **baseline product surface**: it ships with the main web UI, not as a separate subscription or cloud dashboard.

For the **exact SKU** (hardware minimums and the services we sell as preloaded), see the published HOMESERVER product and hardware materials. Your live portal list may include optional or site-specific entries configured on the unit.

---

## Technical detail (for implementers)

For file layout, tablet loading, and cross-links to other tablets, see the parent document:

`../README.md`

Backend routes for portals and service control live under `inject/backend/portals/`.
