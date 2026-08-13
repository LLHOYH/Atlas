import type { AtlasClient, AtlasDelivery } from "./client.js";
import { draftsFromHook, type AtlasRuntime } from "./adapters.js";
import type { AtlasActivity, AtlasStatus, AtlasTopic } from "./protocol.js";

export type AtlasRuntimeBridgeOptions = {
  client: AtlasClient;
  runtime: AtlasRuntime;
  defaultSessionId?: string;
  defaultTopic?: AtlasTopic;
  defaultActivity?: AtlasActivity;
  heartbeatIntervalMs?: number;
};

export type AtlasHookResult = {
  handled: boolean;
  deliveries: AtlasDelivery[];
};

const MINIMUM_HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Maintains privacy-safe Atlas lifecycle state for a long-running agent host.
 * Raw hook payloads are translated immediately and are never queued or sent.
 */
export class AtlasRuntimeBridge {
  private readonly activeSessions = new Set<string>();
  private readonly defaultSessionId: string;
  private readonly heartbeatIntervalMs: number;
  private heartbeatTimer?: NodeJS.Timeout;
  private operations: Promise<void> = Promise.resolve();

  constructor(private readonly options: AtlasRuntimeBridgeOptions) {
    this.defaultSessionId = options.defaultSessionId ?? "default";
    const requestedHeartbeat = options.heartbeatIntervalMs ?? 30_000;
    this.heartbeatIntervalMs = Math.max(
      MINIMUM_HEARTBEAT_INTERVAL_MS,
      Number.isFinite(requestedHeartbeat) ? requestedHeartbeat : 30_000,
    );
  }

  get activeSessionCount() {
    return this.activeSessions.size;
  }

  start(sessionId = this.defaultSessionId) {
    return this.serialize(() => this.startInternal(sessionId));
  }

  handleHook(rawInput: unknown): Promise<AtlasHookResult> {
    const drafts = draftsFromHook(this.options.runtime, rawInput, {
      topic: this.options.defaultTopic,
      activity: this.options.defaultActivity,
    });
    return this.serialize(async () => {
      const deliveries: AtlasDelivery[] = [];
      for (const draft of drafts) {
        const sessionId = draft.sessionId ?? this.defaultSessionId;
        if (draft.event === "session.started") {
          if (!this.activeSessions.has(sessionId)) {
            deliveries.push(await this.emitStarted(sessionId));
          }
          continue;
        }
        if (!this.activeSessions.has(sessionId) && draft.event !== "session.ended") {
          deliveries.push(await this.emitStarted(sessionId));
        }
        deliveries.push(await this.options.client.emit({ ...draft, sessionId }));
        if (draft.event === "session.ended") this.activeSessions.delete(sessionId);
      }
      this.syncHeartbeatTimer();
      return { handled: drafts.length > 0, deliveries };
    });
  }

  heartbeat(sessionId?: string): Promise<AtlasDelivery[]> {
    return this.serialize(async () => {
      const sessionIds = sessionId ? [sessionId] : [...this.activeSessions];
      const deliveries: AtlasDelivery[] = [];
      for (const id of sessionIds) {
        if (!this.activeSessions.has(id)) deliveries.push(await this.emitStarted(id));
        deliveries.push(await this.options.client.emit({ event: "session.heartbeat", sessionId: id }));
      }
      return deliveries;
    });
  }

  setStatus(status: AtlasStatus, sessionId = this.defaultSessionId) {
    if (status === "offline") return this.stop(sessionId);
    return this.updateSession(sessionId, { event: "status.changed", status });
  }

  setTopic(topic: AtlasTopic, sessionId = this.defaultSessionId) {
    return this.updateSession(sessionId, { event: "topic.changed", topic });
  }

  setActivity(activity: AtlasActivity, sessionId = this.defaultSessionId) {
    return this.updateSession(sessionId, { event: "activity.changed", activity });
  }

  stop(sessionId?: string): Promise<AtlasDelivery[]> {
    return this.serialize(async () => {
      const sessionIds = sessionId ? [sessionId] : [...this.activeSessions];
      const deliveries: AtlasDelivery[] = [];
      for (const id of sessionIds) {
        if (!this.activeSessions.has(id)) continue;
        deliveries.push(await this.options.client.emit({
          event: "session.ended",
          sessionId: id,
          status: "offline",
          activity: "idle",
        }));
        this.activeSessions.delete(id);
      }
      this.syncHeartbeatTimer();
      return deliveries;
    });
  }

  private updateSession(
    sessionId: string,
    draft: Parameters<AtlasClient["emit"]>[0],
  ): Promise<AtlasDelivery[]> {
    return this.serialize(async () => {
      const deliveries: AtlasDelivery[] = [];
      if (!this.activeSessions.has(sessionId)) deliveries.push(await this.emitStarted(sessionId));
      deliveries.push(await this.options.client.emit({ ...draft, sessionId }));
      return deliveries;
    });
  }

  private async startInternal(sessionId: string): Promise<AtlasDelivery[]> {
    if (this.activeSessions.has(sessionId)) return [];
    return [await this.emitStarted(sessionId)];
  }

  private async emitStarted(sessionId: string) {
    const delivery = await this.options.client.emit({
      event: "session.started",
      sessionId,
      status: "online",
      activity: this.options.defaultActivity ?? "working",
      topic: this.options.defaultTopic ?? "other",
    });
    this.activeSessions.add(sessionId);
    this.syncHeartbeatTimer();
    return delivery;
  }

  private syncHeartbeatTimer() {
    if (this.activeSessions.size > 0 && !this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        void this.heartbeat();
      }, this.heartbeatIntervalMs);
      this.heartbeatTimer.unref?.();
    } else if (this.activeSessions.size === 0 && this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }
}

export function createAtlasRuntimeBridge(options: AtlasRuntimeBridgeOptions) {
  return new AtlasRuntimeBridge(options);
}
