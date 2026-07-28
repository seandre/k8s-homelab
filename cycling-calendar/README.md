# Women’s Road Calendar

Private, static 2026 women’s professional road calendar for
`cycling.lab.seandre.dev`.

## Local preview

```bash
npm install
npm run dev
```

The normal preview is available only on this computer at
`http://127.0.0.1:5174`.

For a short, trusted-LAN review session:

```bash
npm run dev:lan
```

The LAN preview has no authentication. Stop it immediately after review and do
not expose port 5174 outside the trusted network.

## Checks and final output

```bash
npm run validate:data
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

All three owner-review checkpoints were approved on 27 July 2026. The
production preview uses `http://127.0.0.1:4174`.

Build and exercise the static container:

```bash
docker build --tag womens-road-calendar:verify .
docker run --rm --read-only --tmpfs /tmp \
  --publish 127.0.0.1:8080:8080 womens-road-calendar:verify
```

## Calendar data

The maintained season file is `src/data/races-2026.json`. Update its
dataset-wide `reviewedOn` date whenever the schedule is audited, retain
cancelled or moved races with an explicit status and note, then run:

```bash
npm run validate:data
npm test
```

The application has no runtime API or synchronization job. Every published
schedule change therefore requires a reviewed source edit and a new immutable
image.

CI verifies the application and container on pull requests. An approved change
on `main` publishes an immutable GHCR image and commits its digest to the
Kubernetes Deployment. Cluster registration remains intentionally gated until
the `cycling-calendar/ghcr-pull` secret exists.

Long-form architecture and operations documentation lives in:

- `docs/build/womens-road-calendar.md`
- `docs/operations/womens-road-calendar.md`
