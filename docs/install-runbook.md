# Install Runbook

## Active Phase: Current Manual Build

- [x] Create Proxmox USB installer
- [x] Enable Intel virtualization in BIOS
- [x] Disable Secure Boot if needed
- [x] Install Proxmox on 256 GB NVMe
- [x] Add 2 TB NVMe in Proxmox as LVM-thin storage `vmdata`
- [ ] Set Proxmox hostname to `pve-01.lab.home.arpa`
- [x] Attach Proxmox to the UniFi `Servers` network
- [x] Set Proxmox IP to `192.168.40.20`
- [x] Open Proxmox UI at `https://192.168.40.20:8006`
- [x] Upload Ubuntu Server ISO
- [x] Create Ubuntu Server VM template
- [x] Use Ubuntu Server 26.04 normal install for the template
- [x] Do not use Ubuntu minimized install
- [x] Do not install featured server snaps
- [x] Enable OpenSSH
- [x] Install `qemu-guest-agent`
- [x] Treat the `systemctl enable` warning for qemu guest agent as non-fatal
- [x] Create or verify the UDM Pro Homelab network on VLAN ID `40`
- [x] Verify gateway reachability at `192.168.40.1`
- [x] Clone Kubernetes VMs
- [x] Clone `k8s-control-01`
- [x] Set `k8s-control-01` hostname and static IP
- [x] Set `k8s-worker-01` hostname and static IP
- [x] Set `k8s-worker-02` hostname and static IP
- [x] Verify SSH to `k8s-control-01`
- [x] Verify SSH to worker nodes
- [x] Resolve UniFi UDM Pro Intrusion Prevention blocking SSH/TCP checks
- [x] Temporarily enable passwordless sudo for node prep
- [x] Run Kubernetes node prep on all nodes
- [x] Remove temporary passwordless sudo and return to password-required sudo
- [x] Install k3s control plane
- [x] Join k3s workers
- [x] Add Argo CD
- [x] Add ingress
- [x] Add cert-manager
- [x] Add monitoring
- [ ] Deploy first real app

## VM Disk Resize Procedure

Resize the VM disk in the Proxmox GUI first. Proxmox disk resize is additive, so from a 40 GB Ubuntu Server template disk:

- `k8s-control-01` target 80 GB: add `+40G`
- `k8s-worker-01` target 150 GB: add `+110G`
- `k8s-worker-02` target 150 GB: add `+110G`

Inside Ubuntu, the install used LVM. Use `lsblk` first to confirm the disk and partition layout, then resize the LVM-backed root filesystem:

```bash
sudo growpart /dev/sda 3
sudo pvresize /dev/sda3
sudo lvextend -r -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
df -h
```

If the disk appears as `/dev/vda` instead of `/dev/sda`, use `/dev/vda3`.

## Ubuntu Template Notes

The template was built from Ubuntu Server 26.04 using the normal install. The minimized install was not used, no featured server snaps were installed, OpenSSH was enabled, and `qemu-guest-agent` was installed.

The qemu guest agent `systemctl enable` warning was encountered and treated as non-fatal.

## Kubernetes Node Prep

If running node prep through Ansible or non-interactive SSH, temporarily allow `sean` to use passwordless sudo on each node:

```bash
echo 'sean ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/99-sean-homelab-bootstrap
sudo chmod 440 /etc/sudoers.d/99-sean-homelab-bootstrap
```

Run the node prep playbook from the repo:

```bash
ansible-playbook ansible/playbooks/prep-k8s-nodes.yml
```

After prep is complete and verified, remove the temporary sudoers file on each node so `sudo` requires a password again:

```bash
sudo rm /etc/sudoers.d/99-sean-homelab-bootstrap
```

Current status: node prep completed on `k8s-control-01`, `k8s-worker-01`, and `k8s-worker-02`. The temporary sudoers file was removed and `sudo` requires a password again.

## k3s Control Plane

The k3s server was installed on `k8s-control-01` (`192.168.40.21`) first, then the workers were joined in the next milestone.

Install command used:

```bash
curl -sfL https://get.k3s.io | sh -s - server \
  --node-ip 192.168.40.21 \
  --advertise-address 192.168.40.21 \
  --tls-san 192.168.40.21 \
  --disable traefik \
  --disable servicelb
```

Installed version: `v1.36.2+k3s1`.

Validation completed on the control node:

- `systemctl is-active k3s` returned `active`
- `k8s-control-01` reported `Ready`
- `coredns`, `local-path-provisioner`, and `metrics-server` reported `Running`
- bundled Traefik and ServiceLB were disabled
- workstation `kubectl` access using `~/.kube/k8s-homelab.yaml` succeeded

The workstation kubeconfig was fetched to `~/.kube/k8s-homelab.yaml` and rewritten to use `https://192.168.40.21:6443`.

Temporary passwordless sudo was removed from `k8s-control-01` after installation, and `sudo -n true` again requires interactive authentication.

## k3s Worker Join

The worker nodes were joined to the k3s cluster:

- `k8s-worker-01` (`192.168.40.22`)
- `k8s-worker-02` (`192.168.40.23`)

Join commands used:

```bash
curl -sfL https://get.k3s.io | K3S_URL=https://192.168.40.21:6443 K3S_TOKEN='<TOKEN>' sh -s - agent \
  --node-ip 192.168.40.22

curl -sfL https://get.k3s.io | K3S_URL=https://192.168.40.21:6443 K3S_TOKEN='<TOKEN>' sh -s - agent \
  --node-ip 192.168.40.23
```

Validation completed:

- `k8s-control-01`, `k8s-worker-01`, and `k8s-worker-02` reported `Ready`
- all nodes are running k3s `v1.36.2+k3s1`
- `k3s-agent` is `active` and `enabled` on both workers
- workstation `kubectl get nodes -o wide` using `~/.kube/k8s-homelab.yaml` succeeded

Temporary passwordless sudo was removed from all three Kubernetes nodes after the worker join, and `sudo -n true` again requires interactive authentication.

## Argo CD

Argo CD was installed into the `argocd` namespace from the official stable install manifest using the bootstrap kustomization at `kubernetes/bootstrap`.

Apply command used:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl apply --server-side --force-conflicts -k kubernetes/bootstrap
```

Server-side apply was required because the `applicationsets.argoproj.io` CRD is too large for the client-side apply annotation limit.

Installed version from the stable manifest: `v3.4.4`.

Validation completed:

- `argocd-application-controller` statefulset rolled out
- `argocd-applicationset-controller`, `argocd-dex-server`, `argocd-notifications-controller`, `argocd-redis`, `argocd-repo-server`, and `argocd-server` deployments rolled out
- all Argo CD pods reported `1/1 Running`
- `argocd-server` is currently `ClusterIP`; use port-forward access until ingress is installed
- the `homelab` root application reconciles this repo from GitHub
- `homelab-infrastructure` and `homelab-apps` child applications are defined for future manifests

Initial local access:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n argocd port-forward svc/argocd-server 8080:443
```

Then open `https://localhost:8080`.

Fetch the initial admin password when needed:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
```

## Ingress

Ingress is managed by the homelab infrastructure application at `kubernetes/clusters/homelab/infrastructure`.

Components:

- MetalLB assigns the reserved ingress VIP `192.168.40.30`.
- Traefik runs in the `traefik` namespace and exposes ports `80` and `443` through a `LoadBalancer` Service.
- Argo CD is exposed at `http://argocd.lab.home.arpa`.
- A simple nginx test app is exposed at `http://nginx-test.lab.home.arpa`.

Current status: ingress is installed and working. Traefik receives `192.168.40.30`, Argo CD is reachable through `argocd.lab.home.arpa`, and the nginx test app is reachable through `nginx-test.lab.home.arpa`.

Create UniFi DNS records for `argocd.lab.home.arpa` and `nginx-test.lab.home.arpa` pointing at `192.168.40.30`.

Validation commands:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n metallb-system rollout status deployment/controller
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n metallb-system rollout status daemonset/speaker
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n traefik rollout status deployment/traefik
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n traefik get svc traefik
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get ingressclass
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get ingress -A
curl -H 'Host: nginx-test.lab.home.arpa' http://192.168.40.30/
```

Ingress sync ordering matters during bootstrap:

- MetalLB CRDs and controllers must exist before MetalLB custom resources can be applied.
- The `IPAddressPool` and `L2Advertisement` for `192.168.40.30` must exist before Traefik's `LoadBalancer` Service can become healthy.
- Traefik's `LoadBalancer` Service must be ready before Argo CD and app ingress routes are useful.

The manifests encode this with Argo CD sync waves:

- MetalLB pool and L2 advertisement: wave `1`
- Traefik `LoadBalancer` Service: wave `2`
- Argo CD ingress: wave `3`

If `homelab-infrastructure` is `OutOfSync` and the only missing resources are `IPAddressPool` and `L2Advertisement`, check for a sync-wave dependency loop. A common symptom is Traefik stuck with `EXTERNAL-IP <pending>` because the MetalLB pool has not been applied yet.

If Traefik has the external IP but every host returns `404 page not found`, traffic is reaching Traefik but routes are not active. Check Traefik logs:

```bash
kubectl -n traefik logs deployment/traefik --tail=160
```

During bootstrap, Traefik logged this RBAC failure:

```text
nodes is forbidden: User "system:serviceaccount:traefik:traefik" cannot list resource "nodes"
```

The Traefik ClusterRole must allow `get`, `list`, and `watch` on `nodes` so its Kubernetes provider can watch the cluster state it needs.

Argo CD is configured with `server.insecure: "true"` so Traefik can route internal HTTP before cert-manager is installed. Restart `argocd-server` after the first ingress sync if the setting is not picked up immediately:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl -n argocd rollout restart deployment/argocd-server
```

## cert-manager

cert-manager is managed by the homelab infrastructure application at `kubernetes/clusters/homelab/infrastructure`.

Components:

- cert-manager `v1.20.3` is installed from the pinned upstream release manifest.
- `homelab-selfsigned` bootstraps the lab root CA certificate.
- `homelab-root-ca` stores the internal CA in the `cert-manager` namespace.
- `homelab-ca` is the ClusterIssuer used by internal service ingresses.
- Argo CD and the nginx test app use cert-manager ingress annotations and Traefik TLS routers.

Current status: cert-manager is installed and working. `homelab-ca` is ready, both ingress certificates are ready, Argo CD is reachable at `https://argocd.lab.home.arpa`, and the nginx test app is reachable at `https://nginx-test.lab.home.arpa`.

Validation commands:

```bash
kubectl -n argocd get application homelab-infrastructure
kubectl -n cert-manager get pods
kubectl get clusterissuer
kubectl get certificate -A
kubectl describe certificate -n argocd argocd-server-tls
kubectl describe certificate -n nginx-test nginx-test-tls
curl -k -I https://argocd.lab.home.arpa
curl -k -I https://nginx-test.lab.home.arpa
```

Expected results:

- `homelab-infrastructure` reports `Synced` and `Healthy`.
- `cert-manager`, `cert-manager-cainjector`, and `cert-manager-webhook` pods are `Running`.
- `homelab-ca` reports `Ready=True`.
- `argocd-server-tls` and `nginx-test-tls` report `Ready=True`.
- Both HTTPS probes return `HTTP/2 200`.

cert-manager has three separate parts to reason about:

- Controller: the cert-manager pods, webhook, CRDs, and reconcilers must be installed first.
- Issuer: an `Issuer` or `ClusterIssuer` defines how certificates are signed.
- Certificate: a `Certificate` resource, or an annotated ingress shim, requests a concrete TLS secret.

Troubleshooting notes:

- If Argo CD reports missing cert-manager custom resource types during the first sync, verify `SkipDryRunOnMissingResource=true` is present on the infrastructure application or the cert-manager custom resources.
- If certificates are ready but Traefik returns `404 page not found` on HTTPS, confirm the ingress has both `traefik.ingress.kubernetes.io/router.entrypoints: websecure` and `traefik.ingress.kubernetes.io/router.tls: "true"`.
- If Argo CD loops with `307` redirects after TLS is enabled, restart `argocd-server` so it picks up `server.insecure: "true"` from `argocd-cmd-params-cm`.

## Monitoring

Monitoring is managed by the `homelab-monitoring` application from `kubernetes/clusters/homelab/monitoring.yaml`.

Components:

- kube-prometheus-stack chart `87.3.0` from the Prometheus Community Helm repository.
- Prometheus Operator and Prometheus with `7d` retention.
- Grafana with the default dashboards enabled.
- Alertmanager enabled with no external receivers yet.
- Grafana ingress exposed through Traefik at `https://grafana.lab.home.arpa`.
- Grafana TLS certificate issued by the `homelab-ca` ClusterIssuer.

Current status: monitoring is installed through Argo CD. Grafana should be reachable at `https://grafana.lab.home.arpa` after DNS points that hostname to the ingress VIP `192.168.40.30`.

Create a UniFi DNS record for `grafana.lab.home.arpa` pointing at `192.168.40.30`.

Validation commands:

```bash
kubectl -n argocd get application homelab-monitoring
kubectl -n monitoring get pods
kubectl -n monitoring get svc
kubectl -n monitoring get ingress
kubectl get certificate -n monitoring
curl -k -I https://grafana.lab.home.arpa
```

Expected results:

- `homelab-monitoring` reports `Synced` and `Healthy`.
- Monitoring pods report `Running` or `Completed`.
- Grafana, Prometheus, and Alertmanager services are present.
- Grafana ingress has host `grafana.lab.home.arpa`.
- `grafana-tls` reports `Ready=True`.
- The HTTPS probe returns `HTTP/2 200` or a login redirect.

Troubleshooting notes:

- If Argo CD reports missing monitoring CRDs during the first sync, confirm `SkipDryRunOnMissingResource=true` is present on `homelab-monitoring`.
- If Grafana's certificate is ready but HTTPS returns `404 page not found`, confirm the Grafana ingress has the Traefik `websecure` and `router.tls` annotations.
- If `grafana.lab.home.arpa` does not resolve, test through the VIP directly with `curl -k -I --resolve grafana.lab.home.arpa:443:192.168.40.30 https://grafana.lab.home.arpa`.
- Grafana browser certificate warnings are expected until the lab root CA is trusted by the client device.

## Network Troubleshooting Note

During VM setup, SSH appeared to flap across Proxmox and Kubernetes nodes while ping stayed healthy. The cause was UniFi UDM Pro Intrusion Prevention affecting TCP/22 traffic. For future troubleshooting, check UDM Pro security features when ICMP works but SSH times out.
