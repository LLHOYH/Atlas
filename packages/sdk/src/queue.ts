import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AtlasEvent } from "./protocol.js";
import { sanitizeAtlasEvent } from "./protocol.js";

export interface AtlasEventQueue {
  enqueue(event: AtlasEvent): Promise<void>;
  peek(limit: number): Promise<AtlasEvent[]>;
  remove(eventIds: string[]): Promise<void>;
  size(): Promise<number>;
}

export class FileEventQueue implements AtlasEventQueue {
  constructor(private readonly directory: string) {}

  private async ensureDirectory() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  async enqueue(event: AtlasEvent) {
    await this.ensureDirectory();
    const safeName = event.event_id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const destination = join(this.directory, `${safeName}.json`);
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, destination);
  }

  async peek(limit: number) {
    await this.ensureDirectory();
    const names = (await readdir(this.directory))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .slice(0, Math.max(0, limit));
    const events: AtlasEvent[] = [];
    for (const name of names) {
      try {
        const value = JSON.parse(await readFile(join(this.directory, name), "utf8"));
        events.push(sanitizeAtlasEvent(value));
      } catch {
        await rm(join(this.directory, name), { force: true });
      }
    }
    return events;
  }

  async remove(eventIds: string[]) {
    await Promise.all(eventIds.map((eventId) => {
      const safeName = eventId.replace(/[^a-zA-Z0-9_-]/g, "_");
      return rm(join(this.directory, `${safeName}.json`), { force: true });
    }));
  }

  async size() {
    await this.ensureDirectory();
    return (await readdir(this.directory)).filter((name) => name.endsWith(".json")).length;
  }
}
