# Switchboard Express Demo

Small Express app used by `switchboard launch-demo`.

This package is public for GitHub installs during the private beta. It is not
published on npmjs.com yet.

## Install

```sh
npm install github:proof-computer/switchboard-express-demo#v0.1.0
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

The app exposes a tiny demo page and lets the Switchboard Express adapter mount
the runtime health, status, and challenge endpoints.
