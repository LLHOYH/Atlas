import { createClient } from "npm:@supabase/supabase-js@2";
import { sanitizeAtlasEventBatch } from "../../../packages/sdk/src/protocol.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json",
};
const MAX_BODY_BYTES = 96 * 1024;
const MAX_DEVICE_BODY_BYTES = 16 * 1024;
const DEVICE_CODE_TTL_SECONDS = 10 * 60;
const DEVICE_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_ATLAS_SITE_URL = "https://project-atlas-living-world.llhoyh01.chatgpt.site";
const supportedRuntimes = ["codex", "claude-code", "hermes", "openclaw", "custom"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function bearer(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `atlas_live_${encoded}`;
}

function randomDeviceCode() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `atlas_device_${encoded}`;
}

function randomUserCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

function normalizeUserCode(value: unknown) {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : null;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function smallJson(request: Request) {
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_DEVICE_BODY_BYTES) throw new Error("Atlas device request is too large");
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function authenticatedUser(request: Request) {
  const accessToken = bearer(request);
  if (!accessToken) return null;
  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);
  return error ? null : data.user;
}

async function registerInstallation(request: Request) {
  const accessToken = bearer(request);
  if (!accessToken) return json({ error: "Authentication required" }, 401);
  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData.user) return json({ error: "Invalid user session" }, 401);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const displayName = typeof body?.display_name === "string" ? body.display_name.trim() : "";
  const runtime = typeof body?.runtime === "string" ? body.runtime : "";
  const runtimeVersion = typeof body?.runtime_version === "string" ? body.runtime_version.trim() : "unknown";
  const cityId = typeof body?.city_id === "string" ? body.city_id.trim() : "";
  if (!displayName || displayName.length > 80
    || !["codex", "claude-code", "hermes", "openclaw", "custom"].includes(runtime)
    || runtimeVersion.length > 40
    || !/^[a-z0-9-]{2,80}$/.test(cityId)) {
    return json({ error: "Invalid Atlas installation details" }, 400);
  }
  const { data: city } = await admin.from("atlas_cities").select("id").eq("id", cityId).maybeSingle();
  if (!city) return json({ error: "Unknown Atlas city" }, 400);

  const token = randomToken();
  const agentId = `live-${crypto.randomUUID()}`;
  const { data, error } = await admin.from("atlas_agent_installations").insert({
    owner_id: userData.user.id,
    agent_id: agentId,
    display_name: displayName,
    runtime,
    runtime_version: runtimeVersion || "unknown",
    sdk_version: "0.1.0",
    city_id: cityId,
    token_hash: await sha256(token),
  }).select("id, agent_id").single();
  if (error || !data) return json({ error: error?.message ?? "Atlas registration failed" }, 409);
  return json({ installation_id: data.id, agent_id: data.agent_id, token }, 201);
}

async function startDeviceAuthorization(request: Request) {
  const body = await smallJson(request).catch(() => null);
  const displayName = typeof body?.display_name === "string" ? body.display_name.trim() : "";
  const runtime = typeof body?.runtime === "string" ? body.runtime : "";
  const runtimeVersion = typeof body?.runtime_version === "string" ? body.runtime_version.trim() : "unknown";
  const sdkVersion = typeof body?.sdk_version === "string" ? body.sdk_version.trim() : "0.1.0";
  const codeChallenge = typeof body?.code_challenge === "string" ? body.code_challenge : "";
  const installationTokenHash = typeof body?.installation_token_hash === "string" ? body.installation_token_hash : "";
  if (!displayName || displayName.length > 80
    || !supportedRuntimes.includes(runtime)
    || !runtimeVersion || runtimeVersion.length > 40
    || !sdkVersion || sdkVersion.length > 40
    || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
    || !/^[a-f0-9]{64}$/.test(installationTokenHash)) {
    return json({ error: "Invalid Atlas device registration details" }, 400);
  }

  await admin.rpc("atlas_expire_device_authorizations");
  let deviceCode = "";
  let userCode = "";
  let inserted = false;
  for (let attempt = 0; attempt < 4 && !inserted; attempt += 1) {
    deviceCode = randomDeviceCode();
    userCode = randomUserCode();
    const { error } = await admin.from("atlas_device_authorizations").insert({
      device_code_hash: await sha256(deviceCode),
      user_code: userCode,
      code_challenge: codeChallenge,
      installation_token_hash: installationTokenHash,
      display_name: displayName,
      runtime,
      runtime_version: runtimeVersion,
      sdk_version: sdkVersion,
    });
    if (!error) inserted = true;
    else if (error.code !== "23505") return json({ error: "Atlas could not start device authorization" }, 500);
  }
  if (!inserted) return json({ error: "Atlas could not allocate a device code" }, 503);

  const siteUrl = (Deno.env.get("ATLAS_SITE_URL") ?? DEFAULT_ATLAS_SITE_URL).replace(/\/$/, "");
  const verificationUri = `${siteUrl}/connect`;
  return json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
    expires_in: DEVICE_CODE_TTL_SECONDS,
    interval: DEVICE_POLL_INTERVAL_SECONDS,
  }, 201);
}

async function verifyDeviceAuthorization(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return json({ error: "Authentication required" }, 401);
  const body = await smallJson(request).catch(() => null);
  const userCode = normalizeUserCode(body?.user_code);
  if (!userCode) return json({ error: "Invalid Atlas device code" }, 400);

  const { data } = await admin.from("atlas_device_authorizations")
    .select("state, owner_id, display_name, runtime, runtime_version, expires_at, city_id")
    .eq("user_code", userCode).maybeSingle();
  if (!data) return json({ error: "Atlas device code was not found" }, 404);
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await admin.from("atlas_device_authorizations").update({ state: "expired" }).eq("user_code", userCode).eq("state", "pending");
    return json({ error: "Atlas device code has expired" }, 410);
  }
  if (["denied", "expired"].includes(data.state) || (data.owner_id && data.owner_id !== user.id)) {
    return json({ error: "Atlas device authorization is no longer available" }, 409);
  }
  return json({
    user_code: userCode,
    display_name: data.display_name,
    runtime: data.runtime,
    runtime_version: data.runtime_version,
    expires_at: data.expires_at,
    state: data.state,
    city_id: data.city_id,
  });
}

async function approveDeviceAuthorization(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return json({ error: "Authentication required" }, 401);
  const body = await smallJson(request).catch(() => null);
  const userCode = normalizeUserCode(body?.user_code);
  const cityId = typeof body?.city_id === "string" ? body.city_id.trim() : "";
  if (!userCode || !/^[a-z0-9-]{2,80}$/.test(cityId)) return json({ error: "Invalid Atlas device approval" }, 400);

  const { data, error } = await admin.rpc("atlas_approve_device_authorization", {
    p_owner_id: user.id,
    p_user_code: userCode,
    p_city_id: cityId,
  });
  if (error) {
    const status = error.code === "P0002" ? 404 : error.code === "42501" ? 409 : 400;
    return json({ error: status === 404 ? "Atlas device code was not found" : status === 409 ? "Atlas device code is already linked" : "Atlas device approval is invalid or expired" }, status);
  }
  return json({ status: "approved", installation: data });
}

async function denyDeviceAuthorization(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return json({ error: "Authentication required" }, 401);
  const body = await smallJson(request).catch(() => null);
  const userCode = normalizeUserCode(body?.user_code);
  if (!userCode) return json({ error: "Invalid Atlas device code" }, 400);
  const { data } = await admin.from("atlas_device_authorizations")
    .update({ state: "denied", owner_id: user.id })
    .eq("user_code", userCode).eq("state", "pending").gt("expires_at", new Date().toISOString())
    .select("id").maybeSingle();
  if (!data) return json({ error: "Atlas device authorization is no longer available" }, 409);
  return json({ status: "denied" });
}

async function pollDeviceAuthorization(request: Request) {
  const body = await smallJson(request).catch(() => null);
  const deviceCode = typeof body?.device_code === "string" ? body.device_code : "";
  const codeVerifier = typeof body?.code_verifier === "string" ? body.code_verifier : "";
  if (!/^atlas_device_[A-Za-z0-9_-]{43}$/.test(deviceCode) || !/^[A-Za-z0-9_-]{43,128}$/.test(codeVerifier)) {
    return json({ error: "invalid_request" }, 400);
  }
  const { data } = await admin.from("atlas_device_authorizations")
    .select("id, state, code_challenge, installation_id, expires_at")
    .eq("device_code_hash", await sha256(deviceCode)).maybeSingle();
  if (!data || !safeEqual(data.code_challenge, await sha256Base64Url(codeVerifier))) {
    return json({ error: "invalid_device_code" }, 401);
  }
  if (new Date(data.expires_at).getTime() <= Date.now() || data.state === "expired") {
    await admin.from("atlas_device_authorizations").update({ state: "expired" }).eq("id", data.id).eq("state", "pending");
    return json({ error: "expired_token" }, 410);
  }
  if (data.state === "denied") return json({ error: "access_denied" }, 403);
  if (data.state === "pending" || !data.installation_id) {
    return json({ status: "authorization_pending", interval: DEVICE_POLL_INTERVAL_SECONDS }, 202);
  }

  const { data: installation } = await admin.from("atlas_agent_installations")
    .select("id, agent_id, display_name, runtime, runtime_version, city_id")
    .eq("id", data.installation_id).single();
  if (!installation) return json({ status: "authorization_pending", interval: DEVICE_POLL_INTERVAL_SECONDS }, 202);
  await admin.from("atlas_device_authorizations").update({ state: "consumed", consumed_at: new Date().toISOString() }).eq("id", data.id).eq("state", "approved");
  return json({ status: "approved", installation });
}

async function ingestEvents(request: Request) {
  const token = bearer(request);
  if (!token?.startsWith("atlas_live_")) return json({ error: "Invalid Atlas installation token" }, 401);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) return json({ error: "Atlas event batch is too large" }, 413);
  const body = (() => {
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as { events?: unknown };
    } catch {
      return null;
    }
  })();
  let events;
  try {
    events = sanitizeAtlasEventBatch(body?.events);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid Atlas events" }, 400);
  }
  const { data, error } = await admin.rpc("atlas_ingest_agent_events", {
    p_token_hash: await sha256(token),
    p_events: events,
  });
  if (error) return json({ error: error.code === "28000" ? "Invalid Atlas installation token" : "Atlas ingestion failed" }, error.code === "28000" ? 401 : 400);
  return json({ accepted: Number(data?.accepted ?? events.length) }, 202);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const pathname = new URL(request.url).pathname.replace(/\/$/, "");
  if (pathname.endsWith("/device/code")) return startDeviceAuthorization(request);
  if (pathname.endsWith("/device/verify")) return verifyDeviceAuthorization(request);
  if (pathname.endsWith("/device/approve")) return approveDeviceAuthorization(request);
  if (pathname.endsWith("/device/deny")) return denyDeviceAuthorization(request);
  if (pathname.endsWith("/device/token")) return pollDeviceAuthorization(request);
  const action = pathname.split("/").filter(Boolean).at(-1);
  if (action === "installations") return registerInstallation(request);
  if (action === "events") return ingestEvents(request);
  return json({ error: "Unknown Atlas ingestion route" }, 404);
});
