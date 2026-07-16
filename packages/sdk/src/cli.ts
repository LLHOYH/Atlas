#!/usr/bin/env node
import process from "node:process";
import { AtlasClient } from "./client.js";
import { draftsFromHook, type AtlasRuntime } from "./adapters.js";
import { readAtlasConfig, writeAtlasConfig } from "./config.js";
import { installJsonIntegration, integrationSnippet } from "./installers.js";
import { atlasActivities, atlasStatuses, atlasTopics, type AtlasActivity, type AtlasStatus, type AtlasTopic } from "./protocol.js";

function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireOption(name: string) {
  const value = option(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

async function stdinJson() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function configuredClient(runtimeOverride?: string) {
  const config = await readAtlasConfig();
  if (!config) throw new Error("Atlas is not registered. Run `atlas register` first.");
  return {
    config,
    client: new AtlasClient({
      endpoint: config.endpoint,
      token: config.token,
      installationId: config.installationId,
      runtime: runtimeOverride ?? config.runtime,
      runtimeVersion: config.runtimeVersion,
      defaultTopic: config.defaultTopic,
      defaultActivity: config.defaultActivity,
    }),
  };
}

async function register() {
  const endpoint = requireOption("endpoint");
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/installations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireOption("access-token")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      display_name: requireOption("name"),
      runtime: requireOption("runtime"),
      runtime_version: option("runtime-version") ?? "unknown",
      city_id: requireOption("city"),
    }),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Atlas registration failed");
  await writeAtlasConfig({
    endpoint,
    token: String(body.token),
    installationId: String(body.installation_id),
    agentId: String(body.agent_id),
    runtime: requireOption("runtime"),
    runtimeVersion: option("runtime-version") ?? "unknown",
    defaultTopic: (option("topic") ?? "other") as AtlasTopic,
    defaultActivity: (option("activity") ?? "working") as AtlasActivity,
  });
  process.stdout.write(`Registered ${String(body.agent_id)}\n`);
}

async function hook(runtime: AtlasRuntime) {
  const config = await readAtlasConfig();
  if (!config) return;
  const input = await stdinJson();
  const client = new AtlasClient({
    endpoint: config.endpoint,
    token: config.token,
    installationId: config.installationId,
    runtime,
    runtimeVersion: config.runtimeVersion,
    defaultTopic: config.defaultTopic,
    defaultActivity: config.defaultActivity,
  });
  for (const draft of draftsFromHook(runtime, input, { topic: config.defaultTopic, activity: config.defaultActivity })) {
    await client.emit(draft);
  }
}

async function updateState(kind: "status" | "topic" | "activity", value: string) {
  const { client } = await configuredClient();
  if (kind === "status" && atlasStatuses.includes(value as AtlasStatus)) {
    await client.emit({ event: "status.changed", status: value as AtlasStatus });
  } else if (kind === "topic" && atlasTopics.includes(value as AtlasTopic)) {
    await client.emit({ event: "topic.changed", topic: value as AtlasTopic });
  } else if (kind === "activity" && atlasActivities.includes(value as AtlasActivity)) {
    await client.emit({ event: "activity.changed", activity: value as AtlasActivity });
  } else {
    throw new Error(`Unsupported Atlas ${kind}: ${value}`);
  }
}

function help() {
  process.stdout.write(`Atlas SDK 0.1\n\n`);
  process.stdout.write(`atlas register --endpoint URL --access-token TOKEN --name NAME --runtime RUNTIME --city CITY_ID\n`);
  process.stdout.write(`atlas install codex|claude-code\n`);
  process.stdout.write(`atlas hook codex|claude-code|hermes|openclaw\n`);
  process.stdout.write(`atlas status online|working|idle|offline\n`);
  process.stdout.write(`atlas topic <category>\n`);
  process.stdout.write(`atlas activity <category>\n`);
  process.stdout.write(`atlas integration hermes|openclaw\n`);
  process.stdout.write(`atlas diagnose\n`);
}

async function main() {
  const [, , command, argument] = process.argv;
  if (!command || command === "help" || command === "--help") return help();
  if (command === "register") return register();
  if (command === "hook") return hook(argument as AtlasRuntime);
  if (command === "install" && (argument === "codex" || argument === "claude-code")) {
    const path = await installJsonIntegration(argument);
    process.stdout.write(`Installed Atlas hooks in ${path}\n`);
    return;
  }
  if (command === "integration" && (argument === "hermes" || argument === "openclaw")) {
    process.stdout.write(integrationSnippet(argument));
    return;
  }
  if (command === "status" || command === "topic" || command === "activity") {
    if (!argument) throw new Error(`Missing ${command} value`);
    return updateState(command, argument);
  }
  if (command === "diagnose") {
    const config = await readAtlasConfig();
    if (!config) throw new Error("Atlas is not registered.");
    const { client } = await configuredClient();
    const delivered = await client.flush();
    process.stdout.write(`Atlas configured for ${config.agentId}; flushed ${delivered} queued event(s).\n`);
    return;
  }
  throw new Error(`Unknown Atlas command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
