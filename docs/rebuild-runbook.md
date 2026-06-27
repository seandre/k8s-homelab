# Rebuild Runbook
This lab should be reproducible. Anything important should live in Git or be documented here.
## Rebuild Principles
- Do not rely on undocumented manual changes.
- Keep IPs, hostnames, and VM sizes documented.
- Commit changes after each working milestone.
- Keep secrets out of Git.
- Prefer rebuilding over debugging mystery state when early in the lab.
## Rebuild Order
1. Install Proxmox
2. Configure host networking
3. Upload Ubuntu Server ISO
4. Create Ubuntu template
5. Clone VMs
6. Install k3s
7. Apply Kubernetes bootstrap manifests
8. Deploy infrastructure services
9. Deploy apps
10. Validate ingress and monitoring
