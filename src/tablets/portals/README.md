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
| **HTTPS name mismatch on LAN** | Service hostnames taken from portal **localURL** values drive **TLS SAN generation** (see **TLS and `sslKey.sh`** below). One regeneration pass aligns nginx’s certificate with the hostnames your cards already advertise. |

---

## What you can do (by role)

**Everyone (for visible portals)**

- Open a service from a card (local or remote URL, depending on how you connected).

**Administrators**

- Toggle **visibility** per portal (eye control on the card).
- **Add** a portal: full entry with **systemd** services and port, or **link-only** for arbitrary URLs or paths.
- **Delete** portals that are **not** in the factory set.
- **Start, stop, restart**, and inspect **status** for services wired to a card (where applicable).
- **Regenerate the platform TLS certificate** after meaningful portal hostname changes, either from Admin (**refresh root CA** / `POST /api/admin/refresh-root-crt`) or by running `sudo /usr/local/sbin/sslKey.sh` on the box (see **TLS and `sslKey.sh`**).
- Drop **custom card images** as `Name.png` under `tablets/portals/images/` on the server tree (see below).

---

## Portal types (behavioral)

**Shipped today:** only these two kinds exist in config and UI.

1. **Systemd-backed**  
   The card knows a **port** and one or more **service** names. The UI can reflect liveness and drive **systemctl** actions through the backend.

2. **Link**  
   A lighter card: **localURL** drives navigation. If the URL is external, it opens as-is; if it targets your LAN or Tailscale host, the UI can rewrite it for remote sessions when the hostname pattern matches.

**Docker (not shipped, not in progress):** If demand appears later, a plausible extension is a **docker** mode on a portal that would use normal **`docker`** CLI semantics (start, stop, status, etc.) for a named container or compose unit, similar in spirit to how systemd-backed cards wrap **systemctl**. **HOMESERVER does not ship Docker** on the product path today, there is **no current demand** driving it, and **no active work** is scheduled on that slice. Until then, containerized services you run yourself are still representable as **link** portals (open the URL) without lifecycle buttons in this tab.

---

## Remote access (Tailscale)

If the browser hostname looks like `home.<something>.ts.net`, the front end builds remote URLs from the current tailnet name and the portal definition (including the `1` + port pattern for standard services). If you are not on that pattern, some portals may not render in remote mode by design (no guessed URL).

The same **Tailscale hostname** shape is also included in the TLS certificate generated by **`sslKey.sh`** (see next section), so HTTPS stays consistent for both LAN (`*.home.arpa`) and Tailscale access when you regenerate after config changes.

---

## TLS, nginx, and `sslKey.sh` (portal-driven certificates)

Portals are not only UI: they are the **declared hostname manifest** for HOMESERVER’s **self-signed nginx TLS** story. The script **`sslKey.sh`** (shipped from the repo as `homeserver/initialization/files/usr_local_sbin/sslKey.sh`, installed at **`/usr/local/sbin/sslKey.sh`**) rebuilds `/etc/ssl/home.arpa/cert.pem` and `key.pem` using **OpenSSL** and the **active `homeserver.json`**.

### What the script reads

1. **Active config path** via **`factoryFallback.sh`**. If the unit is still on **factory** config (`*.factory`), the script **exits**; you must be on a real `homeserver.json` before certificates can track your portals.
2. **Tailnet name** from **`global.cors.allowed_origins`**: it finds a `home.<tailnet>.ts.net` origin and uses `<tailnet>` for SAN entries.
3. **Portal URLs**: it runs **`jq`** over **`.tabs.portals.data.portals[].localURL`**, keeps hosts that match **`https://…` or `http://…` with a `*.home.arpa` hostname**, deduplicates them, and appends each as an explicit **`DNS.N` Subject Alternative Name** in the OpenSSL config it generates.

Always-present SANs include **`home.arpa`**, **`*.home.arpa`**, and **`home.<tailnet>.ts.net`**. If no portal URLs yield `*.home.arpa` hosts, the script falls back to a **built-in list** of common service hostnames so generation still succeeds.

### What the script does on disk

- Writes a **4096-bit** RSA cert and key, sets **permissions** and **`ssl-cert`** group ownership, ensures **`www-data`** can read via group membership.
- Copies the cert into **`/usr/local/share/ca-certificates/home.arpa.crt`** and runs **`update-ca-certificates`** so the **host** (and typical local trust consumers) trust **`home.arpa`**.
- **Restarts nginx** if nginx is already active.

### How operators trigger it

| Path | Behavior |
|------|----------|
| **CLI** | `sudo /usr/local/sbin/sslKey.sh` |
| **Admin API** | **`POST /api/admin/refresh-root-crt`** runs the same script under **`sudo`** from the Flask backend (`inject/backend/admin/routes.py`). Sudoers allows **`www-data`** to run **`/usr/local/sbin/sslKey.sh`** without a password (`initialization/files/sudo/flask-admin`). The API response reminds you that clients may need to **clear SSL state** and **reinstall** trust after a refresh. |
| **Nginx install** | The **networkservices** nginx installer invokes **`sslKey.sh`** when generating keys on a fresh install (`networkservices/nginx/install.py`). |

### Why this matters for Portals workflows

- When you **add or change** a portal whose **localURL** uses a **new `something.home.arpa` host**, nginx may already vhost that name, but the **browser will not trust it** until that hostname appears on the **served certificate**. Regenerating via **`sslKey.sh`** (or Admin refresh) closes the loop **without hand-editing** OpenSSL configs.
- **Link-only** portals that point at **external** HTTPS sites do not contribute `*.home.arpa` names; only LAN-style portal URLs participate in SAN scraping.
- **Unbound / nginx vhost** steps for some optional services are still documented per integration; **`sslKey.sh`** is the piece that keeps **TLS SANs** aligned with **portal declarations**.

### How this compares to common homelab patterns (external context)

Many stacks use **ACME** (for example Let’s Encrypt) for public DNS names, or a **static private CA** with manually maintained SAN lists. HOMESERVER’s approach is **LAN-first**: a **long-lived self-signed** cert whose **SAN set is derived from the same JSON that feeds the Portals grid**, plus Tailscale naming from CORS. Tradeoff: clients need **explicit trust** (bundles and install flows in Admin); benefit: **no external CA** dependency for **`home.arpa`** service names, and **one regeneration** after portal edits instead of scattered cert config.

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

Backend routes for portals and service control live under `inject/backend/portals/`. Certificate refresh is under **`inject/backend/admin/routes.py`** (`refresh-root-crt`). The **`sslKey.sh`** source lives at **`homeserver/initialization/files/usr_local_sbin/sslKey.sh`**; sibling tooling and examples are in **`homeserver/initialization/files/usr_local_sbin/README.md`**.
