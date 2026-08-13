import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AtlasClient } from "../dist/client.js";
import { draftsFromHook } from "../dist/adapters.js";
import { FileEventQueue } from "../dist/queue.js";
import { installPersistentRuntime, integrationConfig, integrationSnippet } from "../dist/installers.js";
import { createDeviceSetupSecrets, startAtlasDeviceSetup } from "../dist/device.js";
import { AtlasRuntimeBridge } from "../dist/runtime.js";

test("Codex hook mapping never forwards prompt or tool input content", () => {
  const drafts = draftsFromHook("codex", {
    hook_event_name: "UserPromptSubmit",
    session_id: "secret-session",
    prompt: "Customer Alpha password is hunter2",
    tool_input: { command: "cat ~/.ssh/id_rsa" },
  });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].event, "turn.started");
  assert.equal(drafts[0].status, "working");
  const serialized = JSON.stringify(drafts);
  assert.doesNotMatch(serialized, /Customer Alpha|hunter2|ssh|cat/);
});

test("custom hooks accept only controlled lifecycle fields", () => {
  const drafts = draftsFromHook("custom", {
    event: "status.changed",
    sessionId: "custom-session",
    status: "working",
    activity: "coding",
    topic: "software-development",
    prompt: "private prompt",
    tool_output: "private output",
  });
  assert.deepEqual(drafts, [{
    event: "status.changed",
    sessionId: "custom-session",
    status: "working",
    activity: "coding",
    topic: "software-development",
    occurredAt: undefined,
  }]);
  assert.doesNotMatch(JSON.stringify(drafts), /private|prompt|output/);
  assert.deepEqual(draftsFromHook("custom", { event: "arbitrary.event", status: "working" }), []);
});

test("events are delivered from the local queue with hashed sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-sdk-"));
  const queue = new FileEventQueue(directory);
  let posted;
  const client = new AtlasClient({
    endpoint: "https://atlas.example",
    token: "atlas_live_test",
    installationId: "installation-test",
    runtime: "codex",
    queue,
    fetch: async (_url, init) => {
      posted = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ accepted: 1 }), { status: 202 });
    },
  });
  const result = await client.emit({ event: "turn.started", sessionId: "raw-secret-session", status: "working" });
  assert.equal(result.delivered, true);
  assert.equal(await queue.size(), 0);
  assert.equal(posted.events[0].session_id.length, 64);
  assert.notEqual(posted.events[0].session_id, "raw-secret-session");
  assert.deepEqual(Object.keys(posted.events[0]).sort(), [
    "event", "event_id", "installation_id", "occurred_at", "runtime", "schema_version", "sequence", "session_id", "state",
  ]);
  await rm(directory, { recursive: true, force: true });
});

test("concurrent runtime sessions keep independent lifecycle state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-sdk-session-state-"));
  const queue = new FileEventQueue(directory);
  const events = [];
  const client = new AtlasClient({
    endpoint: "https://atlas.example",
    token: "atlas_live_test",
    installationId: "installation-test",
    runtime: "custom",
    queue,
    fetch: async (_url, init) => {
      events.push(...JSON.parse(String(init?.body)).events);
      return new Response(null, { status: 202 });
    },
  });
  await client.emit({ event: "topic.changed", sessionId: "alpha", topic: "research" });
  await client.emit({ event: "topic.changed", sessionId: "beta", topic: "design" });
  await client.emit({ event: "session.heartbeat", sessionId: "alpha" });
  assert.equal(events[2].state.topic, "research");
  assert.notEqual(events[0].session_id, events[1].session_id);
  await rm(directory, { recursive: true, force: true });
});

test("network failures keep telemetry queued without breaking the agent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-sdk-offline-"));
  const queue = new FileEventQueue(directory);
  const client = new AtlasClient({
    endpoint: "https://atlas.example",
    token: "atlas_live_test",
    installationId: "installation-test",
    runtime: "hermes",
    queue,
    requestTimeoutMs: 50,
    fetch: async () => { throw new Error("offline"); },
  });
  const result = await client.emit({ event: "session.heartbeat", sessionId: "session" });
  assert.equal(result.delivered, false);
  assert.equal(await queue.size(), 1);
  await rm(directory, { recursive: true, force: true });
});

test("runtime bridge recovers missing starts and keeps hook content private", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-sdk-bridge-"));
  const queue = new FileEventQueue(directory);
  const events = [];
  const client = new AtlasClient({
    endpoint: "https://atlas.example",
    token: "atlas_live_test",
    installationId: "installation-test",
    runtime: "openclaw",
    queue,
    fetch: async (_url, init) => {
      events.push(...JSON.parse(String(init?.body)).events);
      return new Response(JSON.stringify({ accepted: 1 }), { status: 202 });
    },
  });
  const bridge = new AtlasRuntimeBridge({ client, runtime: "openclaw" });
  const result = await bridge.handleHook({
    event: "before_agent_run",
    sessionId: "private-session",
    prompt: "Do not forward this customer prompt",
    command: "cat ~/.ssh/id_rsa",
  });
  assert.equal(result.handled, true);
  assert.equal(result.deliveries.length, 2);
  assert.equal(bridge.activeSessionCount, 1);
  assert.deepEqual(events.map((event) => event.event), ["session.started", "turn.started"]);
  assert.deepEqual(events.map((event) => event.sequence), [0, 1]);
  assert.doesNotMatch(JSON.stringify(events), /customer prompt|ssh|cat|private-session/i);

  await bridge.heartbeat();
  await bridge.stop();
  assert.deepEqual(events.map((event) => event.event), [
    "session.started",
    "turn.started",
    "session.heartbeat",
    "session.ended",
  ]);
  assert.equal(bridge.activeSessionCount, 0);
  await rm(directory, { recursive: true, force: true });
});

test("runtime bridge ignores unknown hooks and deduplicates session starts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-sdk-bridge-start-"));
  const queue = new FileEventQueue(directory);
  const events = [];
  const client = new AtlasClient({
    endpoint: "https://atlas.example",
    token: "atlas_live_test",
    installationId: "installation-test",
    runtime: "hermes",
    queue,
    fetch: async (_url, init) => {
      events.push(...JSON.parse(String(init?.body)).events);
      return new Response(null, { status: 202 });
    },
  });
  const bridge = new AtlasRuntimeBridge({ client, runtime: "hermes" });
  assert.equal((await bridge.handleHook({ event: "not_an_atlas_hook" })).handled, false);
  await bridge.handleHook({ event: "on_session_start", sessionId: "session-a" });
  await bridge.handleHook({ event: "on_session_start", sessionId: "session-a" });
  assert.deepEqual(events.map((event) => event.event), ["session.started"]);
  await bridge.stop();
  await rm(directory, { recursive: true, force: true });
});

test("hook installers cover deterministic lifecycle events", () => {
  const codex = integrationConfig("codex");
  const claude = integrationConfig("claude-code");
  for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]) {
    assert.ok(event in codex.hooks);
    assert.ok(event in claude.hooks);
  }
  assert.ok("SessionEnd" in claude.hooks);
  assert.match(integrationSnippet("openclaw"), /createAtlasRuntimeBridge/);
  assert.match(integrationSnippet("openclaw"), /atlas\.handleHook/);
});

test("device setup keeps the raw installation credential on the user's machine", async () => {
  const secrets = createDeviceSetupSecrets();
  assert.match(secrets.installationToken, /^atlas_live_[A-Za-z0-9_-]{43}$/);
  assert.match(secrets.installationTokenHash, /^[a-f0-9]{64}$/);
  assert.equal(secrets.codeVerifier.length, 43);
  assert.equal(secrets.codeChallenge.length, 43);

  let posted;
  const authorization = await startAtlasDeviceSetup({
    endpoint: "https://atlas.example",
    displayName: "Test Codex",
    runtime: "codex",
    fetch: async (_url, init) => {
      posted = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        device_code: "atlas_device_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
        user_code: "ABCD-2345",
        verification_uri: "https://atlas.example/connect",
        verification_uri_complete: "https://atlas.example/connect?code=ABCD-2345",
        expires_in: 600,
        interval: 5,
      }), { status: 201 });
    },
  });
  assert.equal(authorization.userCode, "ABCD-2345");
  assert.equal(posted.installation_token_hash.length, 64);
  assert.ok(!JSON.stringify(posted).includes(authorization.installationToken));
});

test("one-shot setup persists a hook runtime after npx exits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atlas-sdk-runtime-"));
  const runtime = await installPersistentRuntime(directory);
  assert.match(await readFile(join(directory, "cli.js"), "utf8"), /Atlas SDK 0\.2/);
  assert.match(runtime.hookCommand("codex"), /cli\.js.*hook codex/);
  await rm(directory, { recursive: true, force: true });
});
