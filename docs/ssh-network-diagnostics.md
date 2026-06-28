# SSH and Network Diagnostics

This runbook captures evidence for unstable SSH or host identity behavior on the Kubernetes VMs. Use raw IPs first; DNS can be revisited after IP connectivity is stable.

## Targets

| Role | Host | IP |
|---|---|---:|
| Proxmox | `pve-01` | `192.168.40.20` |
| Control plane | `k8s-control-01` | `192.168.40.21` |
| Suspect worker | `k8s-worker-01` | `192.168.40.22` |
| Stable worker | `k8s-worker-02` | `192.168.40.23` |

## Mac Capture

Run from the Mac:

```bash
scripts/diagnose-mac-network.sh
```

Useful options:

```bash
SSH_ATTEMPTS=50 scripts/diagnose-mac-network.sh
CLEAR_ARP=1 scripts/diagnose-mac-network.sh
SUSPECT_HOST=192.168.40.23 scripts/diagnose-mac-network.sh
```

The script writes timestamped logs under `diagnostics/`. It captures ping, TCP/22, ARP, and a repeated SSH loop against the suspect host.

Because the Mac is on `192.168.10.0/24` and the VMs are on `192.168.40.0/24`, the Mac normally ARPs for its `.10` gateway, not for the VM MACs. Use the Mac capture to prove L3 and TCP behavior; use Proxmox or UniFi to prove VM MAC/ARP identity.

## Proxmox Capture

Run `scripts/diagnose-proxmox-network.sh` on the Proxmox host. If SSH to Proxmox is available, send or copy the script there first; if SSH/22 is timing out, use the Proxmox web console/shell and run the commands from the script there.

```bash
ssh root@192.168.40.20
mkdir -p diagnostics
bash diagnose-proxmox-network.sh
```

The script discovers VM IDs by name, prints NIC/MAC configuration, checks Proxmox neighbor state, queries the guest agent for `k8s-worker-01`, and tests reachability to `.21`, `.22`, `.23`, `.112`, and `.170`.

## VM Identity Capture

When VM SSH is available, run the Mac-side wrapper:

```bash
scripts/diagnose-vms-over-ssh.sh
```

When SSH is failing, run `scripts/diagnose-vm-identity.sh` inside each VM console, especially `k8s-worker-01`:

```bash
bash diagnose-vm-identity.sh
```

Confirm every VM has unique values for:

- hostname
- `/etc/machine-id`
- SSH ED25519 host key fingerprint
- Proxmox NIC MAC address
- static IP in netplan

## Evidence Rules

- If `.22` changes MACs in ARP/neighbor tables, treat it as an IP conflict or bridge/client table issue.
- For routed Mac-to-VM traffic, expect Mac ARP to show the gateway rather than VM MACs.
- If `.22` shares a Proxmox NIC MAC with another VM, fix the VM MAC before debugging SSH.
- If ICMP stays healthy but TCP/22 times out across multiple Proxmox targets, check UniFi UDM Pro Intrusion Prevention before chasing Proxmox bridge, VM, or SSH daemon issues.
- If Proxmox reaches `.22` while the Mac cannot, focus on UniFi routing/firewall/client tracking between `192.168.10.0/24` and `192.168.40.0/24`.
- If both Proxmox and Mac lose `.22`, focus on the guest OS, VM NIC, bridge, or VM freeze.
- If ping and TCP/22 work but SSH sessions die, focus on `sshd`, PAM, shell startup, disk, memory, or kernel stall evidence inside the guest.

Do not regenerate machine IDs, SSH host keys, MAC addresses, or netplan until duplicate evidence is captured.

## Lessons Learned

### 2026-06-28: UniFi UDM Pro Intrusion Prevention Can Mimic SSH Dropouts

Observed symptoms:

- Ping stayed healthy to the Mac LAN gateway `192.168.10.1`, the Servers VLAN gateway `192.168.40.1`, the Proxmox host `192.168.40.20`, and the Kubernetes VMs.
- TCP/22 checks intermittently timed out against Proxmox and the VMs.
- Failures moved between hosts while ICMP latency remained normal.
- The issue affected Proxmox itself, not only guest VMs.

Root cause:

- UniFi UDM Pro Intrusion Prevention was interfering with SSH/TCP traffic.

Resolution:

- Adjusted Intrusion Prevention so SSH to the homelab Proxmox and VM targets is no longer blocked.

Diagnostic takeaway:

- When ICMP is consistently good but SSH/TCP intermittently times out, treat security filtering as a first-class suspect. Verify UniFi firewall, Traffic Rules, and Intrusion Prevention before changing Proxmox bridge settings, VM MACs, netplan, SSH host keys, or machine IDs.

Useful monitor:

```bash
scripts/watch-proxmox-connectivity.sh
```

This checks ping and TCP/22 side by side for the Mac LAN gateway, Servers VLAN gateway, Proxmox host, and Kubernetes VMs.
