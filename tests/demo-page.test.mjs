import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { renderDemoPage } from "../dist/demo-page.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(repoRoot, "tests/fixtures/observability-status.json");

describe("Switchboard Express demo page renderer", () => {
  it("renders first-class deployment observability from a static fixture", async () => {
    const status = JSON.parse(await readFile(fixturePath, "utf8"));
    const html = renderDemoPage(status);

    assert.match(html, /<h2>Gateway<\/h2>/);
    assert.match(html, /switchboard-az-01/);
    assert.match(html, /<h2>DNS & CNAME<\/h2>/);
    assert.match(html, /app\.example\.com dns_validated/);
    assert.match(html, /<h2>Route Traffic<\/h2>/);
    assert.match(html, /64\.0 KB/);
    assert.match(html, /<h2>Validators<\/h2>/);
    assert.match(html, /validator-a healthy/);
    assert.match(html, /Diagnostic Data/);
    assert.match(html, /Observability/);
  });

  it("renders intentional empty states instead of generic not-set placeholders", async () => {
    const status = JSON.parse(await readFile(fixturePath, "utf8"));
    status.registration = {
      state: "registered",
      relayResponse: {
        txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        blockNumber: 123456
      }
    };
    status.relayDiagnostics = {
      dns: {
        ok: true,
        addresses: [
          { address: "66.241.125.160", family: 4 }
        ]
      },
      health: {
        ok: true,
        status: 200,
        elapsedMs: 31
      }
    };
    status.runtime.appVersion = "0.1.3";
    status.challenges.last = {
      nonceLength: 16,
      userAgent: "curl/8.20.0",
      remoteAddress: "192.168.3.4"
    };
    status.observability.payload.dns.canonical.materialization = {
      status: "propagated",
      targetIp: "195.22.134.245",
      targetIps: ["195.22.134.245"]
    };
    status.observability.payload.dns.customerHostnames = {
      available: true,
      count: 0,
      hostnames: []
    };
    status.observability.payload.validators = {
      available: true,
      counts: {
        work: 0,
        enabledWork: 0,
        reports: 0,
        successes: 0,
        failures: 0,
        validators: 0
      },
      validators: [],
      work: [],
      recentReports: []
    };

    const html = renderDemoPage(status);

    assert.match(html, /195\.22\.134\.245/);
    assert.match(html, /none configured/);
    assert.match(html, /not applicable/);
    assert.match(html, /0x12345678\.\.\.90abcdef/);
    assert.match(html, /assethub-polkadot\.subscan\.io\/block\/123456/);
    assert.match(html, /none yet/);
    assert.match(html, /none assigned yet/);
    assert.match(html, /0\.1\.3/);
    assert.doesNotMatch(html, /not set/);
  });
});
