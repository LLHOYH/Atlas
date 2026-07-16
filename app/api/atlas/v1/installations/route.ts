import { NextResponse } from "next/server";
import {
  bearerToken,
  createAgentId,
  createInstallationToken,
  getAtlasApiClient,
  hashInstallationToken,
  supportedAtlasRuntimes,
} from "@/lib/atlas/ingestion";

export async function POST(request: Request) {
  const accessToken = bearerToken(request);
  if (!accessToken) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const client = getAtlasApiClient(accessToken);
  if (!client) return NextResponse.json({ error: "Atlas database is not configured" }, { status: 503 });

  const { data: userData, error: userError } = await client.auth.getUser(accessToken);
  if (userError || !userData.user) return NextResponse.json({ error: "Invalid user session" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  const runtime = typeof body.runtime === "string" ? body.runtime : "";
  const runtimeVersion = typeof body.runtime_version === "string" ? body.runtime_version.trim() : "unknown";
  const cityId = typeof body.city_id === "string" ? body.city_id.trim() : "";
  if (!displayName || displayName.length > 80
    || !supportedAtlasRuntimes.includes(runtime as (typeof supportedAtlasRuntimes)[number])
    || runtimeVersion.length > 40
    || !/^[a-z0-9-]{2,80}$/.test(cityId)) {
    return NextResponse.json({ error: "Invalid Atlas installation details" }, { status: 400 });
  }

  const { data: city } = await client.from("atlas_cities").select("id").eq("id", cityId).maybeSingle();
  if (!city) return NextResponse.json({ error: "Unknown Atlas city" }, { status: 400 });

  const token = createInstallationToken();
  const agentId = createAgentId();
  const { data, error } = await client.from("atlas_agent_installations").insert({
    owner_id: userData.user.id,
    agent_id: agentId,
    display_name: displayName,
    runtime,
    runtime_version: runtimeVersion || "unknown",
    sdk_version: "0.1.0",
    city_id: cityId,
    token_hash: hashInstallationToken(token),
  }).select("id, agent_id").single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Atlas registration failed" }, { status: 409 });
  }

  return NextResponse.json({
    installation_id: data.id,
    agent_id: data.agent_id,
    token,
  }, { status: 201 });
}
