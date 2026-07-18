import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";

const source = {
  name: "GeoNames",
  placesUrl: "https://download.geonames.org/export/dump/cities500.zip",
  countryInfoUrl: "https://download.geonames.org/export/dump/countryInfo.txt",
  license: "CC BY 4.0",
  attributionUrl: "https://www.geonames.org/",
};

async function download(url) {
  const response = await fetch(url, { headers: { "user-agent": "Project Atlas geography builder" } });
  if (!response.ok) throw new Error(`Could not download ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function parseCountryCodes(text) {
  return new Map(text
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const columns = line.split("\t");
      return [columns[0], columns[1]];
    })
    .filter(([iso2, iso3]) => iso2 && iso3));
}

function placeRank(population, featureCode) {
  if (featureCode === "PPLC" || population >= 1_000_000) return 1;
  if (featureCode.startsWith("PPLA") || population >= 250_000) return 2;
  if (population >= 50_000) return 3;
  if (population >= 10_000) return 4;
  if (population >= 1_000) return 5;
  return 6;
}

const [placesArchive, countryInfoBytes] = await Promise.all([
  download(source.placesUrl),
  download(source.countryInfoUrl),
]);
const countryCodes = parseCountryCodes(strFromU8(countryInfoBytes));
const archive = unzipSync(placesArchive);
const placesEntry = Object.entries(archive).find(([name]) => name.endsWith("cities500.txt"));
if (!placesEntry) throw new Error("GeoNames archive did not contain cities500.txt");

const placesByCountry = new Map();
for (const line of strFromU8(placesEntry[1]).split("\n")) {
  if (!line) continue;
  const columns = line.split("\t");
  const iso3 = countryCodes.get(columns[8]);
  if (!iso3 || columns[6] !== "P") continue;
  const population = Number(columns[14]) || 0;
  const place = {
    id: columns[0],
    name: columns[1],
    asciiName: columns[2],
    lat: Number(columns[4]),
    lng: Number(columns[5]),
    population,
    featureCode: columns[7],
    admin1: columns[10] || null,
    admin2: columns[11] || null,
    rank: placeRank(population, columns[7]),
  };
  placesByCountry.set(iso3, [...(placesByCountry.get(iso3) ?? []), place]);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, "../public/atlas-geography/places");
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

let placeCount = 0;
const countries = [];
for (const [iso3, places] of [...placesByCountry].sort(([left], [right]) => left.localeCompare(right))) {
  places.sort((left, right) => left.rank - right.rank || right.population - left.population || left.name.localeCompare(right.name));
  placeCount += places.length;
  countries.push({ iso3, count: places.length });
  await writeFile(
    path.join(outputDirectory, `${iso3}.json`),
    `${JSON.stringify({ iso3, source, places })}\n`,
  );
}

const manifest = {
  source,
  generatedAt: new Date().toISOString(),
  placeCount,
  countryCount: countries.length,
  countries,
};
await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${placeCount.toLocaleString()} populated places across ${countries.length} countries.`);
