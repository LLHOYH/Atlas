import { geoContains } from "d3-geo";
import { NextResponse } from "next/server";

const TIGERWEB_SERVICE = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer";
const TIGERWEB_LAYERS = [4, 5] as const;
const MAX_PLACES = 100;

type RequestedPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  population?: number;
  rank?: number;
};

type TigerProperties = {
  BASENAME?: string;
  NAME?: string;
  STATE?: string;
  GEOID?: string;
  INTPTLAT?: string;
  INTPTLON?: string;
  [key: string]: unknown;
};

type TigerFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, TigerProperties>;

const cacheHeaders = {
  "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
};

function reverseRingOrientation(feature: TigerFeature): TigerFeature {
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
  return { ...feature, geometry } as TigerFeature;
}

function planarRingCentroid(ring: GeoJSON.Position[]) {
  let signedArea = 0;
  let longitude = 0;
  let latitude = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = ring[index];
    const end = ring[index + 1];
    const cross = start[0] * end[1] - end[0] * start[1];
    signedArea += cross;
    longitude += (start[0] + end[0]) * cross;
    latitude += (start[1] + end[1]) * cross;
  }
  if (Math.abs(signedArea) < Number.EPSILON) return null;
  return [longitude / (3 * signedArea), latitude / (3 * signedArea)] as [number, number];
}

function labelCenter(feature: TigerFeature, place: RequestedPlace) {
  const polygons = feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
  const containingPolygon = polygons.find((coordinates) => geoContains({
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates },
  }, [place.lng, place.lat]));
  const centroid = containingPolygon ? planarRingCentroid(containingPolygon[0]) : null;
  if (centroid && geoContains(feature, centroid)) return { lat: centroid[1], lng: centroid[0] };
  return { lat: place.lat, lng: place.lng };
}

async function queryLayer(
  service: string,
  layer: number,
  places: RequestedPlace[],
  maxAllowableOffset: string,
) {
  const parameters = new URLSearchParams({
    geometry: JSON.stringify({
      points: places.map((place) => [place.lng, place.lat]),
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryMultipoint",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    outFields: "BASENAME,NAME,STATE,GEOID,INTPTLAT,INTPTLON",
    outSR: "4326",
    returnGeometry: "true",
    geometryPrecision: "5",
    maxAllowableOffset,
    f: "geojson",
  });
  const response = await fetch(`${service}/${layer}/query`, {
    method: "POST",
    headers: {
      Accept: "application/geo+json, application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: parameters,
  });
  if (!response.ok) throw new Error(`TIGERweb layer ${layer} returned ${response.status}`);
  const collection = await response.json() as GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    TigerProperties
  >;
  return Array.isArray(collection.features) ? collection.features : [];
}

export async function POST(request: Request) {
  let body: { iso3?: unknown; places?: unknown };
  try {
    body = await request.json() as { iso3?: unknown; places?: unknown };
  } catch {
    return NextResponse.json({ error: "A JSON request body is required." }, { status: 400 });
  }

  const iso3 = typeof body.iso3 === "string" ? body.iso3.toUpperCase() : "";
  if (iso3 !== "USA") {
    return NextResponse.json({
      available: false,
      iso3,
      source: null,
      type: "FeatureCollection",
      features: [],
    }, { headers: cacheHeaders });
  }

  const places = Array.isArray(body.places)
    ? body.places
      .slice(0, MAX_PLACES)
      .filter((place): place is RequestedPlace => (
        typeof place === "object"
        && place !== null
        && typeof place.id === "string"
        && typeof place.name === "string"
        && Number.isFinite(place.lat)
        && Number.isFinite(place.lng)
        && place.lat >= -90
        && place.lat <= 90
        && place.lng >= -180
        && place.lng <= 180
      ))
    : [];

  if (!places.length) {
    return NextResponse.json({ error: "places must contain at least one valid location." }, { status: 400 });
  }

  try {
    const layerResults = await Promise.all(
      TIGERWEB_LAYERS.map((layer) => queryLayer(TIGERWEB_SERVICE, layer, places, "0.002")),
    );
    const seenGeoids = new Set<string>();
    const features = layerResults
      .flat()
      .map(reverseRingOrientation)
      .flatMap((feature) => {
        const place = places.find((candidate) => geoContains(feature, [candidate.lng, candidate.lat]));
        const geoid = String(feature.properties?.GEOID ?? "");
        if (!place || !geoid || seenGeoids.has(geoid)) return [];
        seenGeoids.add(geoid);
        const center = labelCenter(feature, place);
        return [{
          ...feature,
          properties: {
            ...feature.properties,
            shapeName: place.name,
            shapeID: geoid,
            shapeGroup: "USA",
            shapeType: "CITY",
            atlasPlaceId: place.id,
            atlasName: place.name,
            atlasLat: center.lat,
            atlasLng: center.lng,
            atlasPopulation: place.population ?? 0,
            atlasRank: place.rank ?? 6,
          },
        }];
      });
    return NextResponse.json({
      available: features.length > 0,
      iso3,
      source: {
        name: "U.S. Census Bureau TIGERweb",
        serviceUrl: TIGERWEB_SERVICE,
        layers: ["Incorporated Places", "Census Designated Places"],
      },
      type: "FeatureCollection",
      features,
    }, { headers: cacheHeaders });
  } catch {
    return NextResponse.json({ error: "Atlas could not reach the municipal-boundary source." }, { status: 502 });
  }
}
