# IE-003 production Home Assistant image.
# Keep the human-readable release and immutable official-image digest together.
FROM ghcr.io/home-assistant/home-assistant:2026.7.2@sha256:1476924357b46e80735c13e94232ba5c853cac052e9df4bb28d50fa56348097b

LABEL org.opencontainers.image.title="homelab-home-assistant" \
      org.opencontainers.image.description="Home Assistant 2026.7.2 with verified Coway IoCare 0.6.1" \
      dev.seandre.ie="IE-003" \
      dev.seandre.home-assistant.version="2026.7.2" \
      dev.seandre.home-assistant.base.digest="sha256:1476924357b46e80735c13e94232ba5c853cac052e9df4bb28d50fa56348097b" \
      dev.seandre.coway.version="0.6.1" \
      dev.seandre.coway.commit="e0f29953f650b09c8d994aafba5c27634e0bb705" \
      dev.seandre.coway.archive.sha256="0a36be24d7294319880d1aa0cc6b6fcd9a66b8f2d08192bfd04b92c42204aaf5"

# The generated build context contains only the checksum-verified upstream
# component. The immutable copy remains available when /config is a PVC; the
# second copy lets CI exercise this exact image without a mounted volume.
COPY custom_components/coway /usr/local/share/homelab-home-assistant/custom_components/coway
COPY custom_components/coway /config/custom_components/coway
COPY install-coway.sh /etc/cont-init.d/01-install-coway.sh
COPY verify-image.sh /usr/local/bin/verify-home-assistant-image
COPY configuration.yaml /opt/homelab-home-assistant/configuration.yaml
COPY tests /opt/homelab-home-assistant/tests
COPY requirements.lock /opt/homelab-home-assistant/requirements.lock

# Home Assistant installs manifest requirements on first setup. Baking the
# manifest's exact dependency makes the production image independently
# importable and prevents onboarding from selecting a different release.
RUN python -m pip install --no-cache-dir --no-deps --require-hashes \
        --requirement /opt/homelab-home-assistant/requirements.lock \
    && chmod 0755 /etc/cont-init.d/01-install-coway.sh \
        /usr/local/bin/verify-home-assistant-image
