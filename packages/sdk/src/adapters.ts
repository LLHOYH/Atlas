import type { AtlasActivity, AtlasEventDraft, AtlasTopic } from "./protocol.js";

export type AtlasRuntime = "codex" | "claude-code" | "hermes" | "openclaw" | "custom";

type HookRecord = Record<string, unknown>;

function record(value: unknown): HookRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as HookRecord : {};
}

function string(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function hookName(input: HookRecord) {
  return string(input.hook_event_name)
    ?? string(input.event_name)
    ?? string(input.event)
    ?? string(input.type)
    ?? "unknown";
}

function sessionId(input: HookRecord) {
  const context = record(input.context);
  return string(input.session_id)
    ?? string(input.sessionId)
    ?? string(context.sessionId)
    ?? string(context.sessionKey)
    ?? string(input.runId)
    ?? "default";
}

function toolName(input: HookRecord) {
  const event = record(input.event);
  return string(input.tool_name) ?? string(input.toolName) ?? string(event.toolName) ?? "tool";
}

export function activityForTool(name: string): AtlasActivity {
  const normalized = name.toLowerCase();
  if (/search|browser|fetch|web/.test(normalized)) return "searching";
  if (/test|verify|lint/.test(normalized)) return "testing";
  if (/review|diff/.test(normalized)) return "reviewing";
  if (/deploy|release|publish/.test(normalized)) return "deploying";
  if (/write|edit|patch|bash|terminal|exec|code/.test(normalized)) return "coding";
  return "working";
}

export function draftsFromHook(
  runtime: AtlasRuntime,
  rawInput: unknown,
  defaults: { topic?: AtlasTopic; activity?: AtlasActivity } = {},
): AtlasEventDraft[] {
  const input = record(rawInput);
  const name = hookName(input);
  const session = sessionId(input);
  const base = { sessionId: session, topic: defaults.topic ?? "other" as AtlasTopic };
  const toolActivity = activityForTool(toolName(input));
  const lookup: Record<AtlasRuntime, Record<string, AtlasEventDraft>> = {
    codex: {
      SessionStart: { ...base, event: "session.started", status: "online", activity: defaults.activity ?? "working" },
      UserPromptSubmit: { ...base, event: "turn.started", status: "working", activity: "planning" },
      PreToolUse: { ...base, event: "tool.started", status: "working", activity: toolActivity },
      PostToolUse: { ...base, event: "tool.completed", status: "working", activity: toolActivity },
      Stop: { ...base, event: "turn.completed", status: "online", activity: "working" },
      SubagentStart: { ...base, event: "turn.started", status: "working", activity: "planning" },
      SubagentStop: { ...base, event: "turn.completed", status: "online", activity: "working" },
    },
    "claude-code": {
      SessionStart: { ...base, event: "session.started", status: "online", activity: defaults.activity ?? "working" },
      UserPromptSubmit: { ...base, event: "turn.started", status: "working", activity: "planning" },
      PreToolUse: { ...base, event: "tool.started", status: "working", activity: toolActivity },
      PostToolUse: { ...base, event: "tool.completed", status: "working", activity: toolActivity },
      Stop: { ...base, event: "turn.completed", status: "online", activity: "working" },
      SessionEnd: { ...base, event: "session.ended", status: "offline", activity: "idle" },
      SubagentStart: { ...base, event: "turn.started", status: "working", activity: "planning" },
      SubagentStop: { ...base, event: "turn.completed", status: "online", activity: "working" },
    },
    hermes: {
      on_session_start: { ...base, event: "session.started", status: "online", activity: defaults.activity ?? "working" },
      pre_llm_call: { ...base, event: "turn.started", status: "working", activity: "planning" },
      pre_tool_call: { ...base, event: "tool.started", status: "working", activity: toolActivity },
      post_tool_call: { ...base, event: "tool.completed", status: "working", activity: toolActivity },
      post_llm_call: { ...base, event: "turn.completed", status: "online", activity: "working" },
      on_session_end: { ...base, event: "session.ended", status: "offline", activity: "idle" },
      on_session_finalize: { ...base, event: "session.ended", status: "offline", activity: "idle" },
      subagent_start: { ...base, event: "turn.started", status: "working", activity: "planning" },
      subagent_stop: { ...base, event: "turn.completed", status: "online", activity: "working" },
    },
    openclaw: {
      session_start: { ...base, event: "session.started", status: "online", activity: defaults.activity ?? "working" },
      before_agent_run: { ...base, event: "turn.started", status: "working", activity: "planning" },
      before_tool_call: { ...base, event: "tool.started", status: "working", activity: toolActivity },
      after_tool_call: { ...base, event: "tool.completed", status: "working", activity: toolActivity },
      agent_end: { ...base, event: "turn.completed", status: "online", activity: "working" },
      session_end: { ...base, event: "session.ended", status: "offline", activity: "idle" },
      subagent_spawned: { ...base, event: "turn.started", status: "working", activity: "planning" },
      subagent_ended: { ...base, event: "turn.completed", status: "online", activity: "working" },
    },
    custom: {},
  };
  const draft = lookup[runtime]?.[name];
  return draft ? [draft] : [];
}
