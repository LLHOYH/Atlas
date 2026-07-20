import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceUrl = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer";
const countyLayer = 7;
const parameters = new URLSearchParams({
  where: "1=1",
  outFields: "BASENAME,NAME,STATE,GEOID",
  outSR: "4326",
  returnGeometry: "true",
  geometryPrecision: "3",
  maxAllowableOffset: "0.08",
  f: "geojson",
});

const response = await fetch(`${serviceUrl}/${countyLayer}/query`, {
  method: "POST",
  headers: {
    Accept: "application/geo+json, application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: parameters,
});
if (!response.ok) throw new Error(`TIGERweb counties returned ${response.status}`);
const collection = await response.json();
const reverseRings = (feature) => ({
  ...feature,
  geometry: feature.geometry.type === "Polygon"
    ? {
      ...feature.geometry,
      coordinates: feature.geometry.coordinates.map((ring) => [...ring].reverse()),
    }
    : {
      ...feature.geometry,
      coordinates: feature.geometry.coordinates.map((polygon) => (
        polygon.map((ring) => [...ring].reverse())
      )),
    },
  properties: {
    ...feature.properties,
    shapeName: feature.properties.NAME,
    shapeID: `county-${feature.properties.GEOID}`,
    shapeGroup: "USA",
    shapeType: "LOCAL_AREA",
  },
});
const features = (collection.features ?? [])
  .filter((feature) => feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon")
  .map(reverseRings);

const payload = {
  available: features.length > 0,
  iso: "USA",
  level: "LOCAL_AREA",
  source: {
    name: "U.S. Census Bureau TIGERweb",
    serviceUrl,
    layer: "Counties",
  },
  type: "FeatureCollection",
  features,
};
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, "../public/atlas-geography/boundaries");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "USA-local-areas.json"),
  `${JSON.stringify(payload)}\n`,
);
console.log(`Generated ${features.length.toLocaleString()} contiguous U.S. local-area borders.`);
