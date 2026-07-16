import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const protocol = await readFile(new URL("../packages/sdk/src/protocol.ts", import.meta.url), "utf8");
const adapters = await readFile(new URL("../packages/sdk/src/adapters.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202607160001_atlas_sdk_ingestion.sql", import.meta.url), "utf8");
const eventRoute = await readFile(new URL("../app/api/atlas/v1/events/route.ts", import.meta.url), "utf8");
const registrationRoute = await readFile(new URL("../app/api/atlas/v1/installations/route.ts", import.meta.url), "utf8");
const edgeFunction = await readFile(new URL("../supabase/functions/atlas-ingest/index.ts", import.meta.url), "utf8");
const deviceMigration = await readFile(new URL("../supabase/migrations/202607160002_atlas_device_authorization.sql", import.meta.url), "utf8");
const devicePage = await readFile(new URL("../app/connect/DeviceConnect.tsx", import.meta.url), "utf8");
const presenceHook = await readFile(new URL("../hooks/useAtlasPresence.ts", import.meta.url), "utf8");
const authOptions = await readFile(new URL("../app/AtlasAuthOptions.tsx", import.meta.url), "utf8");

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

test("device authorization links approved agents to an authenticated Atlas profile", () => {
  assert.match(deviceMigration, /atlas_device_authorizations/);
  assert.match(deviceMigration, /owner_id uuid references auth\.users/);
  assert.match(deviceMigration, /installation_token_hash text not null unique/);
  assert.match(deviceMigration, /code_challenge text not null/);
  assert.match(deviceMigration, /atlas_approve_device_authorization/);
  assert.match(deviceMigration, /grant execute on function public\.atlas_approve_device_authorization[\s\S]*to service_role/);
  assert.doesNotMatch(deviceMigration, /email text/);
  assert.match(edgeFunction, /\/device\/code/);
  assert.match(edgeFunction, /\/device\/verify/);
  assert.match(edgeFunction, /\/device\/approve/);
  assert.match(edgeFunction, /\/device\/token/);
});

test("Atlas provides browser approval and an owned-agent profile collection", () => {
  assert.match(devicePage, /signInWithOtp/);
  assert.match(authOptions, /Continue with GitHub/);
  assert.match(authOptions, /Continue with Google/);
  assert.match(authOptions, /type="email"/);
  assert.match(authOptions, /one-time sign-in link/);
  assert.match(devicePage, /Approximate agent location/);
  assert.match(devicePage, /Prompts, responses, files, commands and precise location are excluded/);
  assert.match(presenceHook, /atlas_agent_installations/);
  assert.match(presenceHook, /AtlasOwnedAgent/);
});
