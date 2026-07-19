# Temporary Ubuntu and Top500 HPL Benchmark Before OKD

This is the selected preparation path for the three Ryzen systems. Install temporary Ubuntu on all three nodes, validate their hardware and storage, compare them with the running k3s VMs, preserve the results, and only then allow OKD to overwrite their disks. The homelab code is a thin wrapper around the current [`geerlingguy/top500-benchmark`](https://github.com/geerlingguy/top500-benchmark) playbook.

The wrapper updates upstream only when explicitly requested. It records the exact `master` commit and uses that same revision for both profiles, so a later upstream change cannot silently alter one side of the comparison.

::: tip IP-address decision
Do **not** enter `192.168.40.26`, `.27`, or `.28` in the offline Ubuntu installer. Leave the onboard NIC set to automatic/DHCP, accept that it has no lease while the cable is disconnected, and choose **Continue without network**.

After Ubuntu is installed and the MAC address is known, create the matching UniFi DHCP reservation while the node is still powered off. Connect the cable and boot; Ubuntu then receives its reserved address by DHCP. Much later, the OKD Agent configuration replaces Ubuntu and assigns the same address statically.
:::

| Stage | Cable | Node network configuration | Address owner |
|---|---|---|---|
| Offline Ubuntu installer | Disconnected | Automatic/DHCP selected, but no lease; no static IPv4 values entered | None yet |
| Temporary Ubuntu benchmark | Connected to an access/native Servers VLAN `40` port | DHCP in Ubuntu netplan | UniFi reservation supplies `.26`, `.27`, or `.28` |
| Final OKD installation | Connected to Servers VLAN `40` | Static NMState data embedded in `agent-config.yaml` | OKD Agent configuration assigns `.26`, `.27`, or `.28` |

This separation is intentional. It avoids an untestable static configuration during the offline installer, keeps one source of truth for temporary Ubuntu, and still proves that each recorded MAC maps to the address it will use under OKD.

## Install Temporary Ubuntu on the Ryzen Nodes

Install the nodes one at a time, but benchmark all three together. Use the same verified Ubuntu Server 26.04 amd64 ISO, installer choices, firmware baseline, and package-update pass on every system. These installations are disposable: the OKD Agent installer will overwrite them later.

The initial Ubuntu installation remains completely offline. Keep Ethernet unplugged until the installer finishes, the system shuts down, and the installer USB has been removed. The onboard NIC remains configured for DHCP so it can receive its reserved Servers-VLAN address on the first network-connected boot.

### Temporary Identity Plan

| Physical node | Ubuntu short hostname | SSH user | Reserved DHCP address | Final OKD address |
|---|---|---|---:|---:|
| First labeled system | `okd-cp-01` | `sean` | `192.168.40.26` | `192.168.40.26` |
| Second labeled system | `okd-cp-02` | `sean` | `192.168.40.27` | `192.168.40.27` |
| Third labeled system | `okd-cp-03` | `sean` | `192.168.40.28` | `192.168.40.28` |

Use the short hostname exactly as shown. The benchmark preflight requires the Ansible inventory name to equal `hostname -s`. Do not enter an FQDN in the Ubuntu server-name field.

Use the same strong, temporary sudo password for `sean` on all three systems and store it in the password manager. The benchmark wrapper prompts once with `--ask-become-pass` and uses that password on every node. Do not put it in Git, an inventory file, a shell command, or the benchmark log. OKD later erases these Ubuntu accounts and passwords.

### 1. Prepare and Label One System

Work on only one chassis at a time so the hostname, onboard MAC, and SSD serial cannot be assigned to the wrong node.

1. Install its intended 1 TB Patriot P400 Lite SSD.
2. Label the chassis `okd-cp-01`, `okd-cp-02`, or `okd-cp-03` before powering it on.
3. Leave its Ethernet cable disconnected.
4. Connect a keyboard, display, and the verified Ubuntu Server 26.04 installer USB.
5. Open HP Computer Setup with `F10` and apply the firmware baseline in [Build 04, Step 3](../build/compact-okd.md#step-3-inventory-and-prepare-each-ryzen-node).
6. Record the chassis serial, firmware version, onboard Ethernet MAC, installed memory, SSD model, and SSD serial in the private asset inventory.
7. Confirm the installer USB and 1 TB internal SSD are distinguishable by size and model before proceeding.

Reuse the same ISO and USB-writing method for all three nodes. Retain the ISO filename and its verified published SHA-256 checksum with the benchmark notes so the baseline can be reproduced.

### 2. Use These Ubuntu Installer Values

Choose the normal Ubuntu Server installation, not Ubuntu Desktop and not the minimized server option.

| Installer screen | Value |
|---|---|
| Language and keyboard | Use the same preferred English locale and keyboard layout on all three nodes. |
| Installer update | Skip it while offline. All nodes receive the same package-update pass after network onboarding. |
| Installation type | Full Ubuntu Server; do not select minimized. |
| Network | Leave the onboard Ethernet interface on automatic/DHCP. It will show no address because the cable is disconnected; choose **Continue without network**. Do not select manual IPv4 and do not enter `.26`, `.27`, or `.28`. |
| Proxy | Blank. |
| Ubuntu archive mirror | Accept the offline-media path; do not invent a proxy or mirror to bypass the connectivity check. |
| Storage | Guided use of the entire internal 1 TB SSD with the default LVM layout. No encryption, ZFS, or firmware RAID. |
| Storage confirmation | Verify the selected target by its recorded model, serial, and approximately 1 TB size. Never select the installer USB. |
| Your name | A descriptive local value such as `Sean`; it does not affect automation. |
| Server name | The exact short hostname from the identity table, such as `okd-cp-01`. |
| Username | `sean` on every node. |
| Password | The shared strong, temporary benchmark sudo password stored outside Git. |
| Ubuntu Pro | Skip for this disposable benchmark installation. |
| OpenSSH | Install OpenSSH Server. Do not import an online identity while the installer is offline. |
| Featured snaps | Select none. |

The default unencrypted LVM layout is intentional. It provides a consistent disposable operating system without adding encryption-unlock prompts or a storage design that OKD will immediately erase. Do not install `qemu-guest-agent`; these systems are bare metal, not Proxmox guests.

Let installation finish, select reboot, remove the installer USB when prompted, and verify the machine boots from the internal SSD. Log in locally once as `sean`, then shut it down:

```bash
hostname -s
sudo poweroff
```

The hostname must match the chassis label before the machine is connected to the homelab.

### 3. Prepare Its Switch Port and DHCP Reservation

While the node is powered off:

1. Configure its physical switch port as a native/access port on Servers VLAN `40`, with tagged VLANs blocked.
2. Confirm the planned address is unused. From `utility-01`, use the interface attached to `192.168.40.0/24`, commonly `ens18`:

   ```bash
   sudo arping -D -I <UTILITY_INTERFACE> -c 3 192.168.40.26
   ```

   Substitute `.27` or `.28` for the other nodes. Stop and investigate if any probe receives a reply.
3. In UniFi, create a Servers-network DHCP reservation mapping the recorded onboard MAC to the node's planned address.
4. Do not activate `okd.lab.seandre.dev`, its host records, or the UniFi Forward Domain yet. Use the reserved IP for temporary Ubuntu SSH.
5. Connect the onboard Ethernet port to the prepared switch port and boot the node.

Reusing `.26-.28` for temporary Ubuntu makes the existing benchmark inventory work without changing the final OKD address plan. Do not add those values to Ubuntu's installer or write them as static netplan addresses. DHCP remains the temporary Ubuntu source of truth; the later Agent installer supplies the final static OKD network configuration.

### 4. Verify the First Network-Connected Boot

At the local console, confirm the expected identity, lease, default route, DNS, and time configuration:

```bash
hostname -s
ip -brief link
ip -4 -brief address
ip route
resolvectl status
ping -c 3 192.168.40.1
```

The short hostname must be correct, the onboard interface must be `UP`, the address must match its reservation, and the default route and DNS must point through `192.168.40.1`.

If the disconnected installer did not leave the onboard NIC on DHCP, identify its name with `ip -brief link`, then edit the existing file under `/etc/netplan/` so it contains the equivalent of:

```yaml
network:
  version: 2
  ethernets:
    <ONBOARD_INTERFACE>:
      dhcp4: true
      dhcp6: false
```

Replace `<ONBOARD_INTERFACE>` with the actual wired interface, commonly `eno1`. Keep only one active definition for that interface, validate it from the console, and apply it:

```bash
sudo netplan generate
sudo netplan apply
ip -4 -brief address
ip route
```

Do not copy an interface name from another node; verify each system independently.

### 5. Bootstrap SSH from the Approved MacBook

The UniFi Trusted-to-Servers rule is limited to the approved MacBook, and Teleport has a separate VPN-to-Servers path. From the MacBook, connect by reserved IP with the temporary password, then install the exact key selected by this repository's `ansible.cfg`:

```bash
ssh sean@192.168.40.26
ssh-copy-id -i ~/.ssh/id_ed25519_github.pub sean@192.168.40.26
ssh -i ~/.ssh/id_ed25519_github sean@192.168.40.26
```

Repeat with `.27` and `.28`. Keep the first session open until the key-authenticated session succeeds. If a node has been reinstalled and SSH reports a changed host key, compare the new fingerprint at the local console before deliberately removing the old entry:

```bash
ssh-keygen -R 192.168.40.26
```

After key authentication works, password-based SSH may be disabled, but keep the local `sean` password because Ansible uses it for sudo. Validate any SSH change before closing the console or working session.

### 6. Apply the Same Post-Install Baseline

On each node, set the timezone, enable network time, install all current updates, and add only the packages needed for administration, inventory, and storage validation:

```bash
sudo timedatectl set-timezone America/Los_Angeles
sudo timedatectl set-ntp true

sudo apt update
sudo apt full-upgrade -y
sudo apt install -y \
  fio \
  lm-sensors \
  openssh-server \
  python3 \
  smartmontools

sudo systemctl enable --now ssh
test -x /usr/bin/sudo.ws
sudo reboot
```

Ubuntu 26.04 must provide `/usr/bin/sudo.ws`; the benchmark inventory selects it because Ansible's become prompt is not compatible with the default sudo-rs prompt. Stop and fix the baseline if `test -x /usr/bin/sudo.ws` fails.

Do not enable UFW on these temporary installations. The upstream HPL workflow configures inter-node SSH and runs MPI traffic among all three Servers-VLAN hosts; a default host firewall can break that traffic or skew troubleshooting. The UniFi Servers zone still prevents these nodes from initiating into client, IoT, Services, Management, Internal, or VPN zones, and no service is forwarded from the public Internet.

After reboot, collect the same facts on every node:

```bash
hostnamectl
timedatectl
uname -r
nproc
free -h
ip -brief link
ip -4 -brief address
lsblk -e7 -o NAME,PATH,SIZE,MODEL,SERIAL,TYPE,TRAN
sudo smartctl --all /dev/<INSTALL_DISK>
```

Expected results include the correct short hostname, synchronized time, 12 logical CPUs, the reserved address, 16 GB initial memory, and one approximately 1 TB installation SSD. Replace `<INSTALL_DISK>` with the verified internal SSD, not a partition and never a USB device.

### 7. Repeat, Then Validate All Three Together

Power off or leave the completed node running, then repeat the same labeled procedure for the next chassis. Do not reuse a hostname, reservation, MAC, or recorded SSD identity.

After all three nodes are online, run these checks from the repository root on the MacBook:

```bash
ansible benchmark_baremetal --list-hosts
ansible benchmark_baremetal -m ping
ansible benchmark_baremetal -a 'hostname -s'
ansible benchmark_baremetal -a 'nproc'
ansible benchmark_baremetal \
  --become \
  --ask-become-pass \
  -a 'id -u'
```

The host list must contain exactly `okd-cp-01`, `okd-cp-02`, and `okd-cp-03`; every ping must return `pong`; hostnames must match inventory; every `nproc` must return `12`; and the become check must return `0`.

Before measuring performance, reboot all three nodes after the same update pass and wait for startup activity to settle. Do not run package upgrades, SMART long tests, `fio`, backups, or other load while HPL is running.

## Prerequisites

All six benchmark hosts must run Ubuntu 20.04 or newer, be reachable as SSH user `sean`, and allow Ansible to use sudo. Inventory names must match each machine's short hostname. Install the Ansible collections referenced by upstream once:

```bash
ansible-galaxy collection install -r ansible/requirements.yml
```

The k3s profile expects these assigned logical CPUs:

| Host | Logical CPUs |
|---|---:|
| `k8s-control-01` | 2 |
| `k8s-worker-01` | 4 |
| `k8s-worker-02` | 4 |

The bare-metal profile expects 12 SMT threads on each of `okd-cp-01`, `okd-cp-02`, and `okd-cp-03`, for 36 ranks total. Keep SMT enabled and align firmware and memory settings across the Ryzen systems.

Ubuntu 26.04 provides classic sudo as `/usr/bin/sudo.ws`; the benchmark inventory already selects it for these hosts. The complete workflow prompts once for the become password unless `sean` has passwordless sudo.

## Select an Upstream Revision

From the repository root, fetch the latest upstream `master` deliberately:

```bash
scripts/hpl-benchmark update
```

This stores an ignored checkout and its exact selected SHA under `.cache/top500-benchmark/`. Benchmark commands never fetch or move that revision. Run `update` again only when both profiles should move to newer upstream code.

Each revision builds in its own remote directory:

```text
/opt/top500/builds/<full-upstream-sha>
```

Old builds remain available until they are removed manually.

## Run Both Profiles

Run the complete upstream setup, persistent inter-node SSH configuration, and benchmark for k3s:

```bash
scripts/hpl-benchmark k3s
```

Then run the complete workflow for the Ryzen systems using the same selected SHA:

```bash
scripts/hpl-benchmark baremetal
```

The wrapper validates SSH fact gathering, the exact three-host overlay, hostnames, Ubuntu support, logical CPU counts, and `P x Q` before invoking upstream. It uses one Ansible fork for the shared-host VMs and three for bare metal.

The profiles retain upstream behavior:

- MPICH, OpenBLAS, and HPL are installed and compiled by upstream.
- Compilation uses native x86 tuning flags.
- k3s uses 10 ranks, a `2 x 5` grid, and 30 GiB aggregate benchmark memory.
- Bare metal uses all 36 SMT threads, a `6 x 6` grid, and fact-derived memory sizing.
- Upstream creates persistent RSA keys and `/etc/hosts` entries for inter-node MPI.
- The CPU governor may remain set to `performance`.
- k3s stays running during the VM benchmark.
- Upstream performs one HPL run and prints its raw result.

## Rerun Only HPL

After a successful complete workflow, rerun only the upstream benchmark without rebuilding or reconfiguring SSH:

```bash
scripts/hpl-benchmark k3s benchmark
scripts/hpl-benchmark baremetal benchmark
```

These commands use the selected revision and its revision-specific build. They fail with an instruction to run `update` if no revision has been selected.

## Compare Results

Every invocation writes a raw log here:

```text
benchmark-results/<UTC-timestamp>-<short-sha>/
├── <profile>.log
└── <profile>.md
```

The `.log` header records the full upstream SHA, profile, mode, remote build root, and exact preflight and upstream commands. Its footer records the upstream exit status. Ansible writes directly to this file; when launched from an interactive terminal, a separate `tail` process mirrors it for live progress without putting the benchmark behind a fragile output pipe. The `.md` sidecar summarizes the outcome, GFLOPS, solve time, matrix and block sizes, MPI layout, approximate matrix storage, residual, hosts, revision, and timestamps. The directory is ignored by Git.

To create or recreate a sidecar for an existing raw log:

```bash
scripts/hpl-benchmark summarize benchmark-results/<run>/<profile>.log
```

Find the HPL result rows and residual checks in both logs:

```bash
rg -n -A2 'Gflops|PASSED|FAILED' benchmark-results/*/*.log
```

The scientific-notation value in the `Gflops` column is the headline result. Compare only logs with the same full upstream SHA. The totals describe the capability of different systems; they do not isolate virtualization overhead.

Do not let OKD overwrite the Ryzen disks until the intended bare-metal log contains a passing residual and a valid GFLOPS result, and the logs have been backed up somewhere durable.
