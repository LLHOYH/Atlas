import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { AtlasActivity, AtlasTopic } from "./protocol.js";

export type AtlasLocalConfig = {
  endpoint: string;
  token: string;
  installationId: string;
  agentId: string;
  runtime: string;
  runtimeVersion: string;
  defaultTopic: AtlasTopic;
  defaultActivity: AtlasActivity;
};

export function atlasHome() {
  return process.env.ATLAS_HOME ?? join(homedir(), ".atlas");
}

export function atlasConfigPath() {
  return process.env.ATLAS_CONFIG ?? join(atlasHome(), "config.json");
}

export function atlasQueuePath() {
  return process.env.ATLAS_QUEUE ?? join(atlasHome(), "queue");
}

export async function readAtlasConfig(path = atlasConfigPath()): Promise<AtlasLocalConfig | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as AtlasLocalConfig;
  } catch {
    return null;
  }
}

export async function writeAtlasConfig(config: AtlasLocalConfig, path = atlasConfigPath()) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}
