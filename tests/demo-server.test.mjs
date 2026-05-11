import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { startSwitchboardExpressDemo } from "../dist/index.js";

describe("Switchboard Express demo server", () => {
  it("serves the rich launch-demo page and status payload", async () => {
    const demo = await startSwitchboardExpressDemo({ port: 0 });
    try {
      const html = await fetch(demo.url).then((response) => response.text());
      const status = await fetch(new URL("/status", demo.url)).then((response) => response.json());

      assert.match(html, /<title>Switchboard demo<\/title>/);
      assert.match(html, /Running on <span class="acurast-accent">Acurast,/);
      assert.match(html, /<h2>Route<\/h2>/);
      assert.match(html, /<h2>Gateway<\/h2>/);
      assert.match(html, /<h2>DNS & CNAME<\/h2>/);
      assert.match(html, /<h2>Route Traffic<\/h2>/);
      assert.match(html, /<h2>Acurast Job<\/h2>/);
      assert.match(html, /<h2>Polkadot Hub<\/h2>/);
      assert.match(html, /<h2>Validators<\/h2>/);
      assert.doesNotMatch(html, /Health is available at <code>\/health<\/code>/);

      assert.equal(status.ok, true);
      assert.equal(status.name, "Switchboard Express Demo");
      assert.equal(typeof status.ids.sessionId, "string");
      assert.equal(status.runtime.hasStd, false);
      assert.deepEqual(Object.keys(status).sort(), [
        "acurast",
        "certificate",
        "challenges",
        "envPresence",
        "ids",
        "local",
        "name",
        "network",
        "now",
        "ok",
        "public",
        "registration",
        "routing",
        "runtime",
        "startedAt",
        "traffic",
        "uptimeSeconds"
      ]);
    } finally {
      await new Promise((resolve, reject) => demo.server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("retries ready reports after the server starts", async () => {
    let readyReports = 0;
    const runtime = {
      deploymentId: undefined,
      async prepare() {
        return { certificates: [] };
      },
      async log() {},
      async reportReady() {
        readyReports += 1;
      },
      configValue(name) {
        return {
          SWITCHBOARD_READY_REPORT_RETRY_MS: "1",
          SWITCHBOARD_READY_REPORT_MAX_ATTEMPTS: "2"
        }[name];
      },
      sessionId() {
        return undefined;
      },
      jobId() {
        return undefined;
      }
    };
    const demo = await startSwitchboardExpressDemo({ runtime, port: 0 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 2_300));
      assert.equal(readyReports, 3);
    } finally {
      await new Promise((resolve, reject) => demo.server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
