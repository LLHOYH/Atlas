import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const protocol = await readFile(new URL("../packages/sdk/src/protocol.ts", import.meta.url), "utf8");
const adapters = await readFile(new URL("../packages/sdk/src/adapters.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202607160001_atlas_sdk_ingestion.sql", import.meta.url), "utf8");
const eventRoute = await readFile(new URL("../app/api/atlas/v1/events/route.ts", import.meta.url), "utf8");
const registrationRoute = await readFile(new URL("../app/api/atlas/v1/installations/route.ts", import.meta.url), "utf8");
const edgeFunction = await readFile(new URL("../supabase/functions/atlas-ingest/index.ts", import.meta.url), "utf8");

test("Atlas SDK exposes a controlled privacy-safe lifecycle protocol", () => {
  for (const event of ["session.started", "turn.started", "tool.completed", "status.changed", "session.ended"]) {
    assert.match(protocol, new RegExp(`"${event.replace(".", "\\.")}"`));
  }
  for (const forbidden of ["prompt", "response", "tool_input", "tool_output", "file_path", "repository", "command", "url"]) {
    assert.doesNotMatch(protocol, new RegExp(`\\b${forbidden}\\b`, "i"));
  }
  assert.match(adapters, /activityForTool/);
  assert.doesNotMatch(adapters, /input\.prompt|input\.tool_input|conversation_history/);
});

test("Atlas ingestion stores only token hashes and validates events in the database", () => {
  assert.match(migration, /token_hash text not null unique/);
  assert.doesNotMatch(migration, /token text not null/);
  assert.match(migration, /security definer/);
  assert.match(migration, /atlas_ingest_agent_events/);
  assert.match(migration, /on conflict \(event_id\) do nothing/);
  assert.match(migration, /v_energy := case/);
  assert.match(migration, /atlas_agent_events_raw enable row level security/);
  assert.doesNotMatch(migration, /grant select on public\.atlas_agent_events_raw to anon/);
});

test("local and edge ingestion routes share batch validation", () => {
  assert.match(eventRoute, /sanitizeAtlasEventBatch/);
  assert.match(eventRoute, /hashInstallationToken/);
  assert.match(registrationRoute, /auth\.getUser\(accessToken\)/);
  assert.match(registrationRoute, /createInstallationToken/);
  assert.match(edgeFunction, /sanitizeAtlasEventBatch/);
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /action === "installations"/);
  assert.match(edgeFunction, /action === "events"/);
  assert.match(edgeFunction, /MAX_BODY_BYTES/);
  assert.match(edgeFunction, /request\.arrayBuffer\(\)/);
});
