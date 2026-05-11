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
  startedAt: string;
  challengeCount: number;
  lastChallengeAt?: string;
  lastChallenge?: Record<string, unknown>;
  certificates: SwitchboardManagedCertificate[];
  relayDiagnostics?: Record<string, unknown>;
  observability?: RelayObservabilitySnapshot;
  observabilityTimer?: NodeJS.Timeout;
  readyReportTimer?: NodeJS.Timeout;
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
  ok: boolean;
  status?: number;
  payload?: Record<string, unknown>;
  error?: string;
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

export function createSwitchboardExpressDemoApp(
  options: { title?: string; status?: () => Record<string, unknown> | Promise<Record<string, unknown>> } = {}
): Application {
  const title = options.title ?? "Switchboard Express Demo";
  const app = express();

  app.get("/", async (_request, response, next) => {
    try {
      const status = options.status ? await options.status() : placeholderStatus(title);
      response.type("html").send(renderDemoPage(status));
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
    startedAt: new Date().toISOString(),
    challengeCount: 0,
    certificates: [],
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
  const customerHostnames = certificateHostnames.filter((hostname) => hostname !== endpointHostname);
  const publicUrl = endpointHostname ? `https://${endpointHostname}/` : undefined;
  const challengeUrl = endpointHostname ? `${publicUrl}.well-known/proofcomputer/challenge?nonce=demo` : undefined;

  return {
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
    registration: inferredRegistrationState(runtime),
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
    runtime: runtimeSummary(),
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
}

function inferredRegistrationState(runtime: SwitchboardRuntime): Record<string, unknown> {
  const missing = requiredRegistrationConfigNames().filter((name) => !runtime.configValue(name));
  if (missing.length > 0) {
    return {
      state: "not-configured",
      missing
    };
  }
  return {
    state: "registered"
  };
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
  void pollObservabilityOnce(runtime, state, { relayUrl, intentId, token });
  state.observabilityTimer = setInterval(() => {
    void pollObservabilityOnce(runtime, state, { relayUrl, intentId, token });
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
  input: { relayUrl: string; intentId: string; token: string }
): Promise<void> {
  const checkedAt = new Date().toISOString();
  const timeoutMs = numberConfig(runtime, "SWITCHBOARD_OBSERVABILITY_TIMEOUT_MS", 8_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs).unref();
  try {
    const url = new URL(`/v1/deployment-intents/${encodeURIComponent(input.intentId)}/observability`, input.relayUrl);
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${input.token}`
      },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => undefined) as Record<string, unknown> | undefined;
    state.observability = {
      checkedAt,
      ok: response.ok,
      status: response.status,
      payload,
      error: response.ok ? undefined : `observability request failed: ${response.status}`
    };
  } catch (error) {
    state.observability = {
      checkedAt,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
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

function runtimeSummary(): Record<string, unknown> {
  const std = acurastStd();
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
    appVersion: process.env.npm_package_version
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
