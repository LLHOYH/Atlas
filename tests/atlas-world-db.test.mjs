import assert from "node:assert/strict";
import test from "node:test";
import { getSupabasePublicConfig } from "../scripts/lib/atlas-env.mjs";
import { readAtlasWorld, verifyAtlasWorld } from "../scripts/lib/verify-atlas-world.mjs";

const config = getSupabasePublicConfig();

test("Supabase exposes the complete seeded Atlas world", { skip: !config }, async () => {
  const world = await readAtlasWorld(config);
  const summary = verifyAtlasWorld(world);

  assert.equal(summary.cities, 8);
  assert.equal(summary.topics, 24);
  assert.equal(summary.signals, 17);
  assert.equal(summary.streets, 32);
  assert.ok(summary.agents >= 800);
  assert.ok(summary.agentEvents >= 1_600);
  assert.ok(summary.workingAgents >= 300);
  assert.ok(summary.onlineAgents >= 230);
  assert.ok(summary.idleAgents >= 150);
  assert.ok(summary.offlineAgents >= 75);
  assert.ok(summary.agentEnergy >= 40_000);
  assert.equal(summary.humanActivity, 11_524);
  assert.equal(summary.aiActivity, 5_420);

  assert.equal(world.cities[0].name, "Singapore");
  assert.equal(world.cities.at(-1)?.name, "Sydney");
  assert.ok(world.signals.some((signal) => signal.entity_kind === "ai"));
  assert.ok(world.signals.some((signal) => signal.entity_kind === "human"));
  assert.ok(world.streets.some((street) => street.name === "Orchard Road"));
  assert.ok(world.agents.some((agent) => agent.status === "working"));
  assert.ok(world.agents.some((agent) => agent.status === "offline"));
  assert.ok(world.agents.every((agent) => agent.topic && agent.runtime));
  assert.ok(world.cities.every((city) => world.agents.filter((agent) => agent.city_id === city.id).length >= 100));
  assert.ok(world.agents.some((agent) => agent.runtime === "Hermes"));
});
