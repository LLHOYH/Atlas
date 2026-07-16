import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AtlasClient } from "../dist/client.js";
import { draftsFromHook } from "../dist/adapters.js";
import { FileEventQueue } from "../dist/queue.js";
import { integrationConfig } from "../dist/installers.js";

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
