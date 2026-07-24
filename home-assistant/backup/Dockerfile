FROM debian:13.1-slim@sha256:a347fd7510ee31a84387619a492ad6c8eb0af2f2682b916ff3e643eb076f925a

ARG PBS_CLIENT_VERSION=4.2.3-1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl --fail --silent --show-error --location \
      https://enterprise.proxmox.com/debian/proxmox-release-trixie.gpg \
      --output /usr/share/keyrings/proxmox-archive-keyring.gpg \
    && echo "1bcd2d5bab556076c9ea756a84fe2b7445b13f4ef6e97b2e412b68778377ba6d  /usr/share/keyrings/proxmox-archive-keyring.gpg" | sha256sum --check - \
    && echo "deb [signed-by=/usr/share/keyrings/proxmox-archive-keyring.gpg] http://download.proxmox.com/debian/pbs-client trixie main" > /etc/apt/sources.list.d/pbs-client.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends "proxmox-backup-client=${PBS_CLIENT_VERSION}" \
    && rm -rf /var/lib/apt/lists/*

COPY backup-to-pbs.sh /usr/local/bin/backup-to-pbs
RUN chmod 0755 /usr/local/bin/backup-to-pbs \
    && useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin backup
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/backup-to-pbs"]
