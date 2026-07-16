import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AtlasClient } from "../dist/client.js";
import { draftsFromHook } from "../dist/adapters.js";
import { FileEventQueue } from "../dist/queue.js";
import { installPersistentRuntime, integrationConfig } from "../dist/installers.js";
import { createDeviceSetupSecrets, startAtlasDeviceSetup } from "../dist/device.js";

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

test("hook installers cover deterministic lifecycle events", () => {
  const codex = integrationConfig("codex");
  const claude = integrationConfig("claude-code");
  for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]) {
    assert.ok(event in codex.hooks);
    assert.ok(event in claude.hooks);
  }
  assert.ok("SessionEnd" in claude.hooks);
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
  assert.match(await readFile(join(directory, "cli.js"), "utf8"), /Atlas SDK 0\.1/);
  assert.match(runtime.hookCommand("codex"), /cli\.js.*hook codex/);
  await rm(directory, { recursive: true, force: true });
});
