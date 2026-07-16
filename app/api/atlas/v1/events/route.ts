import { NextResponse } from "next/server";
import { bearerToken, getAtlasApiClient, hashInstallationToken } from "@/lib/atlas/ingestion";
import { sanitizeAtlasEventBatch } from "@/packages/sdk/src/protocol";

const MAX_BODY_BYTES = 96 * 1024;

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token?.startsWith("atlas_live_")) {
    return NextResponse.json({ error: "Invalid Atlas installation token" }, { status: 401 });
  }

  let events;
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Atlas event batch is too large" }, { status: 413 });
    }
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { events?: unknown };
    events = sanitizeAtlasEventBatch(body.events);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Atlas events" }, { status: 400 });
  }

  const client = getAtlasApiClient();
  if (!client) return NextResponse.json({ error: "Atlas database is not configured" }, { status: 503 });
  const { data, error } = await client.rpc("atlas_ingest_agent_events", {
    p_token_hash: hashInstallationToken(token),
    p_events: events,
  });
  if (error) {
    const unauthorized = error.code === "28000";
    return NextResponse.json({ error: unauthorized ? "Invalid Atlas installation token" : "Atlas ingestion failed" }, { status: unauthorized ? 401 : 400 });
  }
  const accepted = typeof data === "object" && data && "accepted" in data ? Number(data.accepted) : events.length;
  return NextResponse.json({ accepted }, { status: 202 });
}
