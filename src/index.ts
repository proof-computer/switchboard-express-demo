import { realpathSync } from "node:fs";
import http, { type Server as HttpServer } from "node:http";
import https from "node:https";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

import express, { type Application } from "express";
import { createSwitchboardRouter } from "@proofcomputer/switchboard-express";
import {
  createSwitchboardRuntime,
  maybeAcurastJobSigner,
  privateKeyJobSigner,
  SWITCHBOARD_STATUS_PATH,
  verifySignedNetworkManifest,
  type AcurastRuntimeStd,
  type SwitchboardManagedCertificate,
  type SwitchboardRuntime,
  type SwitchboardRuntimeOptions
} from "@proofcomputer/switchboard-sdk";

import { renderDemoPage } from "./demo-page.js";
import { runRelayDiagnostics } from "./relay-diagnostics.js";

export interface SwitchboardExpressDemoOptions {
  runtime?: SwitchboardRuntimeOptions | SwitchboardRuntime;
  host?: string;
  port?: number;
  mountChallenge?: boolean;
  mountStatus?: boolean;
  mountHealth?: boolean;
  title?: string;
}

export interface SwitchboardExpressDemoServer {
  runtime: SwitchboardRuntime;
  server: HttpServer;
  url: string;
}

interface DemoState {
  title: string;
  appVersion?: string;
  startedAt: string;
  challengeCount: number;
  lastChallengeAt?: string;
  lastChallenge?: Record<string, unknown>;
  certificates: SwitchboardManagedCertificate[];
  registration?: Record<string, unknown>;
  relayDiagnostics?: Record<string, unknown>;
  observability?: RelayObservabilitySnapshot;
  observabilityTimer?: NodeJS.Timeout;
  readyReportTimer?: NodeJS.Timeout;
  geoIpCache: Record<string, GeoIpCacheEntry>;
  traffic: TrafficState;
  signerMode?: string;
  jobSigner?: string;
  local?: {
    protocol: "http" | "https";
    host: string;
    port: number;
    url: string;
  };
}

interface RelayObservabilitySnapshot {
  checkedAt: string;
  relayUrl?: string;
  ok: boolean;
  status?: number;
  payload?: Record<string, unknown>;
  error?: string;
  relays?: RelayObservabilityRelaySnapshot[];
}

interface RelayObservabilityRelaySnapshot {
  relayUrl: string;
  ok: boolean;
  status?: number;
  score?: number;
  error?: string;
}

interface GatewayGeoIp {
  countryCode?: string;
  country?: string;
  flag?: string;
  checkedAt: string;
}

interface GeoIpCacheEntry {
  expiresAt: number;
  result?: GatewayGeoIp;
}

interface TrafficState {
  startedAt: string;
  requestsTotal: number;
  bytesReceivedTotal: number;
  bytesSentTotal: number;
  lastRequestAt?: string;
  paths: Record<string, {
    path: string;
    count: number;
    bytesReceived: number;
    bytesSent: number;
    lastStatus?: number;
    lastAt?: string;
  }>;
}

const DEFAULT_NETWORK_MANIFEST_SIGNER = "5EpwnRzamXpqWo3jW9h4ecSJHL9LBjR6jTMW5Wzw6p9nMTh7";

export function createSwitchboardExpressDemoApp(
  options: { title?: string; status?: () => Record<string, unknown> | Promise<Record<string, unknown>> } = {}
): Application {
  const title = options.title ?? "Switchboard Express Demo";
  const app = express();

  app.get("/", async (request, response, next) => {
    try {
      const status = options.status ? await options.status() : placeholderStatus(title);
      response.type("html").send(renderDemoPage(status, { client: clientInfoFromRequest(request) }));
    } catch (error) {
      next(error);
    }
  });

  return app;
}

export async function startSwitchboardExpressDemo(
  options: SwitchboardExpressDemoOptions = {}
): Promise<SwitchboardExpressDemoServer> {
  const runtime = isRuntime(options.runtime) ? options.runtime : createSwitchboardRuntime(options.runtime);
  const state: DemoState = {
    title: options.title ?? "Switchboard Express Demo",
    appVersion: runtime.configValue("SWITCHBOARD_DEMO_VERSION") ?? process.env.SWITCHBOARD_DEMO_VERSION ?? process.env.npm_package_version,
    startedAt: new Date().toISOString(),
    challengeCount: 0,
    certificates: [],
    geoIpCache: {},
    traffic: createTrafficState()
  };
  void resolveDemoJobSigner(runtime, state);

  const app = createSwitchboardExpressDemoApp({
    title: state.title,
    status: () => demoStatus(runtime, state)
  });
  app.use(recordTraffic(state));
  app.use(express.json());

  if (options.mountChallenge !== false) {
    app.use(
      createSwitchboardRouter({
        runtime,
        onChallenge: (event) => {
          state.challengeCount += 1;
          state.lastChallengeAt = new Date().toISOString();
          state.lastChallenge = {
            nonceLength: event.nonce.length,
            userAgent: event.userAgent,
            remoteAddress: event.remoteAddress
          };
          void runtime.log("challenge-hit", state.lastChallenge);
        }
      })
    );
  }

  if (options.mountHealth !== false) {
    app.get("/health", (_request, response) => response.json({ ok: true }));
  }

  if (options.mountStatus !== false) {
    const statusHandler = async (_request: unknown, response: { setHeader: (name: string, value: string) => void; json: (body: unknown) => void }) => {
      response.setHeader("cache-control", "no-store");
      response.json(await demoStatus(runtime, state));
    };
    app.get(SWITCHBOARD_STATUS_PATH, statusHandler);
    app.get("/status", statusHandler);
  }

  const prepared = await runtime.prepare();
  state.certificates = prepared.certificates;
  const registration = (prepared as unknown as Record<string, unknown>).registration;
  state.registration =
    registration && typeof registration === "object" && !Array.isArray(registration)
      ? (registration as Record<string, unknown>)
      : undefined;
  await resolveDemoJobSigner(runtime, state);

  const host = options.host ?? runtime.configValue("SWITCHBOARD_HOST") ?? runtime.configValue("PROOF_INGRESS_HOST") ?? "127.0.0.1";
  const port = options.port ?? Number(runtime.configValue("PORT") ?? "3000");
  const server = prepared.tlsOptions ? https.createServer(prepared.tlsOptions, app) : http.createServer(app);
  await listen(server, host, port);

  const protocol = prepared.tlsOptions ? "https" : "http";
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  state.local = {
    protocol,
    host,
    port: actualPort,
    url: `${protocol}://${host}:${actualPort}/`
  };

  await runtime.log("server-listening", {
    protocol,
    host,
    port: actualPort,
    certificateHostnames: state.certificates.map((certificate) => certificate.hostname)
  });
  await runtime.reportReady({ protocol, host, port: actualPort });
  startReadyReportRetry(runtime, state, server, { protocol, host, port: actualPort });

  if (runtime.configValue("SWITCHBOARD_RELAY_DIAGNOSTICS") === "true") {
    void runRelayDiagnosticsOnce(runtime, state);
  }
  startObservabilityPolling(runtime, state, server);

  return { runtime, server, url: state.local.url };
}

function placeholderStatus(title: string): Record<string, unknown> {
  return {
    ok: true,
    name: title,
    now: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    registration: { state: "not-started" },
    certificate: { state: "not-started" },
    runtime: runtimeSummary()
  };
}

async function demoStatus(runtime: SwitchboardRuntime, state: DemoState): Promise<Record<string, unknown>> {
  await resolveDemoJobSigner(runtime, state);
  const endpointHostname = runtime.configValue("ENDPOINT_HOSTNAME");
  const certificateHostnames = configuredCertificateHostnames(runtime, endpointHostname);
  const customerHostnames = configuredCustomerHostnames(runtime, state.observability?.payload, certificateHostnames, endpointHostname);
  const gatewayGeoIp = await gatewayGeoIpStatus(state, state.observability?.payload);
  const publicUrl = endpointHostname ? `https://${endpointHostname}/` : undefined;
  const challengeUrl = endpointHostname ? `${publicUrl}.well-known/proofcomputer/challenge?nonce=demo` : undefined;

  const status: Record<string, unknown> = {
    ok: true,
    name: state.title,
    now: new Date().toISOString(),
    startedAt: state.startedAt,
    uptimeSeconds: Math.round((Date.now() - Date.parse(state.startedAt)) / 1000),
    local: state.local,
    public: {
      hostname: endpointHostname,
      customerHostnames,
      certificateHostnames,
      url: publicUrl,
      challengeUrl
    },
    ids: {
      deploymentId: runtime.deploymentId,
      sessionId: runtime.sessionId(),
      jobId: runtime.jobId(),
      jobSigner: state.jobSigner,
      signerMode: state.signerMode
    },
    routing: {
      relayUrl: runtime.configValue("RELAY_URL"),
      relayHost: relayHost(runtime),
      operatorId: runtime.configValue("OPERATOR_ID"),
      processorId: runtime.configValue("PROCESSOR_ID"),
      gatewayId: runtime.configValue("GATEWAY_ID"),
      registryAddress: runtime.configValue("INGRESS_REGISTRY_ADDRESS"),
      chainId: runtime.configValue("CHAIN_ID")
    },
    registration: inferredRegistrationState(runtime, state),
    certificate: certificateState(runtime, state.certificates, certificateHostnames),
    challenges: {
      count: state.challengeCount,
      lastAt: state.lastChallengeAt,
      last: state.lastChallenge
    },
    traffic: {
      local: trafficSummary(state.traffic),
      relay: state.observability?.payload?.traffic,
      routeMetrics: state.observability?.payload?.routeMetrics
    },
    observability: state.observability,
    acurast: acurastRuntimeStatus(runtime),
    relayDiagnostics: state.relayDiagnostics,
    runtime: runtimeSummary(runtime, state),
    network: networkAddressSummary(),
    envPresence: configPresence(runtime, [
      "RELAY_URL",
      "CHAIN_ID",
      "INGRESS_REGISTRY_ADDRESS",
      "SESSION_ID",
      "JOB_ID",
      "OPERATOR_ID",
      "PROCESSOR_ID",
      "ENDPOINT_HOSTNAME",
      "GATEWAY_ID",
      "JOB_SIGNER_PRIVATE_KEY",
      "SWITCHBOARD_CONFIG",
      "SWITCHBOARD_RELAY_URL",
      "SWITCHBOARD_INTENT_ID",
      "SWITCHBOARD_INTENT_GROUP_ID",
      "SWITCHBOARD_INTENT_TOKEN",
      "SWITCHBOARD_OBSERVABILITY",
      "SWITCHBOARD_OBSERVABILITY_POLL_INTERVAL_MS",
      "SWITCHBOARD_OBSERVABILITY_TIMEOUT_MS",
      "SWITCHBOARD_LOG_URL",
      "SWITCHBOARD_LOG_TOKEN",
      "SWITCHBOARD_LOG_ENCRYPTION_KEY",
      "SWITCHBOARD_RELAY_DIAGNOSTICS",
      "SWITCHBOARD_RELAY_DIAGNOSTICS_TIMEOUT_MS"
    ])
  };
  if (Object.keys(gatewayGeoIp).length > 0) {
    status.gatewayGeoIp = gatewayGeoIp;
  }
  return status;
}

function inferredRegistrationState(runtime: SwitchboardRuntime, state: DemoState): Record<string, unknown> {
  const missing = requiredRegistrationConfigNames().filter((name) => !runtime.configValue(name));
  if (missing.length > 0) {
    return {
      state: "not-configured",
      missing
    };
  }
  const registration: Record<string, unknown> = {
    state: "registered"
  };
  if (state.registration?.relayResponse !== undefined) {
    registration.relayResponse = state.registration.relayResponse;
  }
  return registration;
}

function certificateState(
  runtime: SwitchboardRuntime,
  certificates: SwitchboardManagedCertificate[],
  configuredHostnames: string[]
): Record<string, unknown> {
  if (certificates.length === 0) {
    return {
      state: runtime.configValue("SWITCHBOARD_CERTIFICATE_MODE") === "job-acme" ? "pending" : "not-configured",
      mode: runtime.configValue("SWITCHBOARD_CERTIFICATE_MODE"),
      hostnames: configuredHostnames
    };
  }
  return {
    state: "active",
    mode: runtime.configValue("SWITCHBOARD_CERTIFICATE_MODE") ?? "job-acme",
    hostnames: configuredHostnames,
    certificates: certificates.map((certificate) => ({
      hostname: certificate.hostname,
      issuer: certificate.issuer,
      notAfter: certificate.notAfter
    }))
  };
}

function createTrafficState(): TrafficState {
  return {
    startedAt: new Date().toISOString(),
    requestsTotal: 0,
    bytesReceivedTotal: 0,
    bytesSentTotal: 0,
    paths: {}
  };
}

function recordTraffic(state: DemoState): express.RequestHandler {
  return (request, response, next) => {
    const received = headerNumber(request.headers["content-length"]);
    let sent = 0;
    const originalWrite = response.write.bind(response) as (...args: any[]) => boolean;
    const originalEnd = response.end.bind(response) as (...args: any[]) => typeof response;
    (response as Record<string, any>).write = (...args: any[]) => {
      sent += chunkLength(args[0]);
      return originalWrite(...args);
    };
    (response as Record<string, any>).end = (...args: any[]) => {
      sent += chunkLength(args[0]);
      return originalEnd(...args);
    };
    response.on("finish", () => {
      const at = new Date().toISOString();
      const pathKey = request.path || request.url || "/";
      const pathStats = state.traffic.paths[pathKey] ?? {
        path: pathKey,
        count: 0,
        bytesReceived: 0,
        bytesSent: 0
      };
      pathStats.count += 1;
      pathStats.bytesReceived += received;
      pathStats.bytesSent += sent;
      pathStats.lastStatus = response.statusCode;
      pathStats.lastAt = at;
      state.traffic.paths[pathKey] = pathStats;
      state.traffic.requestsTotal += 1;
      state.traffic.bytesReceivedTotal += received;
      state.traffic.bytesSentTotal += sent;
      state.traffic.lastRequestAt = at;
    });
    next();
  };
}

function trafficSummary(traffic: TrafficState): Record<string, unknown> {
  return {
    startedAt: traffic.startedAt,
    requestsTotal: traffic.requestsTotal,
    bytesReceivedTotal: traffic.bytesReceivedTotal,
    bytesSentTotal: traffic.bytesSentTotal,
    lastRequestAt: traffic.lastRequestAt,
    paths: Object.values(traffic.paths)
      .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
      .slice(0, 10)
  };
}

function startReadyReportRetry(
  runtime: SwitchboardRuntime,
  state: DemoState,
  server: HttpServer,
  details: { protocol: "http" | "https"; host: string; port: number }
): void {
  if (runtime.configValue("SWITCHBOARD_READY_REPORT_RETRY") === "false") {
    return;
  }
  const intervalMs = Math.max(1_000, numberConfig(runtime, "SWITCHBOARD_READY_REPORT_RETRY_MS", 10_000));
  const maxAttempts = numberConfig(runtime, "SWITCHBOARD_READY_REPORT_MAX_ATTEMPTS", 60);
  let attempts = 0;

  state.readyReportTimer = setInterval(() => {
    if (relayHealthState(state) === "ready" || attempts >= maxAttempts) {
      stopReadyReportRetry(state);
      return;
    }
    attempts += 1;
    void runtime.reportReady(details);
  }, intervalMs);
  state.readyReportTimer.unref();
  server.once("close", () => stopReadyReportRetry(state));
}

function stopReadyReportRetry(state: DemoState): void {
  if (!state.readyReportTimer) {
    return;
  }
  clearInterval(state.readyReportTimer);
  state.readyReportTimer = undefined;
}

function relayHealthState(state: DemoState): string | undefined {
  const availability = state.observability?.payload?.availability;
  if (!availability || typeof availability !== "object" || Array.isArray(availability)) {
    return undefined;
  }
  const health = (availability as Record<string, unknown>).health;
  if (!health || typeof health !== "object" || Array.isArray(health)) {
    return undefined;
  }
  const value = (health as Record<string, unknown>).state;
  return typeof value === "string" ? value : undefined;
}

function headerNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^[0-9]+$/.test(raw)) {
    return 0;
  }
  return Number(raw);
}

function chunkLength(value: unknown): number {
  if (typeof value === "string") {
    return Buffer.byteLength(value);
  }
  if (Buffer.isBuffer(value)) {
    return value.length;
  }
  if (value instanceof Uint8Array) {
    return value.byteLength;
  }
  return 0;
}

function startObservabilityPolling(runtime: SwitchboardRuntime, state: DemoState, server: HttpServer): void {
  if (runtime.configValue("SWITCHBOARD_OBSERVABILITY") === "false") {
    return;
  }
  const relayUrl = runtime.configValue("SWITCHBOARD_RELAY_URL") ?? runtime.configValue("RELAY_URL");
  const intentId = runtime.configValue("SWITCHBOARD_INTENT_ID");
  const token = runtime.configValue("SWITCHBOARD_INTENT_TOKEN");
  if (!relayUrl || !intentId || !token) {
    return;
  }
  const intervalMs = numberConfig(runtime, "SWITCHBOARD_OBSERVABILITY_POLL_INTERVAL_MS", 10_000);
  let relayUrls: string[] | undefined;
  let inFlight = false;
  const poll = async () => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      relayUrls = await resolveObservabilityRelayUrls(runtime, relayUrl);
      allowAcurastUrlHostnames(relayUrls);
      await pollObservabilityOnce(runtime, state, { relayUrls, intentId, token });
    } finally {
      inFlight = false;
    }
  };
  void poll();
  state.observabilityTimer = setInterval(() => {
    void poll();
  }, intervalMs);
  state.observabilityTimer.unref();
  server.once("close", () => {
    if (state.observabilityTimer) {
      clearInterval(state.observabilityTimer);
      state.observabilityTimer = undefined;
    }
  });
}

async function pollObservabilityOnce(
  runtime: SwitchboardRuntime,
  state: DemoState,
  input: { relayUrls: string[]; intentId: string; token: string }
): Promise<void> {
  const checkedAt = new Date().toISOString();
  const timeoutMs = numberConfig(runtime, "SWITCHBOARD_OBSERVABILITY_TIMEOUT_MS", 8_000);
  const results = await Promise.all(
    input.relayUrls.map((relayUrl) => fetchRelayObservability(relayUrl, input.intentId, input.token, timeoutMs))
  );
  const best = results
    .filter((result) => result.ok && result.payload)
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))[0];

  if (best) {
    state.observability = {
      checkedAt,
      relayUrl: best.relayUrl,
      ok: best.ok,
      status: best.status,
      payload: best.payload,
      relays: results.map(observabilityRelaySnapshot)
    };
    return;
  }

  const first = results[0];
  state.observability = {
    checkedAt,
    relayUrl: first?.relayUrl,
    ok: false,
    status: first?.status,
    payload: first?.payload,
    error: first?.error ?? "observability request failed on every relay",
    relays: results.map(observabilityRelaySnapshot)
  };
}

async function fetchRelayObservability(
  relayUrl: string,
  intentId: string,
  token: string,
  timeoutMs: number
): Promise<RelayObservabilityRelaySnapshot & { payload?: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();
  try {
    const url = new URL(`/v1/deployment-intents/${encodeURIComponent(intentId)}/observability`, relayUrl);
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });
    const payload = recordPayload(await response.json().catch(() => undefined));
    return {
      relayUrl: normalizedBaseUrl(relayUrl) ?? relayUrl,
      ok: response.ok,
      status: response.status,
      score: payload ? observabilityScore(payload) : 0,
      payload,
      error: response.ok ? undefined : `observability request failed: ${response.status}`
    };
  } catch (error) {
    return {
      relayUrl: normalizedBaseUrl(relayUrl) ?? relayUrl,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveObservabilityRelayUrls(runtime: SwitchboardRuntime, relayUrl: string): Promise<string[]> {
  const explicit = splitCsv(runtime.configValue("SWITCHBOARD_OBSERVABILITY_RELAY_URLS") ?? "")
    .map((url) => normalizedBaseUrl(url))
    .filter((url): url is string => Boolean(url));
  if (explicit.length > 0) {
    return uniqueBaseUrls([relayUrl, ...explicit]);
  }

  const timeoutMs = Math.min(numberConfig(runtime, "SWITCHBOARD_OBSERVABILITY_TIMEOUT_MS", 8_000), 3_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();
  try {
    const response = await fetch(new URL("/v1/network-manifest", relayUrl), {
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return uniqueBaseUrls([relayUrl]);
    }
    const expectedSigner =
      runtime.configValue("SWITCHBOARD_NETWORK_MANIFEST_SIGNER") ??
      runtime.configValue("PROOF_NETWORK_MANIFEST_SIGNER") ??
      DEFAULT_NETWORK_MANIFEST_SIGNER;
    const verified = await verifySignedNetworkManifest(await response.json(), { expectedSigner });
    const manifest = verified.manifest;
    const candidates = [
      manifest.controlPlane?.apiBaseUrl,
      ...(manifest.relays ?? [])
        .filter((relay) => (relay.active ?? true) !== false)
        .map((relay) => relay.controlPlaneUrl ?? relay.apiBaseUrl)
    ].filter((url): url is string => Boolean(url));
    return uniqueBaseUrls([relayUrl, ...candidates].filter((candidate) => observabilityRelayUrlAllowed(relayUrl, candidate)));
  } catch {
    return uniqueBaseUrls([relayUrl]);
  } finally {
    clearTimeout(timeout);
  }
}

function observabilityRelaySnapshot(result: RelayObservabilityRelaySnapshot): RelayObservabilityRelaySnapshot {
  return {
    relayUrl: result.relayUrl,
    ok: result.ok,
    status: result.status,
    score: result.score,
    error: result.error
  };
}

function observabilityScore(payload: Record<string, unknown>): number {
  const validators = recordField(payload, "validators");
  const counts = recordField(validators, "counts");
  const work = validatorWorkRows(validators);
  const successes = Math.max(numberField(counts, "successes") ?? 0, work.filter((row) => row.lastSuccess === true).length);
  const reports = Math.max(
    numberField(counts, "reports") ?? 0,
    work.filter((row) => Boolean(stringField(row, "lastReportId") ?? stringField(row, "lastReportAt"))).length
  );
  const reportedWork = numberField(counts, "reportedWork") ?? 0;
  const failures = Math.max(numberField(counts, "failures") ?? 0, work.filter((row) => row.lastSuccess === false).length);
  const dns = recordField(recordField(recordField(payload, "dns"), "canonical"), "materialization");
  const route = recordField(recordField(payload, "availability"), "route");
  const routeState = recordField(payload, "routeState");

  let score = successes * 100_000 + reports * 10_000 + reportedWork * 1_000 - failures * 100;
  if (stringField(dns, "status") === "propagated" || stringField(dns, "state") === "propagated") score += 250;
  if (stringField(route, "status") === "active") score += 250;
  if (routeState?.runtimeHttpsReady === true) score += 100;
  if (recordField(payload, "gateway")) score += 25;
  if (recordField(payload, "routeMetrics")) score += 10;
  return score;
}

function validatorWorkRows(summary: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const work = summary?.work;
  return Array.isArray(work)
    ? work.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function recordPayload(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberField(value: unknown, name: string): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[name];
  if (typeof field === "number" && Number.isFinite(field)) {
    return field;
  }
  if (typeof field === "string" && /^[0-9]+$/.test(field)) {
    return Number(field);
  }
  return undefined;
}

function allowAcurastUrlHostnames(urls: string[]): void {
  const addAllowedHostnames = acurastStd()?.net?.addAllowedHostnames;
  if (typeof addAllowedHostnames !== "function") {
    return;
  }
  const hostnames = uniqueHostnames(
    urls.flatMap((url) => {
      try {
        return [new URL(url).hostname];
      } catch {
        return [];
      }
    })
  );
  if (hostnames.length === 0) {
    return;
  }
  try {
    void Promise.resolve(addAllowedHostnames(hostnames)).catch(() => undefined);
  } catch {
    return;
  }
}

function observabilityRelayUrlAllowed(bootstrapRelayUrl: string, candidateUrl: string): boolean {
  let bootstrap: URL;
  let candidate: URL;
  try {
    bootstrap = new URL(bootstrapRelayUrl);
    candidate = new URL(candidateUrl);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(candidate.protocol)) {
    return false;
  }
  if (bootstrap.protocol === "https:" && candidate.protocol !== "https:") {
    return false;
  }
  if (isSwitchboardProofHost(bootstrap.hostname)) {
    return isSwitchboardProofHost(candidate.hostname);
  }
  if (isLocalHostname(bootstrap.hostname)) {
    return isLocalHostname(candidate.hostname);
  }
  return candidate.hostname === bootstrap.hostname;
}

function isSwitchboardProofHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "switchboard.proof.computer" || normalized.endsWith(".switchboard.proof.computer");
}

function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function uniqueBaseUrls(urls: string[]): string[] {
  return [...new Set(urls.map((url) => normalizedBaseUrl(url)).filter((url): url is string => Boolean(url)))];
}

function normalizedBaseUrl(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

const GEO_IP_SUCCESS_TTL_MS = 60 * 60 * 1_000;
const GEO_IP_FAILURE_TTL_MS = 5 * 60 * 1_000;
const GEO_IP_LOOKUP_TIMEOUT_MS = 1_500;

async function gatewayGeoIpStatus(
  state: DemoState,
  observability: Record<string, unknown> | undefined
): Promise<Record<string, GatewayGeoIp>> {
  const addresses = gatewayPublicAddresses(observability);
  if (addresses.length === 0) {
    return {};
  }
  const entries = await Promise.all(addresses.map(async (ip) => [ip, await cachedGatewayGeoIp(state, ip)] as const));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, GatewayGeoIp] => Boolean(entry[1])));
}

async function cachedGatewayGeoIp(state: DemoState, ip: string): Promise<GatewayGeoIp | undefined> {
  const now = Date.now();
  const cached = state.geoIpCache[ip];
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }
  const checkedAt = new Date(now).toISOString();
  try {
    const result = await fetchGatewayGeoIp(ip, checkedAt);
    state.geoIpCache[ip] = {
      expiresAt: now + (result ? GEO_IP_SUCCESS_TTL_MS : GEO_IP_FAILURE_TTL_MS),
      result
    };
    return result;
  } catch {
    state.geoIpCache[ip] = {
      expiresAt: now + GEO_IP_FAILURE_TTL_MS
    };
    return undefined;
  }
}

async function fetchGatewayGeoIp(ip: string, checkedAt: string): Promise<GatewayGeoIp | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEO_IP_LOOKUP_TIMEOUT_MS).unref();
  try {
    const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return undefined;
    }
    const payload = await response.json().catch(() => undefined) as Record<string, unknown> | undefined;
    if (!payload || payload.status !== "success") {
      return undefined;
    }
    const countryCode = uppercaseCountryCode(stringField(payload, "countryCode"));
    const country = stringField(payload, "country");
    if (!countryCode && !country) {
      return undefined;
    }
    return {
      countryCode,
      country,
      flag: countryCode ? countryCodeToFlag(countryCode) : undefined,
      checkedAt
    };
  } finally {
    clearTimeout(timeout);
  }
}

function gatewayPublicAddresses(observability: Record<string, unknown> | undefined): string[] {
  const capability = recordField(recordField(observability, "gateway"), "capability");
  const publicAddresses = capability?.publicAddresses;
  if (!Array.isArray(publicAddresses)) {
    return [];
  }
  return [...new Set(publicAddresses.map((item) => typeof item === "string" && item.length > 0 ? item : undefined).filter((item): item is string => Boolean(item)))];
}

function uppercaseCountryCode(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

function countryCodeToFlag(countryCode: string): string | undefined {
  const normalized = uppercaseCountryCode(countryCode);
  if (!normalized) {
    return undefined;
  }
  const regionalIndicatorA = 0x1f1e6;
  const asciiA = 65;
  return String.fromCodePoint(
    ...[...normalized].map((letter) => regionalIndicatorA + letter.charCodeAt(0) - asciiA)
  );
}

async function resolveDemoJobSigner(runtime: SwitchboardRuntime, state: DemoState): Promise<void> {
  if (state.jobSigner) {
    return;
  }
  try {
    const acurastSigner = maybeAcurastJobSigner();
    if (acurastSigner) {
      state.signerMode = "acurast-secp256k1";
      state.jobSigner = await acurastSigner.getAddress();
      return;
    }
    const privateKey = runtime.configValue("JOB_SIGNER_PRIVATE_KEY");
    if (privateKey) {
      state.signerMode = "private-key";
      state.jobSigner = await privateKeyJobSigner(privateKey).getAddress();
    }
  } catch {
    state.signerMode ??= "unavailable";
  }
}

async function runRelayDiagnosticsOnce(runtime: SwitchboardRuntime, state: DemoState): Promise<void> {
  const relayUrl = runtime.configValue("RELAY_URL") ?? runtime.configValue("SWITCHBOARD_RELAY_URL");
  if (!relayUrl) {
    await runtime.log("relay-diagnostics-skipped", { reason: "missing-relay-url" });
    return;
  }

  const timeoutMs = numberConfig(runtime, "SWITCHBOARD_RELAY_DIAGNOSTICS_TIMEOUT_MS", 10_000);
  const result = await runRelayDiagnostics(relayUrl, timeoutMs);
  state.relayDiagnostics = {
    ...result,
    checkedAt: new Date().toISOString()
  };
  await runtime.log("relay-diagnostics", { ...result });
}

function configuredCertificateHostnames(runtime: SwitchboardRuntime, endpointHostname: string | undefined): string[] {
  const configured = splitCsv(runtime.configValue("SWITCHBOARD_CERTIFICATE_HOSTNAMES") ?? "");
  return [...new Set((configured.length > 0 ? configured : endpointHostname ? [endpointHostname] : []).map(normalizeHostname).filter(Boolean))];
}

function configuredCustomerHostnames(
  runtime: SwitchboardRuntime,
  observability: Record<string, unknown> | undefined,
  certificateHostnames: string[],
  endpointHostname: string | undefined
): string[] {
  const configured = splitCsv(runtime.configValue("SWITCHBOARD_CUSTOMER_HOSTNAMES") ?? "");
  if (configured.length > 0) {
    return uniqueHostnames(configured);
  }
  const observed = observedCustomerHostnames(observability);
  if (observed.length > 0) {
    return observed;
  }
  const endpoint = endpointHostname ? normalizeHostname(endpointHostname) : undefined;
  return uniqueHostnames(
    certificateHostnames.filter((hostname) => hostname !== endpoint && !looksLikeValidationHostname(hostname))
  );
}

function observedCustomerHostnames(observability: Record<string, unknown> | undefined): string[] {
  const customerHostnames = recordField(recordField(observability, "dns"), "customerHostnames");
  const rows = customerHostnames?.hostnames;
  if (!Array.isArray(rows)) {
    return [];
  }
  return uniqueHostnames(rows.map((item) => stringField(item, "customerHostname")).filter((item): item is string => Boolean(item)));
}

function looksLikeValidationHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized.includes("-validation.") || normalized.startsWith("validation.");
}

function uniqueHostnames(hostnames: string[]): string[] {
  return [...new Set(hostnames.map(normalizeHostname).filter(Boolean))];
}

function requiredRegistrationConfigNames(): string[] {
  return [
    "RELAY_URL",
    "CHAIN_ID",
    "INGRESS_REGISTRY_ADDRESS",
    "SESSION_ID",
    "JOB_ID",
    "OPERATOR_ID",
    "PROCESSOR_ID",
    "ENDPOINT_HOSTNAME"
  ];
}

function acurastRuntimeStatus(runtime: SwitchboardRuntime): Record<string, unknown> {
  const std = acurastStd();
  return {
    deploymentId: runtime.deploymentId,
    rawDeploymentId: safeCall(() => std?.job?.getId?.()),
    processorId: safeCall(() => std?.job?.getProcessorId?.()),
    deviceAddress: safeCall(() => std?.device?.getAddress?.()),
    hasStd: Boolean(std)
  };
}

function runtimeSummary(runtime?: SwitchboardRuntime, state?: DemoState): Record<string, unknown> {
  const std = acurastStd();
  const appVersion =
    state?.appVersion ??
    runtime?.configValue("SWITCHBOARD_DEMO_VERSION") ??
    process.env.SWITCHBOARD_DEMO_VERSION ??
    process.env.npm_package_version;
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    hasStd: Boolean(std),
    hasStdEnv: Boolean(std?.env),
    hasStdJobGetId: typeof std?.job?.getId === "function",
    hasStdJobGetProcessorId: typeof std?.job?.getProcessorId === "function",
    hasStdJobGetPublicKeys: typeof std?.job?.getPublicKeys === "function",
    hasStdDeviceGetAddress: typeof std?.device?.getAddress === "function",
    hasStdSignersSecp256k1: typeof std?.signers?.secp256k1?.sign === "function",
    hasStdNetAddAllowedHostnames: typeof std?.net?.addAllowedHostnames === "function",
    appVersion
  };
}

function networkAddressSummary(): Record<string, unknown> {
  return {
    publicIpv4: [
      ...new Set(
        Object.values(networkInterfaces())
          .flatMap((values) => values ?? [])
          .filter((item) => item.internal === false && String(item.family) === "IPv4")
          .map((item) => item.address)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      )
    ]
  };
}

function configPresence(runtime: SwitchboardRuntime, names: string[]): Record<string, boolean> {
  return Object.fromEntries(names.map((name) => [name, Boolean(runtime.configValue(name))]));
}

function clientInfoFromRequest(request: express.Request): { ip?: string; userAgent?: string } {
  const forwarded = headerValue(request.headers["x-forwarded-for"])?.split(",")[0]?.trim();
  const ip = normalizeClientIp(forwarded ?? request.ip ?? request.socket.remoteAddress);
  return {
    ip,
    userAgent: headerValue(request.headers["user-agent"])
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item) => item.length > 0);
  }
  return value && value.length > 0 ? value : undefined;
}

function normalizeClientIp(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice("::ffff:".length);
  }
  return trimmed;
}

function relayHost(runtime: SwitchboardRuntime): string | undefined {
  const raw = runtime.configValue("RELAY_URL");
  if (!raw) {
    return undefined;
  }
  try {
    return new URL(raw).host;
  } catch {
    return undefined;
  }
}

function numberConfig(runtime: SwitchboardRuntime, name: string, fallback: number): number {
  const raw = runtime.configValue(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function acurastStd(): AcurastRuntimeStd | undefined {
  return (globalThis as { _STD_?: AcurastRuntimeStd })._STD_;
}

function safeCall(callback: () => unknown): unknown {
  try {
    const value = callback();
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : value ? JSON.stringify(value) : undefined;
  } catch {
    return undefined;
  }
}

function splitCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().replace(/\.$/, "").toLowerCase();
}

function recordField(value: unknown, name: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[name];
  return field && typeof field === "object" && !Array.isArray(field) ? field as Record<string, unknown> : undefined;
}

function stringField(value: unknown, name: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[name];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function listen(server: HttpServer, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function isRuntime(value: SwitchboardExpressDemoOptions["runtime"]): value is SwitchboardRuntime {
  return Boolean(value && typeof (value as SwitchboardRuntime).prepare === "function");
}

function isMainModule(): boolean {
  if (!process.argv[1]) {
    return false;
  }
  const currentFile = fileURLToPath(import.meta.url);
  try {
    return realpathSync(process.argv[1]) === realpathSync(currentFile);
  } catch {
    return process.argv[1] === currentFile;
  }
}

if (isMainModule()) {
  startSwitchboardExpressDemo().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
