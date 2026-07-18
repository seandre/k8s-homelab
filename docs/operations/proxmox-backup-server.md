# Operations 05: Proxmox Backup Server on `pve-01`

**Status:** Planned — complete this runbook during the Nexus backup checkpoint in [Build 03](../build/pve-02-and-bastion.md#back-up-and-restore-nexus-before-relying-on-it).

This runbook builds `pbs-01` as a Proxmox Backup Server VM on `pve-01`. Its first responsibility is to hold recoverable backups of `bastion-01`, which runs on the separate physical host `pve-02`. The first successful backup is not the completion gate: restore that backup into an isolated VM and download a known Nexus artifact before allowing Nexus to become an OKD dependency.

## Scope and Failure-Domain Boundary

This design deliberately provides one additional physical failure domain without buying a NAS first:

- the source VM and its disk are on `pve-02`;
- the PBS VM and its datastore disk are on `pve-01`; and
- the two Proxmox hosts remain standalone and communicate with PBS over the server VLAN.

A failed `pve-02` or its 512 GB disk does not destroy the PBS copy on `pve-01`. This is sufficient for the first Nexus restore exercise, but it is not a complete backup design for `pve-01`: the PBS VM and datastore share `pve-01`'s single 2 TB `vmdata` NVMe with its workloads. A `pve-01` hardware or `vmdata` failure can lose both `pbs-01` and all backups stored in it.

Do not:

- install the PBS packages directly on the Proxmox VE host;
- store the datastore on `pve-01`'s 256 GB `local` system storage;
- back up `pbs-01` into its own datastore;
- describe backups of VMs on `pve-01` to this datastore as host-failure protection; or
- join the two Proxmox hosts into a cluster merely to configure backups.

When a NAS or separate backup host is added, make it a second independently recoverable copy or move PBS onto dedicated hardware. RAID in a future NAS improves disk availability but does not replace a second backup copy.

## Target Design

The `.34` address is proposed because it follows the current infrastructure range. Confirm in UniFi that it is unused before creating a reservation or DNS record.

| Item | Planned value |
|---|---|
| Proxmox host | `pve-01` |
| VM name | `pbs-01` |
| VM address | `192.168.40.34/24`, pending collision check and reservation |
| Private name | `pbs-01.lab.home.arpa` |
| Gateway and DNS | `192.168.40.1` |
| Network | `vmbr0`; native `Servers` network; no VM VLAN tag |
| PBS release | Current supported PBS 4.x installer, with version and checksum recorded at execution time |
| CPU | 4 vCPU; CPU type `host` |
| Memory | 6144 MiB; ballooning disabled |
| OS disk | 64 GiB on `pve-01` `vmdata` |
| Datastore disk | 500 GiB on `pve-01` `vmdata`; expand later rather than preallocating for a future mirror |
| Disk controller | VirtIO SCSI single; discard and I/O thread enabled; default cache mode |
| Datastore filesystem | `ext4` inside the PBS VM |
| Datastore name | `pve02-backups` |
| Initial protected VM | `bastion-01` on standalone `pve-02` |
| PBS management URL | `https://192.168.40.34:8007` until separate private DNS/TLS work is completed |

The sizing follows the current [PBS system requirements](https://pbs.proxmox.com/docs/system-requirements.html): at least 4 GiB for PBS plus additional memory for the datastore. Use `ext4` rather than nested ZFS because the datastore is a virtual disk, not direct access to redundant physical disks. PBS supports an `ext4` datastore as documented in [Backup Storage](https://pbs.proxmox.com/docs/storage.html).

## Phase 1: Prove Capacity and Reserve the Address

Open a root shell on `pve-01` and capture the actual storage state before creating disks:

```bash
pvesm status
pvesm status --storage vmdata
lvs -a -o vg_name,lv_name,lv_size,data_percent,metadata_percent
free -h
qm list
```

Proceed only if the 64 GiB OS disk, 500 GiB datastore disk, existing virtual disks, and expected growth fit without depending on thin-pool overcommit. Preserve at least 20 percent physical headroom in `vmdata`; a full LVM-thin pool can damage every VM that uses it. If this capacity gate fails, reduce the initial datastore size only after comparing it with the used space in `bastion-01`, or stop and add backup storage.

Before claiming `.34`:

1. Search UniFi clients, DHCP reservations, and DNS records for `192.168.40.34`.
2. From the `Servers` network, confirm that neither a ping nor a neighbor entry identifies an existing device. Silence alone does not prove that an address is free.
3. Create the UniFi reservation and private Host (A) record for `pbs-01.lab.home.arpa` only after the inventory check passes.
4. Do not create a public Cloudflare A or AAAA record.

## Phase 2: Create and Install `pbs-01`

Download a current PBS 4.x ISO from the official [Proxmox downloads page](https://www.proxmox.com/en/downloads/proxmox-backup-server/iso), verify its published checksum, record the chosen version, and upload the ISO to `pve-01` `local`. Do not silently reuse a stale PBS 3 ISO; check the current [PBS support table](https://pbs.proxmox.com/docs/faq.html) before installation.

Create the VM in the `pve-01` UI with the values in the target-design table. Attach the 64 GiB OS disk as `scsi0` and the 500 GiB datastore disk as `scsi1`. During installation, select only the 64 GiB `scsi0` disk as the operating-system target. Selecting the datastore disk would erase the separation the design depends on.

Use these installer network values after the `.34` reservation is confirmed:

```text
Hostname: pbs-01.lab.home.arpa
Address:  192.168.40.34/24
Gateway:  192.168.40.1
DNS:      192.168.40.1
```

After the first boot:

1. Open `https://192.168.40.34:8007` and sign in as `root@pam`.
2. If there is no subscription, disable the enterprise repository and add the PBS 4 no-subscription repository under **Administration → Updates → Repositories**. Do not enable the test repository.
3. Install all available updates and reboot.
4. Install and enable `qemu-guest-agent`, then enable the guest-agent option for the VM in Proxmox.
5. Enable **Start at boot** only after the network and datastore validation below passes.

Validate from the PBS console:

```bash
hostname --fqdn
ip -br address
ip route
ping -c 3 192.168.40.1
systemctl is-active proxmox-backup-proxy
systemctl is-active qemu-guest-agent
```

From `utility-01` or a trusted client, validate the management path without disabling certificate verification globally:

```bash
ping -c 3 192.168.40.34
nc -vz 192.168.40.34 8007
```

The initial PBS certificate is self-signed. Record its SHA-256 fingerprint for Proxmox VE integration:

```bash
proxmox-backup-manager cert info
```

Compare the fingerprint shown by the browser or Proxmox VE with the value read directly from the PBS console. Do not accept an unverified fingerprint copied from an unexpected prompt.

## Phase 3: Create the Datastore and Maintenance Policy

In PBS, open **Administration → Storage/Disks → Directory** and create an `ext4` filesystem on the unused 500 GiB `scsi1` disk. Name and add it as datastore `pve02-backups`. Do not format the 64 GiB operating-system disk.

Validate the result:

```bash
lsblk -f
df -h
proxmox-backup-manager datastore list
```

Configure a conservative initial policy:

| Function | Initial policy |
|---|---|
| Verify new backups | Enabled |
| Prune | Daily after the backup window |
| Retention | `keep-last=3`, `keep-daily=7`, `keep-weekly=4`, `keep-monthly=3` |
| Garbage collection | Weekly, after pruning and outside the backup window |
| Full reverification | Monthly |
| Notifications | Errors for backup, prune, garbage-collection, and verification tasks |

Pruning removes snapshot references; garbage collection later reclaims unreferenced chunks. Review the current [PBS maintenance documentation](https://pbs.proxmox.com/docs/maintenance.html) before changing their order or schedules. Monitor both the filesystem and the underlying `vmdata` thin pool; free space reported inside `pbs-01` does not replace host-level thin-pool monitoring.

## Phase 4: Create Restricted Proxmox VE Credentials

Do not store the PBS root password in either Proxmox host. In the PBS UI:

1. Create user `pve-02@pbs`.
2. Grant that user `DatastoreBackup` on `/datastore/pve02-backups`.
3. Generate API token `pve` for the user.
4. Grant the token `pve-02@pbs!pve` the same `DatastoreBackup` role on `/datastore/pve02-backups`; tokens need their own ACL and cannot exceed their user's permissions.
5. Save the one-time token secret in the password manager. Never commit it or paste it into diagnostics.

Confirm the effective permission from the PBS console:

```bash
proxmox-backup-manager user permissions \
  'pve-02@pbs!pve' \
  --path /datastore/pve02-backups
```

The token should have datastore backup permission only. The official [PBS user-management guide](https://pbs.proxmox.com/docs/user-management.html) documents token intersection and the `DatastoreBackup` role.

## Phase 5: Add PBS to Both Standalone Proxmox Hosts

On `pve-02`, open **Datacenter → Storage → Add → Proxmox Backup Server** and enter:

| Field | Value |
|---|---|
| ID | `pbs-pve02` |
| Server | `192.168.40.34` |
| Username | `pve-02@pbs!pve` |
| Password | The API-token secret |
| Datastore | `pve02-backups` |
| Fingerprint | The fingerprint verified on the PBS console |
| Nodes | `pve-02` only |

The hosts remain standalone; PBS is network storage and does not require a Proxmox cluster. Confirm on `pve-02`:

```bash
pvesm status --storage pbs-pve02
```

Also add the same PBS datastore to `pve-01` as `pbs-pve02-restore`, restricted to node `pve-01`. This second storage entry exists only so the restore drill can create a disposable VM on the larger `vmdata` pool. Use the same verified fingerprint and token. Proxmox documents this native standalone-host integration in [Proxmox VE Integration](https://pbs.proxmox.com/docs/pve-integration.html).

## Phase 6: Make the First Nexus Recovery Point

Before backup, create or identify a harmless test artifact in the Nexus artifact repository and record:

- its repository and path;
- its size; and
- a SHA-256 checksum calculated after downloading it from the live instance.

In Nexus, run the configured **Admin – Backup H2 Database** task and confirm it succeeds. The PBS VM backup must contain the matching database, blob stores, configuration, and node keystore from the same stopped filesystem state.

In the `pve-02` Proxmox UI, create the first backup of `bastion-01` with:

| Setting | Value |
|---|---|
| Storage | `pbs-pve02` |
| Mode | `Stop` |
| Compression | PBS default |
| Protected | Enable for the acceptance-test recovery point |
| Notes | Nexus version, H2 task completion, and test-artifact checksum |

The first backup may take substantially longer than later deduplicated backups. `Stop` mode is intentional for this acceptance test: availability is not yet a requirement, and no Nexus database or blob writes can continue while the VM disks are copied. Confirm that Proxmox restarts `bastion-01` after the job, then verify DNS, HAProxy, and Nexus again.

In PBS, confirm that the snapshot completed without warnings and that verification succeeds. Do not count a partially completed or unverified snapshot as a recovery point.

## Phase 7: Perform an Isolated Restore Drill

Restore onto `pve-01`, not onto the constrained 512 GB `pve-02` disk. Before the drill, confirm that `vmdata` and host RAM have enough headroom for the restored disk and temporary VM. Shut down `utility-01` for the short test window if necessary rather than forcing the 64 GB host into memory pressure.

From `pve-01`:

1. Select the protected `bastion-01` snapshot on `pbs-pve02-restore`.
2. Restore it to a new unused VM ID and a name such as `restore-test-bastion-01` on `vmdata`.
3. Leave **Start after restore** disabled.
4. Before first boot, disconnect the restored VM's virtual NIC. Do not allow its `.33`, `.29`, or `.31` addresses onto the production VLAN while the original VM is running.
5. If necessary for the temporary test, reduce its RAM only to a value at which the pinned Nexus release can still start; do not hide an out-of-memory failure by declaring a partial restore successful.
6. Start the VM from its Proxmox console with the NIC still disconnected.

Because Nexus listens on loopback, the restored service can be tested without joining the production network. On the restored VM console:

```bash
systemctl is-active nexus
ss -ltnp | grep 127.0.0.1:8081
curl --fail http://127.0.0.1:8081/
```

Download the known artifact through the restored Nexus loopback listener, calculate its SHA-256 checksum, and compare it with the checksum recorded before backup. Also confirm that the expected repository configuration exists. The HAProxy service may be unable to bind its production addresses while the NIC is disconnected; that is expected and is not a Nexus restore failure.

After collecting non-secret evidence:

1. shut down `restore-test-bastion-01`;
2. verify the original `bastion-01` is healthy;
3. delete only the identified disposable restore-test VM and its disks;
4. restart `utility-01` if it was stopped; and
5. confirm `pve-01` memory and `vmdata` usage returned to the expected level.

Never start the restored VM with its production NIC connected merely to make the test easier.

## Phase 8: Schedule and Operate the Backup

After the recovery drill succeeds, create a scheduled `bastion-01` backup job on `pve-02`. Begin with a daily low-traffic window and `Stop` mode. Schedule the Nexus H2 task before that window and alert on either task failing. Revisit the downtime choice only after a vendor-supported online database-and-blob procedure is documented and tested; a crash-consistent snapshot alone does not replace application consistency.

At least monthly:

- inspect PBS task failures and notification delivery;
- confirm the protected recovery point and retention policy still exist;
- run or review full verification;
- check `df -h` in `pbs-01` and LVM-thin usage on `pve-01`;
- test a file or artifact read from a recent backup; and
- perform a full isolated restore after major Nexus or PBS upgrades.

Do not add `pve-01` VMs to this job and call them protected from `pve-01` loss. They may be copied here for convenient rollback, but genuine host-loss protection requires a datastore outside `pve-01`.

## Completion Gate

| Done | Acceptance criterion |
|:---:|---|
| ☐ | `.34` was confirmed unused and reserved before `pbs-01` used it. |
| ☐ | `pbs-01` runs a supported PBS 4.x release with current updates. |
| ☐ | The OS and `pve02-backups` datastore use separate virtual disks on `vmdata`. |
| ☐ | Host-level capacity monitoring leaves at least 20 percent physical `vmdata` headroom. |
| ☐ | `pve-02` reaches `pbs-pve02` using a restricted API token and verified certificate fingerprint. |
| ☐ | The H2 task and stopped `bastion-01` backup completed successfully. |
| ☐ | PBS verification completed without errors. |
| ☐ | A restored, network-isolated VM started the same pinned Nexus release. |
| ☐ | The known test artifact downloaded from the restored Nexus instance and matched its original SHA-256 checksum. |
| ☐ | Prune, garbage-collection, verification, and failure-notification policies are scheduled. |
| ☐ | The limitations of a PBS datastore located on `pve-01` are preserved in the recovery documentation. |

Only after every recovery criterion passes may the Nexus backup checkbox in Build 03 be marked complete.
