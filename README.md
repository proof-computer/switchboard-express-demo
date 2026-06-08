# Switchboard Express Demo

Rich Express app used by `switchboard launch-demo`.

This package is public for GitHub installs during the private beta. It is not
published on npmjs.com yet.

## Install

```sh
npm install github:proof-computer/switchboard-express-demo#v0.1.11
```

Use `#main` only when intentionally testing unreleased changes. npmjs.com
publishing is prepared but not active yet.

## Use

```ts
import { startSwitchboardExpressDemo } from "@proof-computer/switchboard-express-demo";

void startSwitchboardExpressDemo().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

The app exposes a Switchboard proof page plus runtime health, status, and
challenge endpoints. The page shows the selected route, Acurast job identity,
Hub registration identifiers, job-owned TLS certificate details, challenge
traffic, runtime details, deployment observability, and redacted
environment-presence diagnostics.

When `SWITCHBOARD_RELAY_URL`, `SWITCHBOARD_INTENT_ID`, and
`SWITCHBOARD_INTENT_TOKEN` are present, the app polls
`GET /v1/deployment-intents/:intentId/observability` on the configured home
relay every 60 seconds. Set `SWITCHBOARD_OBSERVABILITY=false` to disable
polling, or `SWITCHBOARD_OBSERVABILITY_POLL_INTERVAL_MS` to change the
interval. `SWITCHBOARD_OBSERVABILITY_RELAY_URLS` can add explicit diagnostic
relays. Set `SWITCHBOARD_OBSERVABILITY_DISCOVERY=network-manifest` only when
you intentionally want signed-manifest fanout across the relay fleet.

## Local Preview

Static preview data lives in this package so the CLI does not duplicate demo
template code.

```sh
npm run preview
```

Use a different fixture when needed:

```sh
npm run preview -- --fixture tests/fixtures/observability-status.json
```
