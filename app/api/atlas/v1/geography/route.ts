import { NextResponse } from "next/server";

const GEOGRAPHY_LEVELS = new Set(["ADM1", "ADM2", "ADM3", "ADM4", "ADM5"]);
const GEOBOUNDARIES_API = "https://www.geoboundaries.org/api/current/gbOpen";

type GeoBoundariesMetadata = {
  boundaryCanonical?: string;
  boundaryLicense?: string;
  boundarySource?: string;
  boundaryYearRepresented?: string;
  gjDownloadURL?: string;
  simplifiedGeometryGeoJSON?: string;
};

type BoundaryCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

const cacheHeaders = {
  "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
};

function unavailable(iso: string, level: string, reason: string) {
  return NextResponse.json({
    available: false,
    iso,
    level,
    reason,
    type: "FeatureCollection",
    features: [],
  }, { headers: cacheHeaders });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const iso = (url.searchParams.get("iso") ?? "").toUpperCase();
  const level = (url.searchParams.get("level") ?? "").toUpperCase();

  if (!/^[A-Z]{3}$/.test(iso)) {
    return NextResponse.json({ error: "iso must be an ISO 3166-1 alpha-3 code" }, { status: 400 });
  }
  if (!GEOGRAPHY_LEVELS.has(level)) {
    return NextResponse.json({ error: "level must be ADM1, ADM2, ADM3, ADM4, or ADM5" }, { status: 400 });
  }

  try {
    const metadataUrl = `${GEOBOUNDARIES_API}/${iso}/${level}/`;
    const metadataResponse = await fetch(metadataUrl, { headers: { Accept: "application/json" } });
    if (!metadataResponse.ok) return unavailable(iso, level, "No open administrative boundary is published for this level.");

    const metadata = await metadataResponse.json() as GeoBoundariesMetadata;
    const geometryUrl = metadata.simplifiedGeometryGeoJSON ?? metadata.gjDownloadURL;
    if (!geometryUrl) return unavailable(iso, level, "The source did not provide a GeoJSON download.");

    const geometryResponse = await fetch(geometryUrl, { headers: { Accept: "application/geo+json, application/json" } });
    if (!geometryResponse.ok) return unavailable(iso, level, "The published boundary file is temporarily unavailable.");

    const collection = await geometryResponse.json() as BoundaryCollection;
    const features = Array.isArray(collection.features)
      ? collection.features.filter((feature) => feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon")
      : [];

    return NextResponse.json({
      available: features.length > 0,
      iso,
      level,
      source: {
        name: "geoBoundaries",
        metadataUrl,
        geometryUrl,
        canonical: metadata.boundaryCanonical ?? null,
        license: metadata.boundaryLicense ?? null,
        originalSource: metadata.boundarySource ?? null,
        yearRepresented: metadata.boundaryYearRepresented ?? null,
      },
      type: "FeatureCollection",
      features,
    }, { headers: cacheHeaders });
  } catch {
    return NextResponse.json({
      error: "Atlas could not reach the administrative-boundary source.",
    }, { status: 502 });
  }
}
