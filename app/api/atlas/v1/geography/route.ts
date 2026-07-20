import { geoArea } from "d3-geo";
import { NextResponse } from "next/server";

const GEOGRAPHY_LEVELS = new Set(["ADM1", "ADM2", "ADM3", "ADM4", "ADM5", "LOCAL"]);
const GEOBOUNDARIES_API = "https://www.geoboundaries.org/api/current/gbOpen";
const LOCAL_BOUNDARY_LEVELS = ["ADM3", "ADM2", "ADM1"] as const;

type GeoBoundariesMetadata = {
  boundaryCanonical?: string;
  boundaryLicense?: string;
  boundarySource?: string;
  boundaryYearRepresented?: string;
  gjDownloadURL?: string;
  simplifiedGeometryGeoJSON?: string;
};

type BoundaryCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
type BoundaryFeature = BoundaryCollection["features"][number];

const cacheHeaders = {
  "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
};

function normalizeBoundaryOrientation(feature: BoundaryFeature): BoundaryFeature {
  if (geoArea(feature) <= Math.PI * 2) return feature;
  const geometry = feature.geometry.type === "Polygon"
    ? {
      ...feature.geometry,
      coordinates: feature.geometry.coordinates.map((ring) => [...ring].reverse()),
    }
    : {
      ...feature.geometry,
      coordinates: feature.geometry.coordinates.map((polygon) => (
        polygon.map((ring) => [...ring].reverse())
      )),
    };
  return { ...feature, geometry } as BoundaryFeature;
}

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

async function findBoundaryMetadata(iso: string, requestedLevel: string) {
  const candidates = requestedLevel === "LOCAL" ? LOCAL_BOUNDARY_LEVELS : [requestedLevel];
  for (const level of candidates) {
    const metadataUrl = `${GEOBOUNDARIES_API}/${iso}/${level}/`;
    const response = await fetch(metadataUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) continue;
    return {
      level,
      metadataUrl,
      metadata: await response.json() as GeoBoundariesMetadata,
    };
  }
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const iso = (url.searchParams.get("iso") ?? "").toUpperCase();
  const level = (url.searchParams.get("level") ?? "").toUpperCase();

  if (!/^[A-Z]{3}$/.test(iso)) {
    return NextResponse.json({ error: "iso must be an ISO 3166-1 alpha-3 code" }, { status: 400 });
  }
  if (!GEOGRAPHY_LEVELS.has(level)) {
    return NextResponse.json({ error: "level must be ADM1, ADM2, ADM3, ADM4, ADM5, or LOCAL" }, { status: 400 });
  }

  try {
    const resolved = await findBoundaryMetadata(iso, level);
    if (!resolved) return unavailable(iso, level, "No open administrative boundary is published for this level.");
    const { level: resolvedLevel, metadataUrl, metadata } = resolved;
    const geometryUrl = metadata.simplifiedGeometryGeoJSON ?? metadata.gjDownloadURL;
    if (!geometryUrl) return unavailable(iso, level, "The source did not provide a GeoJSON download.");

    const geometryResponse = await fetch(geometryUrl, { headers: { Accept: "application/geo+json, application/json" } });
    if (!geometryResponse.ok) return unavailable(iso, level, "The published boundary file is temporarily unavailable.");

    const collection = await geometryResponse.json() as BoundaryCollection;
    const features = Array.isArray(collection.features)
      ? collection.features
        .filter((feature) => feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon")
        .map(normalizeBoundaryOrientation)
      : [];

    return NextResponse.json({
      available: features.length > 0,
      iso,
      level: resolvedLevel,
      requestedLevel: level,
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
