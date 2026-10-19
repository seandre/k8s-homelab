# Finite Coway boundary captures

Two read-only captures are scheduled in America/Los_Angeles:

- October 19, 2026, 18:58–19:04: early evening override.
- October 20, 2026, 03:28–03:34: recurring overnight shutdown.

Each job takes thirteen samples thirty seconds apart. Every sample reads each
purifier page with Eastern and Pacific timezone headers, alternating request
order between samples. It logs only normalized unit aliases, numeric status
codes, known timezone values, and timestamps. It also reads HA's SQLite recorder
through the live WAL for fan/light/timer states and relevant HA automation or
service events. A thirty-second overlap accommodates recorder commit latency;
events are deduplicated. It does not log raw pages, credentials or identifiers.

The configured account is read in memory from the read-only HA volume. Login
POSTs are permitted only during authentication; all subsequent POST, PUT, PATCH
and DELETE calls are rejected. Recovery remains active and is not altered by
the diagnostic jobs. Network access is limited to DNS and public HTTPS; pods
have no Kubernetes API token, no ingress, and no writable HA volume.

The Cron expressions specify day/month and CAPTURE_DATE additionally checks the
year. Future annual invocations do no network or account access. Remove these
resources after the two captures are reviewed. A missed start beyond thirty
seconds is skipped, rather than collecting a misleading late window. Failed
requests stop the capture without retries. Jobs have a nine-minute deadline;
completed logs are retained for seven days.

Read results:

```sh
kubectl -n home-assistant get jobs | rg coway-capture
kubectl -n home-assistant logs job/REPLACE_WITH_CAPTURE_JOB
```

Compare both cloud timezone variants before and after each transition with HA
command timestamps. A difference between sequential reads can be a real state
transition between requests, so use both units, alternating order and adjacent
samples to distinguish timezone effects. These observations cannot establish
physical fan operation independently of Coway's cloud. Physical observation or
a power measurement remains necessary to rule out a cloud-only misreport.

Regenerate the ConfigMap after editing the script:

```sh
kubectl create configmap coway-diagnostics -n home-assistant \
  --from-file=capture.py=home-assistant/coway/boundary-capture/capture.py \
  --dry-run=client -o yaml > kubernetes/apps/home-assistant/coway-diagnostics-configmap.yaml
```

Run test_capture.py with the production HA Python environment. An immediate
one-sample smoke job verifies credentials, network access, SQLite read-only WAL
access, parsing, and redaction without altering equipment.
