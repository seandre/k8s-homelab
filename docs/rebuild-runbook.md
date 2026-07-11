# Rebuild Runbook

This runbook restores the homelab control plane and GitOps-managed resources. Hardware, addresses, VM sizes, and storage live in [Infrastructure Reference](infrastructure.md). Persistent application data requires a separate backup and restore procedure.

## Recovery Boundaries

Git contains Kubernetes desired state, Ansible automation, and documentation. It does not contain:

- Proxmox installation or VM disks.
- Kubeconfigs, SSH private keys, or other credentials.
- PersistentVolume data.
- The existing homelab CA private key.

A full rebuild can create a new CA, but clients must then trust the new root certificate. Do not call recovery complete until stateful data has also been restored and tested.

## Rebuild Order

1. Install and configure `pve-01` and `vmdata` according to [Infrastructure Reference](infrastructure.md).
2. Recreate the Ubuntu Server 26.04 template with OpenSSH and `qemu-guest-agent`.
3. Recreate the three Kubernetes VMs with the documented sizes and addresses.
4. Confirm SSH access and update `ansible/inventory/hosts.ini` if addresses changed.
5. Prepare the nodes and install k3s with Ansible.
6. Put the fetched kubeconfig at `~/.kube/k8s-homelab.yaml`.
7. Bootstrap Argo CD.
8. Let the root application reconcile infrastructure, monitoring, and apps from Git.
9. Restore external DNS records and client CA trust.
10. Restore and test persistent application data.

## Proxmox and Ubuntu

Use the normal Ubuntu Server install, not the minimized option, and skip featured server snaps. Enable OpenSSH and install `qemu-guest-agent`.

After increasing a clone's virtual disk in Proxmox, grow the Ubuntu LVM root filesystem:

```bash
lsblk
sudo growpart /dev/sda 3
sudo pvresize /dev/sda3
sudo lvextend -r -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
df -h
```

Use `/dev/vda3` if the virtual disk is `/dev/vda`.

## Verify Ansible Access

From the repository root:

```bash
ansible-inventory --graph
ansible k3s_cluster -m ping
```

The configured SSH user is `sean`. If sudo requires a password, use Ansible's `--ask-become-pass` option. Temporary passwordless sudo is acceptable only during bootstrap and must be removed immediately afterward.

## Install k3s

The install playbook prepares all Kubernetes nodes, installs the control plane with bundled Traefik and ServiceLB disabled, joins the workers, waits for them to become ready, and fetches a kubeconfig:

```bash
ansible-playbook --ask-become-pass ansible/playbooks/install-k3s.yml
```

Install the fetched kubeconfig at the standard workstation path:

```bash
mkdir -p ~/.kube
install -m 0600 kubeconfig/homelab.kubeconfig ~/.kube/k8s-homelab.yaml
export KUBECONFIG="$HOME/.kube/k8s-homelab.yaml"
kubectl get nodes -o wide
kubectl get pods -A
```

All three nodes must report `Ready` before bootstrap continues.

## Bootstrap Argo CD

Apply the one-time bootstrap manifests with server-side apply:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl apply --server-side --force-conflicts -k kubernetes/bootstrap
```

Server-side apply is required because the Argo CD CRDs exceed the client-side annotation limit.

Wait for the Argo CD pods, then inspect the root application:

```bash
kubectl -n argocd get pods
kubectl -n argocd get application homelab
kubectl get applications.argoproj.io -A
```

Initial UI access is available through a port forward while ingress reconciles:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Open `https://localhost:8080`.

## Reconcile Desired State

The `homelab` root application creates and reconciles:

- `homelab-infrastructure`: MetalLB, Traefik, cert-manager, and ingress resources.
- `homelab-monitoring`: kube-prometheus-stack and Grafana ingress.
- `homelab-apps`: nginx test, Homepage, and KOReader Sync.

Normal recovery should come from Git reconciliation. Use direct `kubectl apply` only for bootstrap or break-glass recovery.

If Argo CD has not noticed the current revision, request a hard refresh:

```bash
kubectl -n argocd annotate application homelab argocd.argoproj.io/refresh=hard --overwrite
kubectl get applications.argoproj.io -A
```

## Restore External State

Recreate the internal DNS records listed in [Infrastructure Reference](infrastructure.md). All Kubernetes application hostnames point to `192.168.40.30`.

If the CA was regenerated, export the new public root certificate and reinstall it on client devices. Never copy the CA private key into Git.

Restore persistent data only after the corresponding workloads and PVCs exist. KOReader-specific checks are in [KOReader Sync Runbook](koreader-sync-runbook.md).

## Validate Recovery

```bash
kubectl get nodes -o wide
kubectl get applications.argoproj.io -A
kubectl get pods -A
kubectl get ingress -A
kubectl get certificate -A
kubectl get pvc -A
curl -k -I https://argocd.lab.home.arpa
curl -k -I https://grafana.lab.home.arpa
curl -k -I https://home.lab.home.arpa
curl -k -I https://nginx-test.lab.home.arpa
curl -k -I https://kosync.lab.home.arpa
```

Recovery is complete when nodes are ready, Argo CD applications are synced and healthy, workloads are running, certificates are ready, endpoints respond, and restored application data has been verified.

Use [Troubleshooting](troubleshooting.md) when any layer fails.
