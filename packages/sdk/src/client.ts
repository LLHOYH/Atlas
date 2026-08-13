import { createHash, randomBytes } from "node:crypto";
import { FileEventQueue, type AtlasEventQueue } from "./queue.js";
import { atlasQueuePath } from "./config.js";
import {
  ATLAS_PROTOCOL_VERSION,
  ATLAS_SDK_VERSION,
  sanitizeAtlasEvent,
  type AtlasActivity,
  type AtlasEvent,
  type AtlasEventDraft,
  type AtlasStatus,
  type AtlasTopic,
} from "./protocol.js";

export type AtlasClientOptions = {
  endpoint: string;
  token: string;
  installationId: string;
  runtime: string;
  runtimeVersion?: string;
  defaultTopic?: AtlasTopic;
  defaultActivity?: AtlasActivity;
  requestTimeoutMs?: number;
  queue?: AtlasEventQueue;
  fetch?: typeof fetch;
};

export type AtlasDelivery = { queued: true; delivered: boolean; eventId: string };

function eventId() {
  return `${Date.now().toString(36)}_${randomBytes(12).toString("hex")}`;
}

function hashSessionId(installationId: string, sessionId: string) {
  return createHash("sha256").update(`${installationId}:${sessionId}`).digest("hex");
}

export class AtlasClient {
  private readonly queue: AtlasEventQueue;
  private readonly request: typeof fetch;
  private readonly timeoutMs: number;
  private sequence = 0;
  private flushing = false;
  private readonly defaultState: { status: AtlasStatus; activity: AtlasActivity; topic: AtlasTopic };
  private readonly sessionStates = new Map<string, typeof this.defaultState>();

  constructor(private readonly options: AtlasClientOptions) {
    this.queue = options.queue ?? new FileEventQueue(atlasQueuePath());
    this.request = options.fetch ?? fetch;
    this.timeoutMs = options.requestTimeoutMs ?? 2_000;
    this.defaultState = {
      status: "online",
      activity: options.defaultActivity ?? "working",
      topic: options.defaultTopic ?? "other",
    };
  }

  async emit(draft: AtlasEventDraft): Promise<AtlasDelivery> {
    const rawSessionId = draft.sessionId ?? "default";
    const previousState = this.sessionStates.get(rawSessionId) ?? this.defaultState;
    const nextState = {
      status: draft.status ?? previousState.status,
      activity: draft.activity ?? previousState.activity,
      topic: draft.topic ?? previousState.topic,
    };
    if (draft.event === "session.ended") this.sessionStates.delete(rawSessionId);
    else this.sessionStates.set(rawSessionId, nextState);
    const next = sanitizeAtlasEvent({
      schema_version: ATLAS_PROTOCOL_VERSION,
      event_id: eventId(),
      installation_id: this.options.installationId,
      session_id: hashSessionId(this.options.installationId, rawSessionId),
      sequence: this.sequence++,
      event: draft.event,
      occurred_at: draft.occurredAt ?? new Date().toISOString(),
      runtime: {
        name: this.options.runtime,
        version: this.options.runtimeVersion ?? "unknown",
        adapter_version: ATLAS_SDK_VERSION,
      },
      state: nextState,
    });
    await this.queue.enqueue(next);
    const delivered = (await this.flush()) > 0;
    return { queued: true, delivered, eventId: next.event_id };
  }

  async flush(limit = 100): Promise<number> {
    if (this.flushing) return 0;
    this.flushing = true;
    try {
      const events = await this.queue.peek(limit);
      if (!events.length) return 0;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.request(`${this.options.endpoint.replace(/\/$/, "")}/events`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.options.token}`,
            "content-type": "application/json",
            "user-agent": `atlas-sdk/${ATLAS_SDK_VERSION}`,
          },
          body: JSON.stringify({ events }),
          signal: controller.signal,
        });
        if (!response.ok) return 0;
        await this.queue.remove(events.map((event) => event.event_id));
        return events.length;
      } catch {
        return 0;
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      this.flushing = false;
    }
  }

  async startSession(sessionId: string) {
    await this.emit({ event: "session.started", sessionId, status: "online" });
    return new AtlasSession(this, sessionId);
  }

  startHeartbeat(sessionId: string, intervalMs = 30_000) {
    const timer = setInterval(() => {
      void this.emit({ event: "session.heartbeat", sessionId });
    }, Math.max(10_000, intervalMs));
    timer.unref?.();
    return () => clearInterval(timer);
  }
}

export class AtlasSession {
  constructor(private readonly client: AtlasClient, readonly id: string) {}

  working(activity: AtlasActivity = "working", topic?: AtlasTopic) {
    return this.client.emit({ event: "status.changed", sessionId: this.id, status: "working", activity, topic });
  }

  online() {
    return this.client.emit({ event: "status.changed", sessionId: this.id, status: "online" });
  }

  idle() {
    return this.client.emit({ event: "status.changed", sessionId: this.id, status: "idle", activity: "idle" });
  }

  setTopic(topic: AtlasTopic) {
    return this.client.emit({ event: "topic.changed", sessionId: this.id, topic });
  }

  setActivity(activity: AtlasActivity) {
    return this.client.emit({ event: "activity.changed", sessionId: this.id, activity });
  }

  heartbeat() {
    return this.client.emit({ event: "session.heartbeat", sessionId: this.id });
  }

  end() {
    return this.client.emit({ event: "session.ended", sessionId: this.id, status: "offline", activity: "idle" });
  }
}

export function createAtlasAgent(options: AtlasClientOptions) {
  return new AtlasClient(options);
}

export type { AtlasEvent };
