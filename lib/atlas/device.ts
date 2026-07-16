export type AtlasDevicePreview = {
  user_code: string;
  display_name: string;
  runtime: string;
  runtime_version: string;
  expires_at: string;
  state: "pending" | "approved";
  city_id: string | null;
};

export type AtlasDeviceCity = {
  id: string;
  name: string;
  country: string;
};

export function atlasDeviceEndpoint() {
  const explicit = process.env.NEXT_PUBLIC_ATLAS_INGEST_ENDPOINT;
  if (explicit) return explicit.replace(/\/$/, "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/atlas-ingest`;
  return "/api/atlas/v1";
}

export function normalizeAtlasDeviceCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}
