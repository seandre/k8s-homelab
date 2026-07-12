# Optional 01: Utility Desktop and KOReader

This companion guide adds a lightweight XFCE desktop, RDP access, and KOReader Desktop to the existing `utility-01` VM.

Complete [Build 02: Utility Automation Server](../10-build/02-utility-automation-server.md) first. This desktop is optional and is not required for [Build 04: Compact OKD](../10-build/04-compact-okd.md).

Keep RDP internal to trusted LAN or VPN networks. Do not expose it through Kubernetes ingress or forward it from the public internet.

## Target Design

| Item | Value |
|---|---|
| VM | Existing `utility-01` |
| Desktop | XFCE |
| Remote desktop | xrdp on TCP `3389` |
| Application | KOReader Desktop |
| Sync endpoint | `https://kosync.lab.home.arpa` |
| Access | Trusted LAN/VPN clients only |

## Step 1: Confirm the Automation Server Prerequisite

Connect to `utility-01` and confirm the core build is healthy:

```bash
ssh sean@utility-01.lab.home.arpa
kubectl get nodes -o wide
git -C ~/Developer/homelab status
sudo ufw status verbose
```

Do not continue if SSH, DNS, or the utility VM itself is unstable.

## Step 2: Allow Internal RDP Traffic

The core bastion firewall does not open RDP. Add TCP `3389` only for the trusted client LAN and server VLAN:

```bash
sudo ufw allow from 192.168.10.0/24 to any port 3389 proto tcp
sudo ufw allow from 192.168.40.0/24 to any port 3389 proto tcp
sudo ufw status verbose
```

If VPN clients use another trusted subnet, add that subnet explicitly. Do not use an unrestricted `ufw allow 3389/tcp` rule.

## Step 3: Install XFCE and xrdp

XFCE is small enough for occasional GUI work, and RDP clients are readily available on Mac and iPad.

```bash
sudo apt update
sudo apt install -y xfce4 xfce4-goodies xrdp
sudo adduser xrdp ssl-cert
printf '%s\n' 'startxfce4' > ~/.xsession
chmod 644 ~/.xsession
sudo systemctl enable --now xrdp
sudo systemctl restart xrdp
systemctl status xrdp --no-pager
```

From a Mac or iPad RDP client, connect to:

```text
utility-01.lab.home.arpa:3389
```

Sign in as `sean`. If the session is blank, confirm that `~/.xsession` contains only `startxfce4`, then restart xrdp.

## Step 4: Install KOReader Desktop

Prefer the Linux `amd64` `.deb` from the current official KOReader release because Ubuntu can track it as an installed package.

```bash
tmpdir="$(mktemp -d)"
koreader_deb_url="$(curl -fsSL https://api.github.com/repos/koreader/koreader/releases/latest \
  | jq -r '.assets[] | select(.name | test("amd64\\.deb$|x86_64\\.deb$")) | .browser_download_url' \
  | head -n 1)"
if [ -z "$koreader_deb_url" ]; then
  echo "No KOReader .deb asset found. Use the AppImage instructions below."
else
  curl -fsSL "$koreader_deb_url" -o "$tmpdir/koreader.deb"
  sudo apt install -y "$tmpdir/koreader.deb"
fi
rm -rf "$tmpdir"
```

If the current release has no matching `.deb`, use its x86-64 AppImage:

```bash
mkdir -p ~/Applications
koreader_appimage_url="$(curl -fsSL https://api.github.com/repos/koreader/koreader/releases/latest \
  | jq -r '.assets[] | select(.name | test("x86_64.*AppImage$|AppImage.*x86_64")) | .browser_download_url' \
  | head -n 1)"
test -n "$koreader_appimage_url"
curl -fsSL "$koreader_appimage_url" -o ~/Applications/koreader.AppImage
chmod +x ~/Applications/koreader.AppImage
~/Applications/koreader.AppImage
```

Launch KOReader from the RDP desktop and configure sync against:

```text
https://kosync.lab.home.arpa
```

## Step 5: Trust the Homelab Root CA

The KOReader Sync endpoint uses an internal certificate from `homelab-ca`. Export the public root certificate from cert-manager and add it to Ubuntu's system trust store:

```bash
kubectl -n cert-manager get secret homelab-root-ca \
  -o jsonpath='{.data.tls\.crt}' \
  | base64 -d \
  | sudo tee /usr/local/share/ca-certificates/homelab-root-ca.crt >/dev/null
sudo update-ca-certificates
```

Verify the certificate path without disabling TLS verification:

```bash
curl -v https://kosync.lab.home.arpa/healthcheck
```

If `curl -k` works but normal `curl` fails, the service path is working and client trust is still the problem.

## Step 6: Validate the Desktop

Confirm all of the following:

- `utility-01.lab.home.arpa:3389` opens an XFCE desktop.
- KOReader launches.
- KOReader can reach `https://kosync.lab.home.arpa`.
- `sudo ufw status verbose` limits TCP `3389` to trusted subnets.

## Step 7: Disable RDP When It Is Not Needed

Stop xrdp and remove its firewall rules:

```bash
sudo systemctl disable --now xrdp
sudo ufw delete allow from 192.168.10.0/24 to any port 3389 proto tcp
sudo ufw delete allow from 192.168.40.0/24 to any port 3389 proto tcp
sudo ufw status verbose
```

SSH remains the primary administration path. Re-enable RDP only when a GUI task requires it.
