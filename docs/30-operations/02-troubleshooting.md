# Operations 02: Troubleshooting

Start with the failing layer and collect evidence before changing identities, networking, or desired state.

Unless a command sets it explicitly, use the homelab kubeconfig:

```bash
export KUBECONFIG="$HOME/.kube/k8s-homelab.yaml"
```

## Fast Triage

```bash
scripts/check-hosts.sh
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get nodes -o wide
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get pods -A
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get applications.argoproj.io -A
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl get ingress,certificate -A
```

Work through failures in this order:

1. IP reachability and TCP connectivity.
2. DNS resolution.
3. Kubernetes node and pod health.
4. Service endpoints and ingress matching.
5. TLS certificate readiness and client trust.
6. Application logs and configuration.

## Argo CD and Grafana Credentials

Treat these values as secrets. Keep the current passwords in the password manager and do not paste them into tickets, chat, logs, or Git.

The administrator Mac stores the current credentials in the login Keychain as generic-password entries with these service names:

- `argocd.lab.seandre.dev`, account `admin`, label `Homelab Argo CD admin`;
- `grafana.lab.seandre.dev`, account `admin`, label `Homelab Grafana admin`.

Use Keychain Access to copy them into the preferred password manager. Do not use terminal commands that print the password during routine login or troubleshooting.

The Argo CD username is `admin`. The durable password hash and server signing key live in `argocd/argocd-secret`; do not delete or recreate that Secret during routine bootstrap or reconciliation. `argocd-initial-admin-secret` is only a bootstrap delivery mechanism, not the persistent credential source. After confirming the current admin password is stored in the password manager and works, delete the bootstrap Secret as upstream recommends:

```bash
kubectl -n argocd get secret argocd-secret \
  -o go-template='{{range $k, $v := .data}}{{$k}}{{"\n"}}{{end}}'
kubectl -n argocd delete secret argocd-initial-admin-secret
```

Expected Argo CD keys include `admin.password`, `admin.passwordMtime`, and `server.secretkey`. Reset a forgotten password by following the official Argo CD password-reset procedure; do not regenerate or print the server signing key.

Grafana consumes the stable `monitoring/grafana-admin-credentials` Secret through the chart's `grafana.admin.existingSecret` values. Confirm only its key names and the Deployment reference:

```bash
kubectl -n monitoring get secret grafana-admin-credentials \
  -o go-template='{{range $k, $v := .data}}{{$k}}{{"\n"}}{{end}}'
kubectl -n monitoring get deployment kube-prometheus-stack-grafana \
  -o yaml | grep -A3 -B3 grafana-admin-credentials
```

The chart-generated `kube-prometheus-stack-grafana` Secret is intentionally replaced by `grafana-admin-credentials`; do not use the generated Secret as a password-recovery source. Follow [Operations 03: Stable Admin Credentials](03-stable-admin-credentials.md) for rotation, Keychain custody, rollout, and recovery. A manually created Secret survives normal Argo CD and Helm reconciliation but not namespace deletion or cluster loss. Complete the Sealed Secrets tutorial and its controller-key backup exercise before treating Git as sufficient disaster recovery for credentials.

## SSH and VM Identity

Run the Mac-side capture for repeated ping, TCP/22, ARP, and SSH evidence:

```bash
scripts/diagnose-mac-network.sh
```

Useful overrides:

```bash
SSH_ATTEMPTS=50 scripts/diagnose-mac-network.sh
CLEAR_ARP=1 scripts/diagnose-mac-network.sh
SUSPECT_HOST=192.168.40.23 scripts/diagnose-mac-network.sh
```

Copy `scripts/diagnose-proxmox-network.sh` to `pve-01` and run it from the Proxmox shell when host-side bridge, neighbor, VM NIC, or guest-agent evidence is needed. Run `scripts/diagnose-vms-over-ssh.sh` from the Mac when SSH works, or copy `scripts/diagnose-vm-identity.sh` into a VM and run it from the console when it does not.

Confirm that every VM has a unique hostname, `/etc/machine-id`, SSH host-key fingerprint, Proxmox NIC MAC address, and static IP. Do not regenerate any of these until duplicate evidence is captured.

Evidence rules:

- The Mac is routed from `192.168.10.0/24` to `192.168.40.0/24`, so its ARP table normally shows its gateway rather than VM MAC addresses.
- A changing VM MAC in Proxmox or UniFi suggests an IP conflict or client-table problem.
- If Proxmox reaches a VM while the Mac cannot, focus on UniFi routing, firewall, and client tracking.
- If both Proxmox and the Mac lose a VM, focus on the guest OS, VM NIC, bridge, or VM health.
- If ping works while TCP/22 fails across several targets, inspect UniFi security filtering before changing Proxmox or guest configuration.
- If TCP/22 connects but sessions die, inspect `sshd`, PAM, shell startup, disk, memory, and kernel logs.

The 2026-06-28 SSH incident was caused by UniFi UDM Pro Intrusion Prevention interfering with TCP while ICMP remained healthy. Use `scripts/watch-proxmox-connectivity.sh` to compare ping and TCP/22 over time.

## Argo CD and Ingress

Bootstrap Argo CD with server-side apply because its CRDs exceed the client-side annotation limit:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl apply --server-side --force-conflicts -k kubernetes/bootstrap
```

If Traefik remains at `EXTERNAL-IP <pending>`, confirm that MetalLB's `IPAddressPool` and `L2Advertisement` reconciled before the Traefik `LoadBalancer` Service. The manifests encode this dependency with Argo CD sync waves.

If the VIP responds but every hostname returns `404`, traffic reached Traefik but no route matched. Inspect ingresses, endpoints, and Traefik logs:

```bash
kubectl get ingress -A
kubectl get endpoints -A
kubectl -n traefik logs deployment/traefik --tail=160
```

Traefik previously failed because its service account could not list nodes. Its ClusterRole must allow `get`, `list`, and `watch` on nodes.

If Argo CD loops through redirects after ingress or TLS changes, confirm `server.insecure: "true"` in `argocd-cmd-params-cm`, then restart the server:

```bash
kubectl -n argocd rollout restart deployment/argocd-server
```

## DNS and TLS

If a hostname does not resolve, bypass DNS while preserving the TLS hostname:

```bash
curl -k -I --resolve home.lab.home.arpa:443:192.168.40.30 https://home.lab.home.arpa
```

If an ingress certificate is missing, inspect the ClusterIssuer, Certificate, and cert-manager pods:

```bash
kubectl get clusterissuer
kubectl get certificate -A
kubectl -n cert-manager get pods
```

A ready certificate plus an HTTPS `404` usually means an ingress match problem, not a certificate problem. Browser warnings are expected until the client trusts the homelab root CA.

## Homepage CrashLoopBackOff

Collect the previous process logs and mounted configuration:

```bash
kubectl -n homepage describe pod -l app.kubernetes.io/name=homepage
kubectl -n homepage logs deployment/homepage --previous --tail=120
kubectl -n homepage exec deployment/homepage -- ls -la /app/config
```

Homepage `v1.13.2` requires `/app/config/proxmox.yaml` even when Proxmox integration is unused. The ConfigMap must provide that file because ConfigMap mounts are read-only and Homepage cannot create a missing default there. The current manifest includes an empty `proxmox.yaml` key.

## General Lessons

- `CrashLoopBackOff` is a symptom; use `describe` and previous logs to find the cause.
- Git and Argo CD are the source of truth. Convert durable manual fixes into manifests or Ansible.
- Keep secrets, kubeconfigs, private keys, and generated diagnostics out of Git.
