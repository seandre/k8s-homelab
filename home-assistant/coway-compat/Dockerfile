# IE-002 compatibility image only. IE-003 owns the production image and digest pin.
ARG HOME_ASSISTANT_VERSION=2026.7.2
FROM ghcr.io/home-assistant/home-assistant:${HOME_ASSISTANT_VERSION}

ARG COWAYAIO_VERSION=0.2.4

COPY custom_components/coway /config/custom_components/coway
COPY tests /opt/coway-compat/tests

# Home Assistant normally installs manifest requirements during integration setup.
# Installing the exact manifest pin here makes the import test deterministic and
# keeps it independent of live Coway credentials.
RUN python -m pip install --no-cache-dir "cowayaio==${COWAYAIO_VERSION}"

ENTRYPOINT ["python", "-m", "unittest", "discover", "-v", "-s", "/opt/coway-compat/tests"]
