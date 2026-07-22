# IE-005 AtomS3 Lite Bluetooth Proxy Evidence

Date: 2026-07-21

Result: **LIVE; HA AND POWER-CYCLE ACCEPTANCE PENDING**. The owner gate completed on
2026-07-21: the firmware compiled, the full USB write reached 100%, its hash
verified, and the Atom reset successfully. Its reserved IoT address is
`192.168.30.239`. The exact Kubernetes `/32:6053` egress is implemented; the
matching UniFi rule is active and live positive/negative tests passed.

## Changed files

- `home-assistant/esphome/atom-living-room.yaml`
- `home-assistant/esphome/secrets.example.yaml`
- `home-assistant/esphome/.gitignore`
- `home-assistant/esphome/test-config.sh`
- `docs/operations/atom-living-room-ble-proxy.md`
- `docs/operations/indoor-dashboard-ie-005-evidence.md`
- `docs/overview/indoor-dashboard-baseline.md`

## Prepared contract and verification

The ESP32-S3/ESP-IDF configuration has encrypted native API, protected OTA,
active BLE proxying, diagnostics, bounded logging, and GPIO35 status pixels.
ESPHome `2026.7.0` is pinned by container index digest. Real secrets are ignored.
The proposed route permits only nodes `192.168.40.21-23` to one confirmed IoT
`/32` on TCP 6053; tests prove it was not added before the gate.

```sh
home-assistant/esphome/test-config.sh
git diff --check
```

The official UniFi API created `Allow k3s nodes to Atom ESPHome`: enabled IPv4
TCP, three source `/32`s, destination `192.168.30.239/32`, port 6053, return
traffic enabled, ahead of the system block. All three nodes reached only the
approved port; TCP 22/80/443, another IoT client's 6053, and unrelated Servers
host `.24` remained blocked. Protected OTA succeeded and the Atom completed an
encrypted API handshake after reboot.

The local secrets file is mode 0600 and Git-ignored. No credential, hardware
identifier, generated key, controller ID, site ID, or rule ID is recorded here.
IE-006 remains blocked only on HA integration and physical power-cycle
reconnection evidence.

Before live rules, rollback is a repository revert. After activation, remove the
Kubernetes `/32:6053` egress first and its UniFi allow second; retain broad denies.
