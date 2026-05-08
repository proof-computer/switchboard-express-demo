# Switchboard Express Demo

Rich Express app used by `switchboard launch-demo`.

This package is public for GitHub installs during the private beta. It is not
published on npmjs.com yet.

## Install

```sh
npm install github:proof-computer/switchboard-express-demo#v0.1.1
```

Use `#main` only when intentionally testing unreleased changes. npmjs.com
publishing is prepared but not active yet.

## Use

```ts
import { startSwitchboardExpressDemo } from "@proofcomputer/switchboard-express-demo";

void startSwitchboardExpressDemo().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

The app exposes a Switchboard proof page plus runtime health, status, and
challenge endpoints. The page shows the selected route, Acurast job identity,
Hub registration identifiers, job-owned TLS certificate details, challenge
traffic, runtime details, and redacted environment-presence diagnostics.
