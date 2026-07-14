import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topology = require("world-atlas/countries-110m.json");
const collection = feature(topology, topology.objects.countries);
const countries = collection.features.flatMap((country) => {
  const geometry = country.geometry;
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return [];
  const sourcePolygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const polygons = sourcePolygons.map((polygon) => polygon.map((ring) => (
    ring.flatMap(([lng, lat]) => [Number(lng.toFixed(4)), Number(lat.toFixed(4))])
  )));
  return [{
    name: country.properties?.name ?? String(country.id ?? "land"),
    polygons,
  }];
});

const output = new URL("../app/atlas-geo-data.json", import.meta.url);
await writeFile(output, `${JSON.stringify({ countries })}\n`, "utf8");
console.log(`Generated ${countries.length} country silhouettes.`);
