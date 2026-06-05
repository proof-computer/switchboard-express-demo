import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signNetworkManifest } from "@proofcomputer/switchboard-sdk";

import { startSwitchboardExpressDemo } from "../dist/index.js";

describe("Switchboard Express demo server", () => {
  it("serves the rich launch-demo page and status payload", async () => {
    const demo = await startSwitchboardExpressDemo({ port: 0 });
    try {
      const html = await fetch(demo.url, {
        headers: {
          "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.86 Safari/537.36",
          "x-forwarded-for": "203.0.113.77"
        }
      }).then((response) => response.text());
      const status = await fetch(new URL("/status", demo.url)).then((response) => response.json());

      assert.match(html, /<title>Switchboard demo<\/title>/);
      assert.match(html, /Running on <span class="acurast-accent">Acurast\.<\/span>/);
      assert.match(html, /<h2>Route<\/h2>/);
      assert.match(html, /<h2>Gateway<\/h2>/);
      assert.match(html, /<h2>DNS & CNAME<\/h2>/);
      assert.doesNotMatch(html, /<h2>Route Traffic<\/h2>/);
      assert.doesNotMatch(html, /<section class="band summary">/);
      assert.match(html, /<span class="flow-row-key">Browser IP<\/span><span class="flow-row-value">203\.0\.113\.77<\/span>/);
      assert.match(html, /<span class="flow-row-key">User agent<\/span><span class="flow-row-value">Chrome v123<\/span>/);
      assert.doesNotMatch(html, /Chrome\/123\.0\.6312\.86 Safari\/537\.36/);
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
        if (readyReports === 1) {
          throw new Error("relay temporarily unavailable");
        }
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

  it("fetches gateway GeoIP once and reuses the cached result", async () => {
    const originalFetch = globalThis.fetch;
    let geoFetches = 0;
    globalThis.fetch = async (input, init) => {
      const url = fetchUrl(input);
      if (url.includes("/v1/deployment-intents/di_geo/observability")) {
        return jsonResponse(observabilityPayload("203.0.113.8"));
      }
      if (url === "http://ip-api.com/json/203.0.113.8") {
        geoFetches += 1;
        return jsonResponse({
          status: "success",
          countryCode: "US",
          country: "United States"
        });
      }
      return originalFetch(input, init);
    };
    const demo = await startSwitchboardExpressDemo({ runtime: observabilityRuntime("di_geo"), port: 0 });
    try {
      const first = await waitForObservedStatus(demo.url, originalFetch);
      const second = await originalFetch(new URL("/status", demo.url)).then((response) => response.json());

      assert.equal(geoFetches, 1);
      assert.deepEqual(first.gatewayGeoIp["203.0.113.8"], {
        countryCode: "US",
        country: "United States",
        flag: "🇺🇸",
        checkedAt: first.gatewayGeoIp["203.0.113.8"].checkedAt
      });
      assert.equal(second.gatewayGeoIp["203.0.113.8"].flag, "🇺🇸");
    } finally {
      globalThis.fetch = originalFetch;
      await new Promise((resolve, reject) => demo.server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("keeps status valid when gateway GeoIP lookup fails", async () => {
    const originalFetch = globalThis.fetch;
    let geoFetches = 0;
    globalThis.fetch = async (input, init) => {
      const url = fetchUrl(input);
      if (url.includes("/v1/deployment-intents/di_geo_fail/observability")) {
        return jsonResponse(observabilityPayload("203.0.113.9"));
      }
      if (url === "http://ip-api.com/json/203.0.113.9") {
        geoFetches += 1;
        return new Response(JSON.stringify({ status: "fail" }), {
          status: 500,
          headers: { "content-type": "application/json" }
        });
      }
      return originalFetch(input, init);
    };
    const demo = await startSwitchboardExpressDemo({ runtime: observabilityRuntime("di_geo_fail"), port: 0 });
    try {
      const first = await waitForObservedStatus(demo.url, originalFetch);
      const second = await originalFetch(new URL("/status", demo.url)).then((response) => response.json());

      assert.equal(first.ok, true);
      assert.equal(first.gatewayGeoIp, undefined);
      assert.equal(second.gatewayGeoIp, undefined);
      assert.equal(geoFetches, 1);
    } finally {
      globalThis.fetch = originalFetch;
      await new Promise((resolve, reject) => demo.server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("selects the richest observability payload across signed manifest relays", async () => {
    const signedManifest = await signNetworkManifest({
      version: 1,
      sequence: 1,
      issuedAt: "2026-05-14T09:00:00.000Z",
      chain: { chainId: "420420419" },
      registries: {
        active: [],
        deprecated: [],
        retired: []
      },
      relays: [
        {
          relayId: "relay-a",
          apiBaseUrl: "https://relay-a.switchboard.proof.computer",
          active: true
        },
        {
          relayId: "relay-b",
          apiBaseUrl: "https://relay-b.switchboard.proof.computer",
          active: true
        }
      ]
    }, "0x0123456789012345678901234567890123456789012345678901234567890123", { scheme: "eip191-secp256k1" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = fetchUrl(input);
      if (url === "https://control.switchboard.proof.computer/v1/network-manifest") {
        return jsonResponse(signedManifest);
      }
      if (url.includes("control.switchboard.proof.computer/v1/deployment-intents/di_multi/observability")) {
        return jsonResponse(observabilityPayloadWithValidatorSuccesses("203.0.113.10", 1));
      }
      if (url.includes("relay-a.switchboard.proof.computer/v1/deployment-intents/di_multi/observability")) {
        return jsonResponse(observabilityPayloadWithValidatorSuccesses("203.0.113.11", 0));
      }
      if (url.includes("relay-b.switchboard.proof.computer/v1/deployment-intents/di_multi/observability")) {
        return jsonResponse(observabilityPayloadWithValidatorSuccesses("203.0.113.12", 9));
      }
      return originalFetch(input, init);
    };
    const demo = await startSwitchboardExpressDemo({
      runtime: observabilityRuntime("di_multi", {
        SWITCHBOARD_RELAY_URL: "https://control.switchboard.proof.computer",
        SWITCHBOARD_NETWORK_MANIFEST_SIGNER: signedManifest.signature.signer
      }),
      port: 0
    });
    try {
      const status = await waitForObservedStatus(demo.url, originalFetch);

      assert.equal(status.observability.relayUrl, "https://relay-b.switchboard.proof.computer");
      assert.equal(status.observability.payload.validators.counts.successes, 9);
      assert.deepEqual(status.observability.relays.map((relay) => relay.relayUrl).sort(), [
        "https://control.switchboard.proof.computer",
        "https://relay-a.switchboard.proof.computer",
        "https://relay-b.switchboard.proof.computer"
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      await new Promise((resolve, reject) => demo.server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("does not report validation certificate SANs as customer hostnames", async () => {
    const runtime = {
      deploymentId: "57921",
      async prepare() {
        return { certificates: [] };
      },
      async log() {},
      async reportReady() {},
      configValue(name) {
        return {
          ENDPOINT_HOSTNAME: "demo.acurast.ingress.works",
          SWITCHBOARD_CERTIFICATE_HOSTNAMES: "demo.acurast.ingress.works,switchboard-123-validation.ingress.digital"
        }[name];
      },
      sessionId() {
        return "session";
      },
      jobId() {
        return "job";
      }
    };
    const demo = await startSwitchboardExpressDemo({ runtime, port: 0 });
    try {
      const status = await fetch(new URL("/status", demo.url)).then((response) => response.json());

      assert.deepEqual(status.public.customerHostnames, []);
      assert.deepEqual(status.public.certificateHostnames, [
        "demo.acurast.ingress.works",
        "switchboard-123-validation.ingress.digital"
      ]);
    } finally {
      await new Promise((resolve, reject) => demo.server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});

function observabilityRuntime(intentId, overrides = {}) {
  return {
    deploymentId: "57921",
    async prepare() {
      return { certificates: [] };
    },
    async log() {},
    async reportReady() {},
    configValue(name) {
      return {
        SWITCHBOARD_RELAY_URL: "https://relay.example",
        SWITCHBOARD_INTENT_ID: intentId,
        SWITCHBOARD_INTENT_TOKEN: "token",
        SWITCHBOARD_OBSERVABILITY_POLL_INTERVAL_MS: "60000",
        ...overrides
      }[name];
    },
    sessionId() {
      return "session";
    },
    jobId() {
      return "job";
    }
  };
}

function observabilityPayload(ip) {
  return {
    ok: true,
    gateway: {
      gatewayId: "switchboard-az-01",
      capability: {
        available: true,
        publicAddresses: [ip]
      }
    }
  };
}

function observabilityPayloadWithValidatorSuccesses(ip, successes) {
  return {
    ...observabilityPayload(ip),
    validators: {
      available: true,
      counts: {
        work: 1,
        enabledWork: 1,
        reportedWork: successes > 0 ? 1 : 0,
        reports: successes,
        successes,
        failures: 0,
        validators: 1
      },
      validators: [
        {
          validatorId: "acurast-validator",
          status: successes > 0 ? "healthy" : "pending"
        }
      ],
      work: []
    }
  };
}

async function waitForObservedStatus(baseUrl, fetchImpl) {
  let latest;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    latest = await fetchImpl(new URL("/status", baseUrl)).then((response) => response.json());
    if (latest.observability?.payload) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return latest;
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function fetchUrl(input) {
  if (input instanceof URL) {
    return input.href;
  }
  if (typeof input === "string") {
    return input;
  }
  return input.url;
}
