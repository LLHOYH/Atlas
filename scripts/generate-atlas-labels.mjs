import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const naturalEarthRevision = "ca96624a56bd078437bca8184e78163e5039ad19";
const sourceRoot = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${naturalEarthRevision}/geojson`;
const datasets = {
  countries: `${sourceRoot}/ne_110m_admin_0_countries.geojson`,
  regions: `${sourceRoot}/ne_50m_admin_1_states_provinces.geojson`,
  cities: `${sourceRoot}/ne_110m_populated_places_simple.geojson`,
};

const countryLabelOverrides = new Map([
  // Natural Earth's default point favors European Russia instead of the country's full landmass.
  ["RUS", { lat: 66.0678, lng: 95.7853 }],
]);

async function readGeoJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url}: ${response.status}`);
  return response.json();
}

function rounded(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

function validCoordinate(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

const [countryGeoJson, regionGeoJson, cityGeoJson] = await Promise.all([
  readGeoJson(datasets.countries),
  readGeoJson(datasets.regions),
  readGeoJson(datasets.cities),
]);

const countries = countryGeoJson.features
  .map(({ properties }) => {
    const id = String(properties.ADM0_A3 ?? properties.NE_ID);
    const labelOverride = countryLabelOverrides.get(id);
    return {
      id,
      name: String(properties.NAME_EN ?? properties.NAME),
      lat: labelOverride?.lat ?? rounded(properties.LABEL_Y),
      lng: labelOverride?.lng ?? rounded(properties.LABEL_X),
      rank: Number(properties.LABELRANK ?? 9),
    };
  })
  .filter((label) => label.name !== "Antarctica" && validCoordinate(label.lat, label.lng))
  .sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name));

const regions = regionGeoJson.features
  .map(({ properties }) => ({
    id: String(properties.adm1_code ?? properties.ne_id),
    name: String(properties.name_en ?? properties.name),
    country: String(properties.admin ?? ""),
    lat: rounded(properties.latitude),
    lng: rounded(properties.longitude),
    rank: Number(properties.labelrank ?? 9),
  }))
  .filter((label) => label.name && validCoordinate(label.lat, label.lng))
  .sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name));

const cities = cityGeoJson.features
  .map(({ geometry, properties }) => ({
    id: String(properties.ne_id),
    name: String(properties.name ?? properties.nameascii),
    country: String(properties.adm0name ?? ""),
    region: String(properties.adm1name ?? ""),
    lat: rounded(geometry.coordinates[1]),
    lng: rounded(geometry.coordinates[0]),
    rank: Number(properties.labelrank ?? 9),
    population: Number(properties.pop_max ?? 0),
  }))
  .filter((label) => label.name && validCoordinate(label.lat, label.lng))
  .sort((left, right) => left.rank - right.rank || right.population - left.population || left.name.localeCompare(right.name));

const output = {
  source: {
    name: "Natural Earth",
    revision: naturalEarthRevision,
    license: "Public domain",
    datasets,
  },
  countries,
  regions,
  cities,
};

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(currentDirectory, "../app/atlas-label-data.json");
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated ${countries.length} countries, ${regions.length} regions, and ${cities.length} cities.`);
