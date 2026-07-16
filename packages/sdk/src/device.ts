import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import process from "node:process";
import { ATLAS_SDK_VERSION, type AtlasActivity, type AtlasTopic } from "./protocol.js";
import type { AtlasRuntime } from "./adapters.js";

export const DEFAULT_ATLAS_ENDPOINT = "https://zobmelejpoedfjqnvgjm.supabase.co/functions/v1/atlas-ingest";

export type AtlasDeviceSetupOptions = {
  endpoint?: string;
  displayName: string;
  runtime: AtlasRuntime;
  runtimeVersion?: string;
  topic?: AtlasTopic;
  activity?: AtlasActivity;
  fetch?: typeof fetch;
};

export type AtlasDeviceAuthorization = {
  endpoint: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
  codeVerifier: string;
  installationToken: string;
  runtime: AtlasRuntime;
  runtimeVersion: string;
  defaultTopic: AtlasTopic;
  defaultActivity: AtlasActivity;
};

export type AtlasApprovedInstallation = {
  id: string;
  agentId: string;
  displayName: string;
  runtime: string;
  runtimeVersion: string;
  cityId: string;
};

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Base64Url(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

async function responseJson(response: Response) {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

export function createDeviceSetupSecrets() {
  const codeVerifier = randomSecret();
  const installationToken = `atlas_live_${randomSecret()}`;
  return {
    codeVerifier,
    codeChallenge: sha256Base64Url(codeVerifier),
    installationToken,
    installationTokenHash: sha256Hex(installationToken),
  };
}

export async function startAtlasDeviceSetup(options: AtlasDeviceSetupOptions): Promise<AtlasDeviceAuthorization> {
  const endpoint = (options.endpoint ?? DEFAULT_ATLAS_ENDPOINT).replace(/\/$/, "");
  const request = options.fetch ?? fetch;
  const secrets = createDeviceSetupSecrets();
  const response = await request(`${endpoint}/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": `atlas-sdk/${ATLAS_SDK_VERSION}` },
    body: JSON.stringify({
      display_name: options.displayName,
      runtime: options.runtime,
      runtime_version: options.runtimeVersion ?? "unknown",
      sdk_version: ATLAS_SDK_VERSION,
      code_challenge: secrets.codeChallenge,
      installation_token_hash: secrets.installationTokenHash,
    }),
  });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Atlas device setup could not start");
  return {
    endpoint,
    deviceCode: String(body.device_code),
    userCode: String(body.user_code),
    verificationUri: String(body.verification_uri),
    verificationUriComplete: String(body.verification_uri_complete),
    expiresIn: Number(body.expires_in),
    interval: Number(body.interval),
    codeVerifier: secrets.codeVerifier,
    installationToken: secrets.installationToken,
    runtime: options.runtime,
    runtimeVersion: options.runtimeVersion ?? "unknown",
    defaultTopic: options.topic ?? "other",
    defaultActivity: options.activity ?? "working",
  };
}

export async function pollAtlasDeviceSetup(
  authorization: AtlasDeviceAuthorization,
  options: { fetch?: typeof fetch; onPending?: () => void } = {},
): Promise<AtlasApprovedInstallation> {
  const request = options.fetch ?? fetch;
  const deadline = Date.now() + authorization.expiresIn * 1_000;
  let interval = Math.max(2, authorization.interval) * 1_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const response = await request(`${authorization.endpoint}/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": `atlas-sdk/${ATLAS_SDK_VERSION}` },
      body: JSON.stringify({
        device_code: authorization.deviceCode,
        code_verifier: authorization.codeVerifier,
      }),
    });
    const body = await responseJson(response);
    if (response.status === 202 || body.status === "authorization_pending") {
      interval = Math.max(interval, Number(body.interval ?? authorization.interval) * 1_000);
      options.onPending?.();
      continue;
    }
    if (!response.ok || body.status !== "approved" || typeof body.installation !== "object" || !body.installation) {
      const error = typeof body.error === "string" ? body.error : "Atlas device authorization failed";
      throw new Error(error === "access_denied" ? "Atlas device authorization was denied" : error === "expired_token" ? "Atlas device code expired" : error);
    }
    const installation = body.installation as Record<string, unknown>;
    return {
      id: String(installation.id),
      agentId: String(installation.agent_id),
      displayName: String(installation.display_name),
      runtime: String(installation.runtime),
      runtimeVersion: String(installation.runtime_version),
      cityId: String(installation.city_id),
    };
  }
  throw new Error("Atlas device code expired");
}

export function openAtlasVerificationPage(url: string) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}
