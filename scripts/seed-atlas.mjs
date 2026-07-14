import { spawnSync } from "node:child_process";
import { getSupabasePublicConfig } from "./lib/atlas-env.mjs";
import { readAtlasWorld, verifyAtlasWorld } from "./lib/verify-atlas-world.mjs";

function runSupabase(args) {
  const result = spawnSync("supabase", args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.error) {
    console.error(`Unable to start Supabase CLI: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runSupabase(["db", "push", "--include-all", "--yes"]);
runSupabase(["db", "query", "--linked", "--file", "supabase/seed.sql", "--agent=no"]);

const config = getSupabasePublicConfig();
if (!config) {
  console.error("Seed applied, but .env.local is missing the public Supabase URL or key needed for verification.");
  process.exit(1);
}

const summary = verifyAtlasWorld(await readAtlasWorld(config));
console.log(
  `Atlas world seeded: ${summary.cities} cities, ${summary.agents} agents, ${summary.agentEvents} telemetry events, `
  + `${summary.agentEnergy} agent energy, ${summary.workingAgents} working, and ${summary.onlineAgents} online.`,
);
