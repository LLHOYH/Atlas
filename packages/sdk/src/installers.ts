import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { AtlasRuntime } from "./adapters.js";

type JsonObject = Record<string, unknown>;

function commandHook(command: string, statusMessage: string) {
  return { type: "command", command, timeout: 5, statusMessage };
}

function hookGroup(command: string, statusMessage: string, matcher?: string) {
  return [{ ...(matcher ? { matcher } : {}), hooks: [commandHook(command, statusMessage)] }];
}

export function integrationConfig(runtime: "codex" | "claude-code", command = `atlas hook ${runtime}`) {
  const common = {
    SessionStart: hookGroup(command, "Connecting Atlas"),
    UserPromptSubmit: hookGroup(command, "Updating Atlas activity"),
    PreToolUse: hookGroup(command, "Updating Atlas activity", ".*"),
    PostToolUse: hookGroup(command, "Updating Atlas activity", ".*"),
    Stop: hookGroup(command, "Updating Atlas status"),
    SubagentStart: hookGroup(command, "Updating Atlas activity", ".*"),
    SubagentStop: hookGroup(command, "Updating Atlas status", ".*"),
  };
  return {
    hooks: runtime === "claude-code"
      ? { ...common, SessionEnd: hookGroup(command, "Disconnecting Atlas") }
      : common,
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeHooks(current: JsonObject, addition: JsonObject) {
  const result = { ...current };
  for (const [event, groups] of Object.entries(addition)) {
    const existing = Array.isArray(result[event]) ? result[event] as unknown[] : [];
    const incoming = Array.isArray(groups) ? groups : [];
    const signatures = new Set(existing.map((group) => JSON.stringify(group)));
    result[event] = [...existing, ...incoming.filter((group) => !signatures.has(JSON.stringify(group)))];
  }
  return result;
}

export async function installJsonIntegration(runtime: "codex" | "claude-code", path?: string, command?: string) {
  const destination = path ?? (runtime === "codex"
    ? join(homedir(), ".codex", "hooks.json")
    : join(homedir(), ".claude", "settings.json"));
  let current: JsonObject = {};
  try {
    const parsed = JSON.parse(await readFile(destination, "utf8"));
    if (!isObject(parsed)) throw new Error("configuration root is not an object");
    current = parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const addition = integrationConfig(runtime, command ?? `atlas hook ${runtime}`);
  const currentHooks = isObject(current.hooks) ? current.hooks : {};
  const next = { ...current, hooks: mergeHooks(currentHooks, addition.hooks) };
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, destination);
  return destination;
}

export async function installPersistentRuntime(path?: string) {
  const source = dirname(fileURLToPath(import.meta.url));
  const destination = path ?? join(homedir(), ".atlas", "runtime");
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await cp(source, destination, { recursive: true, force: true });
  await writeFile(join(destination, "package.json"), "{\"type\":\"module\"}\n", { encoding: "utf8", mode: 0o600 });
  return {
    path: destination,
    hookCommand(runtime: AtlasRuntime) {
      return `${JSON.stringify(process.execPath)} ${JSON.stringify(join(destination, "cli.js"))} hook ${runtime}`;
    },
  };
}

export function integrationSnippet(runtime: Exclude<AtlasRuntime, "codex" | "claude-code" | "custom">, command?: string) {
  if (runtime === "hermes") {
    const hookCommand = command ?? "atlas hook hermes";
    const yamlCommand = `'${hookCommand.replaceAll("'", "''")}'`;
    return `hooks:\n  on_session_start:\n    - command: ${yamlCommand}\n  pre_llm_call:\n    - command: ${yamlCommand}\n  pre_tool_call:\n    - matcher: ".*"\n      command: ${yamlCommand}\n  post_tool_call:\n    - matcher: ".*"\n      command: ${yamlCommand}\n  post_llm_call:\n    - command: ${yamlCommand}\n  on_session_end:\n    - command: ${yamlCommand}\n`;
  }
  return `import { createAtlasAgent, createAtlasRuntimeBridge } from "atlas-ai-sdk";\n\nconst client = createAtlasAgent({\n  endpoint: process.env.ATLAS_ENDPOINT,\n  token: process.env.ATLAS_AGENT_TOKEN,\n  installationId: process.env.ATLAS_INSTALLATION_ID,\n  runtime: "openclaw",\n});\n\nconst atlas = createAtlasRuntimeBridge({ client, runtime: "openclaw" });\n\n// Register these observation hooks in your OpenClaw plugin:\n// session_start, before_agent_run, before_tool_call, after_tool_call,\n// agent_end, session_end, subagent_spawned, subagent_ended.\n// Send each native hook envelope through atlas.handleHook(event), then call\n// atlas.stop() when the plugin host shuts down. Raw hook content is discarded.\n`;
}
