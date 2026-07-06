# Tailscale + Android Remote Printing — Setup Guide

**Goal:** print documents from an Android phone, from anywhere ("out and
about"), to a printer sitting on the home LAN — riding on the same Tailscale
tailnet already being stood up for the agents.

> This doc lives in the ModTools repo only because that's where the branch was
> cut. None of this touches the extension. It's infrastructure/config.

---

## The one architectural fact that drives everything

A phone that is away from home **cannot reach a home printer directly** —
printers can't run Tailscale, and your home LAN isn't publicly routable. So you
need a machine that stays powered on at home to bridge the gap:

```
[Android phone]  --Tailscale-->  [always-on home node]  --LAN-->  [printer]
   (anywhere)                    (subnet router / CUPS)         (192.168.x.y)
```

1. **Always-on home node** runs Tailscale and **advertises the printer's
   subnet** into the tailnet (subnet router). If the printer is legacy/USB it
   also runs **CUPS** to act as a print server.
2. **Android phone** runs the Tailscale app on the same tailnet → it can now
   reach the home LAN subnet from anywhere.
3. **Android print service** (Mopria, or CUPS/IPP) sends the job to the
   printer's LAN IP, which routes over Tailscale.

**Hard prerequisite:** you must have *something* at home that stays on (PC,
mini-PC, Raspberry Pi, or a NAS that can run Tailscale). If literally nothing
but the printer is on when you leave, remote printing is impossible until you
add an always-on node. A $40–60 Raspberry Pi Zero 2 W or any old laptop is
plenty.

---

## Part 1 — The always-on home node (subnet router)

Assume the home node's OS is Linux (Pi/NAS/desktop). Windows/macOS notes at the
end of this part.

### 1.1 Install Tailscale on the home node

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

### 1.2 Find the printer's subnet

On the home node:

```bash
ip -4 route | grep -v default
# e.g. "192.168.1.0/24 dev eth0 ..." → your LAN subnet is 192.168.1.0/24
```

Also pin down the **printer's IP** (you'll want it static). Check your router's
DHCP client list, or:

```bash
# quick scan for IPP/AirPrint printers on the LAN (install avahi-utils if needed)
avahi-browse -rt _ipp._tcp
# or a broad ping sweep:
for i in $(seq 1 254); do ping -c1 -W1 192.168.1.$i >/dev/null 2>&1 && echo "192.168.1.$i up"; done
```

**Reserve the printer's IP** in your router (DHCP reservation) so it never
moves. Everything below assumes a stable printer IP.

### 1.3 Bring the node up as a subnet router

```bash
# enable IP forwarding (required for subnet routing)
echo 'net.ipv4.ip_forward = 1'  | sudo tee -a /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf

# advertise the LAN subnet (use YOUR subnet from 1.2)
sudo tailscale up --advertise-routes=192.168.1.0/24 --accept-dns=false
```

It will print an auth URL — open it, log in to the **same tailnet** as the
agents.

### 1.4 Approve the route in the admin console

Subnet routes are **off until approved**:

1. Go to <https://login.tailscale.com/admin/machines>
2. Find the home node → **⋯ menu → Edit route settings**
3. Enable the `192.168.1.0/24` route → Save.

> Optional but recommended: give the node a stable tag and turn on
> **key expiry: disabled** for this node so the route doesn't drop when the
> auth key expires. Admin console → machine → Disable key expiry.

### 1.5 Windows / macOS home node (alternative)

- **Windows:** install Tailscale, then in an elevated PowerShell:
  `tailscale up --advertise-routes=192.168.1.0/24`. Windows enables forwarding
  automatically for advertised routes. Approve in admin console as in 1.4.
- **macOS:** the App Store build can't subnet-route; use the **standalone
  (open-source) tailscaled** build or run it in a Linux VM/container. A Pi is
  simpler.

---

## Part 2 — Wiring in the printer

Pick the branch that matches your printer.

### Branch A — Modern network printer (AirPrint / Mopria / IPP)

Most printers from ~2015 onward. It already has its own IP on the LAN and
speaks IPP. **No CUPS needed.** Once the subnet route (Part 1) is approved, the
phone can talk to the printer's LAN IP directly over Tailscale. Skip to Part 3.

Verify from the home node that the printer answers IPP:

```bash
# should return printer attributes, not hang
ipptool -tv ipp://192.168.1.50/ipp/print get-printer-attributes.test
# (install cups-ipp-utils / cups-client for ipptool)
```

### Branch B — Older network printer (no AirPrint) OR Branch C — USB printer

Both need the home node to run **CUPS** as a print server that re-exposes the
printer as a clean IPP endpoint.

```bash
sudo apt update && sudo apt install -y cups
sudo usermod -aG lpadmin $USER
# let CUPS listen on the tailnet, not just localhost:
sudo cupsctl --remote-any
sudo systemctl restart cups
```

Add the printer via the CUPS web UI (`http://<home-node-LAN-ip>:631` on the
home network, or over Tailscale at `http://<node-tailscale-ip>:631`):

- **Administration → Add Printer**
- USB printer (Branch C): it appears under **Local Printers**.
- Old network printer (Branch B): choose **AppSocket/JetDirect** and enter
  `socket://192.168.1.50:9100`, or LPD `lpd://192.168.1.50/queue`.
- Pick the driver (or a generic PostScript/PCL driver). Tick **Share This
  Printer**.

Now the printer is reachable as `ipp://<node-tailscale-ip>:631/printers/<name>`
from anywhere on the tailnet.

> Driverless tip: for a truly ancient printer with no Linux driver, look at
> the `printer-driver-*` packages or the manufacturer's PPD. If it's USB and
> Linux sees it (`lpinfo -v`), CUPS can almost always drive it.

---

## Part 3 — The Android phone (what YOU do)

This is the part you asked about specifically.

### 3.1 Install & join the tailnet

1. Play Store → install **Tailscale**.
2. Open it → **Sign in** with the same account/tailnet as the agents and the
   home node.
3. Toggle Tailscale **ON**. Confirm the VPN-key icon appears in the status bar.
4. In the app, verify the **home node** shows up in the machine list and is
   online.

### 3.2 Confirm the phone can reach the printer

- In the Tailscale app, open **Settings → check that "Use Tailscale subnets"
  / accept routes is enabled** (Android accepts advertised subnet routes by
  default, but confirm it's on).
- Quick test: open a browser on the phone and hit the printer's **LAN IP**
  (`http://192.168.1.50`) or the CUPS UI (`http://<node-tailscale-ip>:631`).
  If the page loads while you're on mobile data, routing works. **Do this test
  before trusting it in the field.**

### 3.3 Install a print service and add the printer by IP

Android's built-in "Default Print Service" discovers printers via mDNS, which
**does not cross the subnet route reliably** — so you add the printer *by IP*,
not by discovery.

1. Play Store → install **Mopria Print Service** (works with the vast majority
   of IPP/AirPrint printers).
2. Android **Settings → Connected devices → Connection preferences →
   Printing → Mopria Print Service → ⋮ → Add printer → Add by IP address.**
   - Branch A (modern printer): enter the **printer's LAN IP**
     (`192.168.1.50`).
   - Branch B/C (CUPS): enter the **home node's Tailscale IP**, and if prompted
     for a path use `/printers/<name>` (or install **CUPS Print** / a
     third-party IPP app that lets you type a full `ipp://…` URL).
3. The printer should validate and save.

> If Mopria won't add by IP on your Android version, alternatives that let you
> paste a full IPP URL: **"IPP Print"**, **"Let's Print Droid"**, or printing
> via the manufacturer's own app pointed at the IP.

### 3.4 Print

From any app: **Share / Print → select the printer you added → Print.** As long
as Tailscale is ON on the phone, it works from anywhere.

---

## Quick verification checklist (do this before you rely on it)

Run through this while still at home, then repeat 3.2 on mobile data:

- [ ] Home node online in admin console, route `192.168.x.0/24` **approved**.
- [ ] Home node key expiry disabled (route won't silently drop).
- [ ] Printer has a **static/reserved IP**.
- [ ] `ping <printer-LAN-ip>` succeeds **from the phone over mobile data** with
      Tailscale on (use a terminal app, or the browser test in 3.2).
- [ ] A real test page prints from the phone **over mobile data** (turn WiFi
      off to prove it's not just using the home network).

If the browser test in 3.2 fails over mobile data: the route isn't approved, or
`--accept-routes` is off on the phone, or IP forwarding wasn't enabled on the
node. Recheck 1.3 / 1.4 in that order.

---

## Hardening / nice-to-haves (optional, later)

- **ACLs:** lock the tailnet so the phone can reach only the printer IP/port,
  not the whole LAN. In the admin console policy file:
  ```jsonc
  // allow the phone to reach only the printer, IPP + JetDirect ports
  {
    "action": "accept",
    "src":    ["you@github"],          // or a tag on the phone
    "dst":    ["192.168.1.50:631,9100"]
  }
  ```
- **Tag the subnet router** (`tag:home-router`) instead of tying the route to a
  personal login, so it survives account changes.
- **MagicDNS name** for the CUPS node so you type `ipp://homenode:631/...`
  instead of a raw Tailscale IP.

---

## TL;DR — the phone-side, in five steps

1. Install **Tailscale** on the phone, sign into the same tailnet, toggle ON.
2. Make sure an **always-on home node** is advertising the printer's subnet and
   the route is **approved** in the admin console.
3. Confirm reachability: load the printer's web page on the phone over **mobile
   data**.
4. Install **Mopria Print Service**, **Add printer → by IP** (printer's LAN IP,
   or the CUPS node's Tailscale IP for old/USB printers).
5. Share → Print. Done — works anywhere Tailscale is on.
