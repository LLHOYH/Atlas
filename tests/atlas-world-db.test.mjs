import assert from "node:assert/strict";
import test from "node:test";
import { getSupabasePublicConfig } from "../scripts/lib/atlas-env.mjs";
import { readAtlasWorld, verifyAtlasWorld } from "../scripts/lib/verify-atlas-world.mjs";

const config = getSupabasePublicConfig();

test("Supabase exposes the complete seeded Atlas world", { skip: !config }, async () => {
  const world = await readAtlasWorld(config);
  const summary = verifyAtlasWorld(world);

  assert.deepEqual(summary, {
    cities: 8,
    topics: 24,
    signals: 17,
    humanActivity: 11_524,
    aiActivity: 5_420,
  });

  assert.equal(world.cities[0].name, "Singapore");
  assert.equal(world.cities.at(-1)?.name, "Sydney");
  assert.ok(world.signals.some((signal) => signal.entity_kind === "ai"));
  assert.ok(world.signals.some((signal) => signal.entity_kind === "human"));
});
