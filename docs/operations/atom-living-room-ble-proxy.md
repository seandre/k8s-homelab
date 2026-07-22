# Living Room AtomS3 Lite Bluetooth Proxy

Status: **complete**. The owner reserved
`192.168.30.239`; Kubernetes and UniFi permit only the approved node `/32`s to
that address on TCP 6053. Positive and negative routed tests and protected OTA
passed. Home Assistant uses the encrypted native API and the proxy reconnects
after a physical power cycle.

## Fixed contract

- Infrastructure alias `atom_living_room`; ESPHome name `atom-living-room`.
- M5Stack AtomS3 Lite (ESP32-S3 with 8 MB flash), with four WS2812 status pixels
  on GPIO35, matching the [ESPHome Devices hardware reference](https://devices.esphome.io/devices/m5stack-atoms3-lite/).
- IoT VLAN 30 (`192.168.30.0/24`); reserved address `192.168.30.239`.
  Git must never contain the MAC, serial, API key, credentials, or reservation ID.
- Encrypted ESPHome API on TCP 6053 and separately password-protected OTA. There
  is no web server, captive portal, fallback AP, or unauthenticated API.
- Active BLE scanning/proxy on ESP-IDF. Logging is WARN-only with USB serial
  disabled. Pixels are green with an API connection and amber without one.

Build and flash only with ESPHome `2026.7.0`, pinned to this container index:

```text
ghcr.io/esphome/esphome:2026.7.0@sha256:959ef36e5ea97c8309429f0ba1405ddb2eead19019b81e6e9518e683dff5191c
```

## Completed owner gate: reservation, secrets, and USB flash

Perform these steps on the approved MacBook; secrets remain outside Git.

1. Connect the Atom directly with a data-capable USB-C cable. Do not use a
   browser or third-party proxy installer.
2. In UniFi, confirm the physical device and create a DHCP reservation on IoT
   VLAN 30 without conflicting with existing assignments. Store the address in
   the password manager/operations record, not Git. Do not add a firewall rule.
3. Copy `home-assistant/esphome/secrets.example.yaml` to `secrets.yaml` in that
   directory and replace all placeholders. Generate the API key with
   `openssl rand -base64 32`; generate the OTA password independently the same
   way. Confirm `git status --short` does not list `secrets.yaml`.
4. Compile with the immutable tool from the repository root:

   ```sh
   docker run --rm -v "$PWD/home-assistant/esphome:/config" \
     ghcr.io/esphome/esphome:2026.7.0@sha256:959ef36e5ea97c8309429f0ba1405ddb2eead19019b81e6e9518e683dff5191c \
     compile atom-living-room.yaml
   ```

5. Docker Desktop cannot pass a macOS `/dev/cu.*` device into its Linux VM.
   Create an isolated native environment with the same pinned ESPHome release,
   then find and use the explicit USB path; never use a wildcard:

   ```sh
   python3 -m venv /private/tmp/ie005-esphome-2026.7.0
   /private/tmp/ie005-esphome-2026.7.0/bin/python -m pip install 'esphome==2026.7.0'
   cd home-assistant/esphome
   /private/tmp/ie005-esphome-2026.7.0/bin/esphome run \
     atom-living-room.yaml --device /dev/cu.usbmodem...
   ```

6. Disconnect USB power, place the Atom near the Living Room Aranet4 and away
   from the AP and other RF equipment, then power it normally. Confirm its UniFi
   lease matches the reservation and the pixels are amber before HA is allowed.

Delete the local `secrets.yaml` after protected backup. Retain both generated
keys in the password manager for recovery.

## Narrow route after gate confirmation

The two coordinated allow rules are active; do not permit subnet-wide access:

1. UniFi policy `Allow k3s nodes to Atom ESPHome`, created through the official
   API, allows sources `192.168.40.21`, `.22`, and `.23` to the Atom's one
   reserved IPv4 address, TCP destination port 6053, with return traffic. It is
   ordered before the Servers-to-IoT system block.
2. The Home Assistant Kubernetes NetworkPolicy contains one egress item for
   `192.168.30.239/32` on TCP 6053. Preserve its current DNS and public-HTTPS
   entries.

Verify all of the following:

- Every k3s node can open Atom TCP 6053.
- An unrelated Servers host cannot open Atom TCP 6053.
- Every k3s node is blocked from Atom TCP 22, 80, 443 and UDP 6053.
- Every k3s node is blocked from TCP 6053 on another IoT client.
- The existing Servers-to-IoT deny remains; rule counters show only this allow.
- HA discovers `atom-living-room`, accepts its encryption key, and reconnects
  after an Atom power cycle. One OTA update completes and reconnects.

The node reachability and TCP negative tests pass, an unrelated Servers host is
blocked, protected OTA plus the encrypted API handshake pass, and Home Assistant
reconnects after physical power loss and restoration.

## Rollback

Remove the Kubernetes `/32:6053` item first, then the exact UniFi allow. Power
off the Atom or forget its ESPHome integration in HA. Keep broad VLAN denies.
USB flashing remains the recovery path when OTA is unavailable.
