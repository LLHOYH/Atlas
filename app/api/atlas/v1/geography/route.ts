import { geoArea } from "d3-geo";
import { NextResponse } from "next/server";

const GEOGRAPHY_LEVELS = new Set(["ADM1", "ADM2", "ADM3", "ADM4", "ADM5", "LOCAL"]);
const GEOBOUNDARIES_API = "https://www.geoboundaries.org/api/current/gbOpen";
const GEOBOUNDARIES_REVISION = "5c25134028196d43ce97b5071934fd0cfc92f09f";
const GEOBOUNDARIES_MEDIA = `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/${GEOBOUNDARIES_REVISION}/releaseData/gbOpen`;
const LOCAL_BOUNDARY_LEVELS = ["ADM3", "ADM2", "ADM1"] as const;

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

function pinnedGeometryUrl(iso: string, level: string) {
  return `${GEOBOUNDARIES_MEDIA}/${iso}/${level}/geoBoundaries-${iso}-${level}_simplified.geojson`;
}

async function findBoundaryGeometry(iso: string, requestedLevel: string) {
  const candidates = requestedLevel === "LOCAL" ? LOCAL_BOUNDARY_LEVELS : [requestedLevel];
  for (const level of candidates) {
    const metadataUrl = `${GEOBOUNDARIES_API}/${iso}/${level}/`;
    const geometryUrl = pinnedGeometryUrl(iso, level);
    const response = await fetch(geometryUrl, {
      headers: { Accept: "application/geo+json, application/json" },
    });
    if (!response.ok) continue;
    return {
      level,
      metadataUrl,
      geometryUrl,
      collection: await response.json() as BoundaryCollection,
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
    const resolved = await findBoundaryGeometry(iso, level);
    if (!resolved) return unavailable(iso, level, "No open administrative boundary is published for this level.");
    const { level: resolvedLevel, metadataUrl, geometryUrl, collection } = resolved;
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
        canonical: `geoBoundaries gbOpen ${iso} ${resolvedLevel}`,
        license: "CC BY 4.0",
        originalSource: "geoBoundaries gbOpen",
        yearRepresented: null,
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
