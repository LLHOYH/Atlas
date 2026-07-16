"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, QuadraticBezierLine, Stars } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { geoCentroid, geoContains } from "d3-geo";
import atlasGeoData from "./atlas-geo-data.json";
import atlasLabelData from "./atlas-label-data.json";
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Code2,
  Command,
  Globe2,
  LocateFixed,
  LogOut,
  Move,
  Radio,
  Save,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import * as THREE from "three";
import { useAtlasPresence, type AtlasOwnedAgent } from "../hooks/useAtlasPresence";
import { useAtlasWorld } from "../hooks/useAtlasWorld";
import {
  controlStates,
  presenceActivities,
  type AtlasPresence,
  type PresenceDraft,
} from "../lib/atlas/types";
import type {
  AtlasAgent as Agent,
  AtlasCity as City,
  AtlasDailyLiveAgent,
  AtlasSignal as Signal,
} from "../lib/atlas/world";

const layers = ["Attention", "AI", "Technology", "Travel"] as const;
type Layer = (typeof layers)[number];
type DetailLevel = 1 | 2 | 3 | 4;

const regionViews = [
  { id: "north-america", label: "North America", lat: 43, lng: -102, distance: 6.15, anchorCityId: "san-francisco" },
  { id: "south-america", label: "South America", lat: -17, lng: -60, distance: 6.15, anchorCityId: "sao-paulo" },
  { id: "europe", label: "Europe", lat: 50, lng: 15, distance: 6.05, anchorCityId: "london" },
  { id: "africa", label: "Africa", lat: 5, lng: 20, distance: 6.15, anchorCityId: "lagos" },
  { id: "asia", label: "Asia", lat: 34, lng: 96, distance: 6.15, anchorCityId: "tokyo" },
  { id: "oceania", label: "Oceania", lat: -24, lng: 140, distance: 6.15, anchorCityId: "sydney" },
] as const;

type RegionViewId = (typeof regionViews)[number]["id"];
type RegionView = (typeof regionViews)[number];

const detailLabels: Record<DetailLevel, { title: string; note: string }> = {
  1: { title: "COUNTRIES", note: "Regional agent energy" },
  2: { title: "REGIONS", note: "State & region energy" },
  3: { title: "CITIES", note: "Live agent signals" },
  4: { title: "AGENTS", note: "Agent status & streets" },
};

const layerColors: Record<Layer, string> = {
  Attention: "#a68cff",
  AI: "#b684ff",
  Technology: "#59bdff",
  Travel: "#67e9bc",
};

const agentStatusColors = {
  working: "#f0c66f",
  online: "#67e9bc",
  idle: "#a68cff",
  offline: "#52616b",
} as const;

const agentDensityLevels = [
  { level: 0, max: 100, label: "0–100", color: "#163d46" },
  { level: 1, max: 1_000, label: "101–1K", color: "#287982" },
  { level: 2, max: 10_000, label: "1K–10K", color: "#319b91" },
  { level: 3, max: 100_000, label: "10K–100K", color: "#6eb16f" },
  { level: 4, max: 1_000_000, label: "100K–1M", color: "#e2a04b" },
  { level: 5, max: Number.POSITIVE_INFINITY, label: ">1M", color: "#ffd36f" },
] as const;

function agentDensityLevel(liveAgentCount: number) {
  const safeCount = Math.max(0, Math.floor(liveAgentCount));
  return agentDensityLevels.find((level) => safeCount <= level.max) ?? agentDensityLevels.at(-1)!;
}

function agentDensityBarWidth(level: (typeof agentDensityLevels)[number]) {
  return Math.round(((level.level + 1) / agentDensityLevels.length) * 100);
}

function latLngToVector3(lat: number, lng: number, radius: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

type LabelKind = "country" | "region" | "city" | "street";
type GeoCenter = { lat: number; lng: number };
type CountrySelection = GeoCenter & { name: string; key: string; distance: number };
type AtlasSearchResult =
  | { id: string; kind: "country"; title: string; subtitle: string; country: CountrySelection }
  | { id: string; kind: "city"; title: string; subtitle: string; city: City }
  | { id: string; kind: "signal"; title: string; subtitle: string; city: City; signal: Signal };

type GeographicLabel = {
  id: string;
  name: string;
  position: THREE.Vector3;
};

const globalCountryLabels: GeographicLabel[] = atlasLabelData.countries.map((label) => ({
  id: label.id,
  name: label.name,
  position: latLngToVector3(label.lat, label.lng, 3.105),
}));

const globalRegionLabels: GeographicLabel[] = atlasLabelData.regions.map((label) => ({
  id: label.id,
  name: label.name,
  position: latLngToVector3(label.lat, label.lng, 3.12),
}));

const globalCityLabels: GeographicLabel[] = atlasLabelData.cities.map((label) => ({
  id: label.id,
  name: label.name,
  position: latLngToVector3(label.lat, label.lng, 3.135),
}));

function normalizeLabelName(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

function countryEnergyKey(value: string) {
  const normalized = normalizeLabelName(value);
  if (normalized === "united states of america") return "united states";
  return normalized;
}

function nearestEquivalentAngle(target: number, reference: number) {
  return target + Math.round((reference - target) / (Math.PI * 2)) * Math.PI * 2;
}

function normalizeLongitude(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function GlobeLabel({
  label,
  kind,
  position,
  color,
}: {
  label: string;
  kind: LabelKind;
  position: THREE.Vector3;
  color?: string;
}) {
  const anchor = useRef<THREE.Group>(null);
  const content = useRef<HTMLDivElement>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const surfaceNormal = useMemo(() => new THREE.Vector3(), []);
  const towardCamera = useMemo(() => new THREE.Vector3(), []);
  const distanceFactor = kind === "country" || kind === "city" ? 1.875 : kind === "region" ? 1.5 : 0.9;

  useFrame(({ camera }) => {
    if (!anchor.current || !content.current) return;
    anchor.current.getWorldPosition(worldPosition);
    surfaceNormal.copy(worldPosition).normalize();
    towardCamera.copy(camera.position).sub(worldPosition).normalize();
    const visible = surfaceNormal.dot(towardCamera) > 0.035;
    content.current.style.opacity = visible ? "1" : "0";
    content.current.style.visibility = visible ? "visible" : "hidden";
  });

  return (
    <group ref={anchor} position={position}>
      <Html transform sprite center distanceFactor={distanceFactor} zIndexRange={[8, 0]}>
        <div ref={content} className={`mapLabel mapLabel--${kind}`} style={color ? { color } : undefined}>
          {label}
        </div>
      </Html>
    </group>
  );
}

function StreetMap({ center, onExit }: { center: GeoCenter; onExit: (center: GeoCenter) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<import("maplibre-gl").Map | null>(null);
  const exitRequested = useRef(false);
  const [loaded, setLoaded] = useState(false);

  const exitStreetView = useCallback(() => {
    if (exitRequested.current) return;
    exitRequested.current = true;
    const mapCenter = mapInstance.current?.getCenter();
    onExit(mapCenter ? { lat: mapCenter.lat, lng: mapCenter.lng } : center);
  }, [center, onExit]);

  useEffect(() => {
    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;
    let hoveredBuildingId: string | number | null = null;

    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/dark",
        center: [center.lng, center.lat],
        zoom: 15,
        minZoom: 3.5,
        maxZoom: 19,
        bearing: 0,
        pitch: 34,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
      });
      mapInstance.current = map;
      map.touchZoomRotate.disableRotation();
      map.on("load", () => {
        if (cancelled || !map) return;
        for (const layerId of ["highway_name_other", "highway_name_motorway"]) {
          if (!map.getLayer(layerId)) continue;
          map.setPaintProperty(layerId, "text-color", "#d9b76b");
          map.setPaintProperty(layerId, "text-halo-color", "#071013");
          map.setPaintProperty(layerId, "text-halo-width", 1);
        }
        for (const layerId of ["place_village", "place_town", "place_city", "place_city_large", "place_state"]) {
          if (!map.getLayer(layerId)) continue;
          map.setPaintProperty(layerId, "text-color", "#9fcbd0");
          map.setPaintProperty(layerId, "text-halo-color", "#061014");
          map.setPaintProperty(layerId, "text-halo-width", 1.2);
        }
        for (const [layerId, color] of [
          ["highway_minor", "#1d3c42"],
          ["highway_major_inner", "#826d42"],
          ["highway_motorway_inner", "#b18b43"],
          ["boundary_state", "#3a7f86"],
        ] as const) {
          if (map.getLayer(layerId)) map.setPaintProperty(layerId, "line-color", color);
        }

        if (map.getSource("openmaptiles") && !map.getLayer("atlas-building-blocks")) {
          const firstSymbolLayer = map.getStyle().layers.find((styleLayer) => styleLayer.type === "symbol");
          const buildingLayer: import("maplibre-gl").FillExtrusionLayerSpecification = {
            id: "atlas-building-blocks",
            type: "fill-extrusion",
            source: "openmaptiles",
            "source-layer": "building",
            minzoom: 12,
            paint: {
              "fill-extrusion-color": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                "#e6bf65",
                [
                  "interpolate",
                  ["linear"],
                  ["coalesce", ["get", "render_height"], 7],
                  0,
                  "#0e2228",
                  25,
                  "#1a3d43",
                  80,
                  "#2d5960",
                ],
              ],
              "fill-extrusion-height": [
                "*",
                [
                  "max",
                  ["coalesce", ["get", "render_height"], 7],
                  ["+", ["coalesce", ["get", "render_min_height"], 0], 4],
                ],
                [
                  "case",
                  ["boolean", ["feature-state", "hover"], false],
                  2.85,
                  1,
                ],
              ],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.96,
            },
          };
          map.addLayer(buildingLayer, firstSymbolLayer?.id);

          map.on("mousemove", "atlas-building-blocks", (event) => {
            const nextBuildingId = event.features?.[0]?.id;
            if (nextBuildingId === undefined || nextBuildingId === null) return;
            if (hoveredBuildingId !== null && hoveredBuildingId !== nextBuildingId) {
              map?.setFeatureState(
                { source: "openmaptiles", sourceLayer: "building", id: hoveredBuildingId },
                { hover: false },
              );
            }
            hoveredBuildingId = nextBuildingId;
            map?.setFeatureState(
              { source: "openmaptiles", sourceLayer: "building", id: nextBuildingId },
              { hover: true },
            );
            map?.getCanvas().style.setProperty("cursor", "pointer");
          });
          map.on("mouseleave", "atlas-building-blocks", () => {
            if (hoveredBuildingId !== null) {
              map?.setFeatureState(
                { source: "openmaptiles", sourceLayer: "building", id: hoveredBuildingId },
                { hover: false },
              );
            }
            hoveredBuildingId = null;
            map?.getCanvas().style.setProperty("cursor", "grab");
          });
        }
        setLoaded(true);
      });
      map.on("zoom", () => {
        if (map && map.getZoom() <= 5.5) exitStreetView();
      });
    });

    return () => {
      cancelled = true;
      mapInstance.current = null;
      map?.remove();
    };
  }, [center.lat, center.lng, exitStreetView]);

  return (
    <div className={`streetMapStage ${loaded ? "loaded" : ""}`}>
      <div ref={container} className="streetMapCanvas" />
      <div className="streetMapReadout glassPanel">
        <span>GLOBAL STREET GRID</span>
        <b>{Math.abs(center.lat).toFixed(3)}°{center.lat >= 0 ? "N" : "S"} · {Math.abs(center.lng).toFixed(3)}°{center.lng >= 0 ? "E" : "W"}</b>
        <small>3D blocks · north locked</small>
      </div>
      <button className="streetMapReturn glassPanel" onClick={exitStreetView}>
        <Globe2 size={13} /> Return to globe
      </button>
      <div className="streetMapHint">Hover a building to lift it · Drag to move · Scroll to zoom</div>
    </div>
  );
}

type CountryPoint = { lng: number; lat: number };

const COUNTRY_BOTTOM_RADIUS = 3.003;
const COUNTRY_TOP_RADIUS = 3.026;
const COUNTRY_HOVER_RADIUS = 3.22;
const CITY_BOTTOM_RADIUS = 3.03;
const CITY_TOP_RADIUS = 3.048;
const CITY_HOVER_RADIUS = 3.14;

function unpackCountryRing(flatRing: number[]) {
  const ring: CountryPoint[] = [];
  for (let index = 0; index < flatRing.length; index += 2) {
    ring.push({ lng: flatRing[index], lat: flatRing[index + 1] });
  }
  const first = ring[0];
  const last = ring.at(-1);
  if (first && last && first.lng === last.lng && first.lat === last.lat) ring.pop();
  for (let index = 1; index < ring.length; index += 1) {
    while (ring[index].lng - ring[index - 1].lng > 180) ring[index].lng -= 360;
    while (ring[index].lng - ring[index - 1].lng < -180) ring[index].lng += 360;
  }
  return ring;
}

function prepareCountryRings(polygon: number[][]) {
  const rings = polygon.map(unpackCountryRing).filter((ring) => ring.length >= 3);
  if (!rings.length) return rings;
  const outerMean = rings[0].reduce((sum, point) => sum + point.lng, 0) / rings[0].length;
  for (let index = 1; index < rings.length; index += 1) {
    const holeMean = rings[index].reduce((sum, point) => sum + point.lng, 0) / rings[index].length;
    const longitudeShift = Math.round((outerMean - holeMean) / 360) * 360;
    rings[index].forEach((point) => {
      point.lng += longitudeShift;
    });
  }
  return rings;
}

function countryToGeoJson(country: (typeof atlasGeoData.countries)[number]) {
  const coordinates = country.polygons.map((polygon) => polygon.map((flatRing) => {
    const ring: [number, number][] = [];
    for (let index = 0; index < flatRing.length; index += 2) {
      ring.push([flatRing[index], flatRing[index + 1]]);
    }
    return ring;
  }));
  return coordinates.length === 1
    ? { type: "Polygon" as const, coordinates: coordinates[0] }
    : { type: "MultiPolygon" as const, coordinates };
}

function vectorToGeoCenter(vector: THREE.Vector3): GeoCenter {
  const unit = vector.clone().normalize();
  const lat = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(unit.y, -1, 1)));
  const theta = THREE.MathUtils.radToDeg(Math.atan2(unit.z, -unit.x));
  return { lat, lng: normalizeLongitude(theta - 180) };
}

function sphericalDirection(point: CountryPoint) {
  return latLngToVector3(point.lat, point.lng, 1).normalize();
}

function appendSphericalTriangle(
  positions: number[],
  raisedPositions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  depth = 0,
) {
  const edges = [
    { length: a.angleTo(b), start: a, end: b, opposite: c },
    { length: b.angleTo(c), start: b, end: c, opposite: a },
    { length: c.angleTo(a), start: c, end: a, opposite: b },
  ].sort((left, right) => right.length - left.length);
  const longest = edges[0];
  if (longest.length > 0.18 && depth < 8) {
    const midpoint = longest.start.clone().add(longest.end).normalize();
    appendSphericalTriangle(positions, raisedPositions, longest.start, midpoint, longest.opposite, depth + 1);
    appendSphericalTriangle(positions, raisedPositions, midpoint, longest.end, longest.opposite, depth + 1);
    return;
  }

  let second = b;
  let third = c;
  const outward = b.clone().sub(a).cross(c.clone().sub(a));
  if (outward.dot(a) < 0) {
    second = c;
    third = b;
  }
  for (const point of [a, second, third]) {
    const base = point.clone().multiplyScalar(COUNTRY_TOP_RADIUS);
    const raised = point.clone().multiplyScalar(COUNTRY_HOVER_RADIUS);
    positions.push(base.x, base.y, base.z);
    raisedPositions.push(raised.x, raised.y, raised.z);
  }
}

function buildCountryGeometry(country: (typeof atlasGeoData.countries)[number]) {
  const positions: number[] = [];
  const raisedPositions: number[] = [];
  const outlinePositions: number[] = [];

  for (const polygon of country.polygons) {
    const rings = prepareCountryRings(polygon);
    if (!rings.length) continue;

    const contour = rings[0].map((point) => new THREE.Vector2(point.lng, point.lat));
    const holes = rings.slice(1).map((ring) => ring.map((point) => new THREE.Vector2(point.lng, point.lat)));
    const flattened = contour.concat(...holes);
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    for (const face of faces) {
      appendSphericalTriangle(
        positions,
        raisedPositions,
        sphericalDirection({ lng: flattened[face[0]].x, lat: flattened[face[0]].y }),
        sphericalDirection({ lng: flattened[face[1]].x, lat: flattened[face[1]].y }),
        sphericalDirection({ lng: flattened[face[2]].x, lat: flattened[face[2]].y }),
      );
    }

    for (const ring of rings) {
      for (let index = 0; index < ring.length; index += 1) {
        const start = sphericalDirection(ring[index]);
        const end = sphericalDirection(ring[(index + 1) % ring.length]);
        const divisions = Math.max(1, Math.ceil(start.angleTo(end) / 0.08));
        for (let division = 0; division < divisions; division += 1) {
          const from = start.clone().lerp(end, division / divisions).normalize();
          const to = start.clone().lerp(end, (division + 1) / divisions).normalize();
          const bottomFrom = from.clone().multiplyScalar(COUNTRY_BOTTOM_RADIUS);
          const bottomTo = to.clone().multiplyScalar(COUNTRY_BOTTOM_RADIUS);
          const topFrom = from.clone().multiplyScalar(COUNTRY_TOP_RADIUS);
          const topTo = to.clone().multiplyScalar(COUNTRY_TOP_RADIUS);
          const raisedTopFrom = from.clone().multiplyScalar(COUNTRY_HOVER_RADIUS);
          const raisedTopTo = to.clone().multiplyScalar(COUNTRY_HOVER_RADIUS);

          for (const point of [bottomFrom, bottomTo, topTo, bottomFrom, topTo, topFrom]) {
            positions.push(point.x, point.y, point.z);
          }
          for (const point of [bottomFrom, bottomTo, raisedTopTo, bottomFrom, raisedTopTo, raisedTopFrom]) {
            raisedPositions.push(point.x, point.y, point.z);
          }
          outlinePositions.push(topFrom.x, topFrom.y, topFrom.z, topTo.x, topTo.y, topTo.z);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(raisedPositions, 3)];
  geometry.morphTargetsRelative = false;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const outline = new THREE.BufferGeometry();
  outline.setAttribute("position", new THREE.Float32BufferAttribute(outlinePositions, 3));
  outline.computeBoundingSphere();
  return { geometry, outline };
}

type CountryHitArea = ReturnType<typeof countryToGeoJson>;
type CityMapLabel = (typeof atlasLabelData.cities)[number];

function stableCityHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildCityTerritoryRing(label: CityMapLabel, countryArea?: CountryHitArea) {
  const population = Math.max(100_000, Number(label.population) || 100_000);
  const populationScale = THREE.MathUtils.clamp((Math.log10(population) - 5) / 3, 0, 1);
  const latitudeRadius = 0.2 + populationScale * 0.42;
  const longitudeRadius = latitudeRadius / Math.max(0.32, Math.cos(THREE.MathUtils.degToRad(label.lat)));
  const hash = stableCityHash(label.id);
  const phase = ((hash % 360) * Math.PI) / 180;
  const center: [number, number] = [normalizeLongitude(label.lng), label.lat];
  const centerInsideCountry = countryArea ? geoContains(countryArea, center) : false;

  return Array.from({ length: 10 }, (_, index) => {
    const angle = phase + (index / 10) * Math.PI * 2;
    const wobbleSeed = (hash >>> (index % 16)) & 15;
    const wobble = 0.82 + (wobbleSeed / 15) * 0.28;
    const targetLng = normalizeLongitude(label.lng + Math.cos(angle) * longitudeRadius * wobble);
    const targetLat = THREE.MathUtils.clamp(label.lat + Math.sin(angle) * latitudeRadius * wobble, -89.5, 89.5);
    if (!countryArea || !centerInsideCountry || geoContains(countryArea, [targetLng, targetLat])) {
      return { lng: targetLng, lat: targetLat };
    }

    const longitudeDelta = normalizeLongitude(targetLng - label.lng);
    let insideFraction = 0;
    let outsideFraction = 1;
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const fraction = (insideFraction + outsideFraction) / 2;
      const candidate: [number, number] = [
        normalizeLongitude(label.lng + longitudeDelta * fraction),
        label.lat + (targetLat - label.lat) * fraction,
      ];
      if (geoContains(countryArea, candidate)) insideFraction = fraction;
      else outsideFraction = fraction;
    }
    const clippedFraction = insideFraction * 0.94;
    return {
      lng: normalizeLongitude(label.lng + longitudeDelta * clippedFraction),
      lat: label.lat + (targetLat - label.lat) * clippedFraction,
    };
  });
}

function buildCityTerritoryGeometry(label: CityMapLabel, countryArea?: CountryHitArea) {
  const ring = buildCityTerritoryRing(label, countryArea);
  const positions: number[] = [];
  const raisedPositions: number[] = [];
  const outlinePositions: number[] = [];
  const center = sphericalDirection({ lng: label.lng, lat: label.lat });

  for (let index = 0; index < ring.length; index += 1) {
    const start = sphericalDirection(ring[index]);
    const end = sphericalDirection(ring[(index + 1) % ring.length]);
    for (const point of [center, start, end]) {
      const base = point.clone().multiplyScalar(CITY_TOP_RADIUS);
      const raised = point.clone().multiplyScalar(CITY_HOVER_RADIUS);
      positions.push(base.x, base.y, base.z);
      raisedPositions.push(raised.x, raised.y, raised.z);
    }

    const bottomStart = start.clone().multiplyScalar(CITY_BOTTOM_RADIUS);
    const bottomEnd = end.clone().multiplyScalar(CITY_BOTTOM_RADIUS);
    const topStart = start.clone().multiplyScalar(CITY_TOP_RADIUS);
    const topEnd = end.clone().multiplyScalar(CITY_TOP_RADIUS);
    const raisedTopStart = start.clone().multiplyScalar(CITY_HOVER_RADIUS);
    const raisedTopEnd = end.clone().multiplyScalar(CITY_HOVER_RADIUS);
    for (const point of [bottomStart, bottomEnd, topEnd, bottomStart, topEnd, topStart]) {
      positions.push(point.x, point.y, point.z);
    }
    for (const point of [bottomStart, bottomEnd, raisedTopEnd, bottomStart, raisedTopEnd, raisedTopStart]) {
      raisedPositions.push(point.x, point.y, point.z);
    }
    outlinePositions.push(topStart.x, topStart.y, topStart.z, topEnd.x, topEnd.y, topEnd.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(raisedPositions, 3)];
  geometry.morphTargetsRelative = false;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const outline = new THREE.BufferGeometry();
  outline.setAttribute("position", new THREE.Float32BufferAttribute(outlinePositions, 3));
  outline.computeBoundingSphere();
  return { geometry, outline };
}

function CountrySurfaces({
  liveAgentsByCountry = {},
  selectedCountryKey,
  detailLevel,
  onSelect,
}: {
  liveAgentsByCountry?: Record<string, number>;
  selectedCountryKey: string | null;
  detailLevel: DetailLevel;
  onSelect: (country: CountrySelection) => void;
}) {
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const outlines = useRef<Array<THREE.LineSegments | null>>([]);
  const hoveredCountry = useRef<number | null>(null);
  const hoverStrengths = useMemo(() => new Float32Array(atlasGeoData.countries.length), []);
  const densityColors = useMemo(() => agentDensityLevels.map((level) => new THREE.Color(level.color)), []);
  const countries = useMemo(() => atlasGeoData.countries.map((country) => ({
    name: country.name,
    energyKey: countryEnergyKey(country.name),
    ...buildCountryGeometry(country),
  })), []);
  const countryHitAreas = useMemo(() => atlasGeoData.countries.map(countryToGeoJson), []);
  const countryCenters = useMemo(() => {
    const labelCenters = new Map(atlasLabelData.countries.map((country) => [
      countryEnergyKey(country.name),
      { lat: country.lat, lng: country.lng },
    ]));
    return countryHitAreas.map((country, index) => {
      const labelCenter = labelCenters.get(countries[index].energyKey);
      if (labelCenter) return labelCenter;
      const [lng, lat] = geoCentroid(country);
      return { lat, lng };
    });
  }, [countries, countryHitAreas]);

  const findCountryAtPoint = (worldPoint: THREE.Vector3, hitSurface: THREE.Object3D) => {
    const geo = vectorToGeoCenter(hitSurface.worldToLocal(worldPoint.clone()));
    for (let countryIndex = 0; countryIndex < countryHitAreas.length; countryIndex += 1) {
      if (geoContains(countryHitAreas[countryIndex], [geo.lng, geo.lat])) return countryIndex;
    }
    return null;
  };

  useFrame((_, delta) => {
    countries.forEach((country, index) => {
      const liveAgentCount = liveAgentsByCountry[country.energyKey] ?? 0;
      const density = agentDensityLevel(liveAgentCount);
      const densityColor = densityColors[density.level];
      const isSelected = selectedCountryKey === country.energyKey;
      const cityLayerActive = detailLevel >= 3;
      const target = cityLayerActive ? 0 : hoveredCountry.current === index ? 1 : isSelected ? 0.74 : 0;
      const current = hoverStrengths[index];
      const next = THREE.MathUtils.damp(current, target, 12, delta);
      const liveLift = !cityLayerActive && liveAgentCount > 0 ? 0.08 + density.level * 0.025 : 0;
      const lift = Math.max(liveLift, next);
      hoverStrengths[index] = next;
      const mesh = meshes.current[index];
      const outline = outlines.current[index];
      if (mesh?.morphTargetInfluences) mesh.morphTargetInfluences[0] = lift;
      if (mesh?.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.color.copy(densityColor);
        mesh.material.emissive.copy(densityColor);
        mesh.material.emissiveIntensity = 0.18 + density.level * 0.11 + next * 0.72;
      }
      if (outline) {
        const radiusScale = 1 + lift * (COUNTRY_HOVER_RADIUS / COUNTRY_TOP_RADIUS - 1);
        outline.scale.setScalar(radiusScale);
        if (outline.material instanceof THREE.LineBasicMaterial) {
          outline.material.color.set(next > 0.02 ? "#ffe19a" : density.color);
          outline.material.opacity = 0.34 + (liveAgentCount > 0 ? 0.12 : 0) + density.level * 0.04 + next * 0.12;
        }
      }
    });
  });

  return (
    <>
      <mesh>
        <sphereGeometry args={[2.995, 72, 72]} />
        <meshStandardMaterial color="#031419" roughness={0.94} metalness={0.12} emissive="#04151b" emissiveIntensity={0.72} />
      </mesh>
      <mesh scale={1.001}>
        <sphereGeometry args={[3, 36, 24]} />
        <meshBasicMaterial color="#245c68" wireframe transparent opacity={0.035} depthWrite={false} />
      </mesh>
      {detailLevel < 3 && <mesh
        onPointerMove={(event) => {
          const nextCountry = findCountryAtPoint(event.point, event.eventObject);
          hoveredCountry.current = nextCountry;
          if (event.buttons === 0) document.body.style.cursor = nextCountry === null ? "grab" : "pointer";
        }}
        onPointerOut={() => {
          hoveredCountry.current = null;
          document.body.style.cursor = "grab";
        }}
        onClick={(event) => {
          if (event.delta > 5) return;
          const countryIndex = hoveredCountry.current ?? findCountryAtPoint(event.point, event.eventObject);
          if (countryIndex === null) return;
          event.stopPropagation();
          const country = countries[countryIndex];
          onSelect({
            name: country.name,
            key: country.energyKey,
            lat: countryCenters[countryIndex].lat,
            lng: countryCenters[countryIndex].lng,
            distance: 6.15,
          });
        }}
      >
        <sphereGeometry args={[COUNTRY_HOVER_RADIUS + 0.025, 96, 64]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} side={THREE.FrontSide} />
      </mesh>}
      {countries.map((country, index) => {
        const liveAgentCount = liveAgentsByCountry[country.energyKey] ?? 0;
        const density = agentDensityLevel(liveAgentCount);
        return (
        <group key={country.name}>
          <mesh
            ref={(node) => {
              meshes.current[index] = node;
              node?.updateMorphTargets();
            }}
            geometry={country.geometry}
            frustumCulled={false}
          >
            <meshStandardMaterial
              color={density.color}
              emissive={density.color}
              emissiveIntensity={0.18 + density.level * 0.11}
              roughness={0.56}
              metalness={0.16}
              side={THREE.DoubleSide}
            />
          </mesh>
          <lineSegments
            ref={(node) => {
              outlines.current[index] = node;
            }}
            geometry={country.outline}
            frustumCulled={false}
            raycast={() => undefined}
          >
            <lineBasicMaterial color={density.color} transparent opacity={0.34 + (liveAgentCount > 0 ? 0.12 : 0) + density.level * 0.04} depthWrite={false} />
          </lineSegments>
        </group>
        );
      })}
    </>
  );
}

function CityTerritories({
  cities,
  selectedCityId,
  onSelect,
}: {
  cities: City[];
  selectedCityId: string;
  onSelect: (city: City) => void;
}) {
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const outlines = useRef<Array<THREE.LineSegments | null>>([]);
  const hoveredCity = useRef<number | null>(null);
  const hoverStrengths = useMemo(() => new Float32Array(atlasLabelData.cities.length), []);
  const gold = useMemo(() => new THREE.Color("#ffd36f"), []);
  const countryAreas = useMemo(() => new Map(atlasGeoData.countries.map((country) => [
    countryEnergyKey(country.name),
    countryToGeoJson(country),
  ])), []);
  const cityByName = useMemo(() => new Map(cities.map((city) => [normalizeLabelName(city.name), city])), [cities]);
  const territories = useMemo(() => atlasLabelData.cities.map((label) => {
    const city = cityByName.get(normalizeLabelName(label.name)) ?? null;
    const countryArea = countryAreas.get(countryEnergyKey(label.country));
    const baseColor = new THREE.Color(city?.color ?? "#287982").lerp(new THREE.Color("#214f58"), city ? 0.3 : 0.55);
    return {
      id: label.id,
      name: label.name,
      city,
      baseColor,
      ...buildCityTerritoryGeometry(label, countryArea),
    };
  }), [cityByName, countryAreas]);

  useFrame((_, delta) => {
    territories.forEach((territory, index) => {
      const isSelected = territory.city?.id === selectedCityId;
      const target = hoveredCity.current === index ? 1 : isSelected ? 0.62 : 0;
      const next = THREE.MathUtils.damp(hoverStrengths[index], target, 14, delta);
      hoverStrengths[index] = next;
      const mesh = meshes.current[index];
      const outline = outlines.current[index];
      if (mesh?.morphTargetInfluences) mesh.morphTargetInfluences[0] = next;
      if (mesh?.material instanceof THREE.MeshStandardMaterial) {
        mesh.material.color.copy(territory.baseColor).lerp(gold, next * 0.72);
        mesh.material.emissive.copy(territory.baseColor).lerp(gold, next);
        mesh.material.emissiveIntensity = 0.26 + next * 1.15;
      }
      if (outline) {
        const radiusScale = 1 + next * (CITY_HOVER_RADIUS / CITY_TOP_RADIUS - 1);
        outline.scale.setScalar(radiusScale);
        if (outline.material instanceof THREE.LineBasicMaterial) {
          outline.material.color.copy(territory.baseColor).lerp(gold, 0.42 + next * 0.58);
          outline.material.opacity = 0.56 + next * 0.34;
        }
      }
    });
  });

  return territories.map((territory, index) => (
    <group key={territory.id}>
      <mesh
        ref={(node) => {
          meshes.current[index] = node;
          node?.updateMorphTargets();
        }}
        geometry={territory.geometry}
        frustumCulled={false}
        onPointerOver={(event) => {
          event.stopPropagation();
          hoveredCity.current = index;
          document.body.style.cursor = territory.city ? "pointer" : "grab";
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          hoveredCity.current = index;
        }}
        onPointerOut={() => {
          if (hoveredCity.current === index) hoveredCity.current = null;
          document.body.style.cursor = "grab";
        }}
        onClick={(event) => {
          if (!territory.city || event.delta > 5) return;
          event.stopPropagation();
          onSelect(territory.city);
        }}
      >
        <meshStandardMaterial
          color={territory.baseColor}
          emissive={territory.baseColor}
          emissiveIntensity={0.26}
          roughness={0.5}
          metalness={0.18}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments
        ref={(node) => {
          outlines.current[index] = node;
        }}
        geometry={territory.outline}
        frustumCulled={false}
        raycast={() => undefined}
      >
        <lineBasicMaterial color="#d9b76b" transparent opacity={0.56} depthWrite={false} />
      </lineSegments>
    </group>
  ));
}

function StreetMesh({
  cities,
  layer,
  materialRef,
}: {
  cities: City[];
  layer: Layer;
  materialRef: React.RefObject<THREE.LineBasicMaterial | null>;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const addSegment = (startLat: number, startLng: number, endLat: number, endLng: number) => {
      const start = latLngToVector3(startLat, startLng, 3.085);
      const end = latLngToVector3(endLat, endLng, 3.085);
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    };

    cities.forEach((city) => {
      const longitudeScale = 1 / Math.max(0.28, Math.cos((city.lat * Math.PI) / 180));
      const halfSpan = 0.72;
      for (let index = -4; index <= 4; index += 1) {
        const offset = index * 0.16;
        addSegment(
          city.lat - halfSpan,
          city.lng + offset * longitudeScale,
          city.lat + halfSpan,
          city.lng + offset * longitudeScale,
        );
        addSegment(
          city.lat + offset,
          city.lng - halfSpan * longitudeScale,
          city.lat + offset,
          city.lng + halfSpan * longitudeScale,
        );
      }
      addSegment(
        city.lat - halfSpan * 0.75,
        city.lng - halfSpan * longitudeScale,
        city.lat + halfSpan * 0.75,
        city.lng + halfSpan * longitudeScale,
      );

      city.streets.forEach((street) => {
        const centerLat = city.lat + street.offsetLatitude;
        const centerLng = city.lng + street.offsetLongitude;
        const bearing = THREE.MathUtils.degToRad(street.bearingDegrees);
        const halfLength = street.lengthDegrees / 2;
        const latitudeDelta = Math.cos(bearing) * halfLength;
        const longitudeDelta = (
          Math.sin(bearing) * halfLength
        ) / Math.max(0.28, Math.cos((centerLat * Math.PI) / 180));
        addSegment(
          centerLat - latitudeDelta,
          centerLng - longitudeDelta,
          centerLat + latitudeDelta,
          centerLng + longitudeDelta,
        );
      });
    });

    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return result;
  }, [cities]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        ref={materialRef}
        color={layerColors[layer]}
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function AgentLight({
  agent,
  showLabel,
  onSelect,
}: {
  agent: Agent;
  showLabel: boolean;
  onSelect: (agent: Agent) => void;
}) {
  const anchor = useRef<THREE.Group>(null);
  const pulse = useRef<THREE.Mesh>(null);
  const content = useRef<HTMLDivElement>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const surfaceNormal = useMemo(() => new THREE.Vector3(), []);
  const towardCamera = useMemo(() => new THREE.Vector3(), []);
  const position = useMemo(
    () => latLngToVector3(agent.lat, agent.lng, 3.075),
    [agent.lat, agent.lng],
  );
  const orientation = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      position.clone().normalize(),
    ),
    [position],
  );
  const color = agentStatusColors[agent.status];
  const height = 0.045 + (agent.energy / 100) * 0.075;

  useFrame(({ clock, camera }) => {
    if (!pulse.current) return;
    const active = agent.status === "working" || agent.status === "online";
    const wave = active ? 1 + Math.sin(clock.elapsedTime * 2.8 + agent.energy) * 0.18 : 0.82;
    pulse.current.scale.setScalar(wave);
    if (anchor.current && content.current) {
      anchor.current.getWorldPosition(worldPosition);
      surfaceNormal.copy(worldPosition).normalize();
      towardCamera.copy(camera.position).sub(worldPosition).normalize();
      content.current.style.opacity = surfaceNormal.dot(towardCamera) > 0.055 ? "1" : "0";
    }
  });

  return (
    <group ref={anchor} position={position} quaternion={orientation}>
      <mesh position={[0, 0, height / 2]}>
        <boxGeometry args={[0.032, 0.032, height]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={agent.status === "offline" ? 0.08 : 0.95}
          transparent
          opacity={agent.status === "offline" ? 0.4 : 0.96}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={pulse} position={[0, 0, 0.006]}>
        <ringGeometry args={[0.035, 0.052, 24]} />
        <meshBasicMaterial color={color} transparent opacity={agent.status === "offline" ? 0.12 : 0.58} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh
        position={[0, 0, height / 2]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(agent);
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "grab";
        }}
      >
        <boxGeometry args={[0.075, 0.075, Math.max(0.09, height)]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
      </mesh>
      {showLabel && (
        <Html transform sprite center position={[0, 0, height + 0.045]} distanceFactor={2.1} zIndexRange={[9, 1]}>
          <div ref={content} className={`agentMapLabel agentMapLabel--${agent.status}`}>
            <i />
            <span><b>{agent.name}</b><small>{agent.status} · {agent.activity}</small></span>
          </div>
        </Html>
      )}
    </group>
  );
}

function EnergyParticles({ cities, layer }: { cities: City[]; layer: Layer }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    let seed = 1487;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const positions: number[] = [];
    const colors: number[] = [];
    cities.forEach((city) => {
      const center = latLngToVector3(city.lat, city.lng, 3.06);
      const normal = center.clone().normalize();
      const tangent = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
      const bitangent = normal.clone().cross(tangent).normalize();
      const baseColor = new THREE.Color(city.color);
      const particleCount = 12 + Math.round(Math.min((city.agentEnergy ?? 0) / 360, 1) * 38);
      for (let i = 0; i < particleCount; i += 1) {
        const spread = 0.02 + random() * 0.22;
        const angle = random() * Math.PI * 2;
        const lift = random() * 0.09;
        const point = center
          .clone()
          .add(tangent.clone().multiplyScalar(Math.cos(angle) * spread))
          .add(bitangent.clone().multiplyScalar(Math.sin(angle) * spread))
          .add(normal.clone().multiplyScalar(lift));
        positions.push(point.x, point.y, point.z);
        colors.push(baseColor.r, baseColor.g, baseColor.b);
      }
    });
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    result.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return result;
  }, [cities]);

  useFrame(({ clock }) => {
    if (points.current) {
      const material = points.current.material as THREE.PointsMaterial;
      material.opacity = 0.42 + Math.sin(clock.elapsedTime * 1.3) * 0.1;
    }
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        color={layer === "Attention" ? "#ffffff" : layerColors[layer]}
        size={0.025}
        sizeAttenuation
        vertexColors={layer === "Attention"}
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function AttentionFlow({ from, to, color, delay }: { from: City; to: City; color: string; delay: number }) {
  const dot = useRef<THREE.Mesh>(null);
  const start = useMemo(() => latLngToVector3(from.lat, from.lng, 3.06), [from]);
  const end = useMemo(() => latLngToVector3(to.lat, to.lng, 3.06), [to]);
  const mid = useMemo(
    () => start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(4.05),
    [start, end],
  );
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(start, mid, end), [start, mid, end]);

  useFrame(({ clock }) => {
    if (!dot.current) return;
    const t = (clock.elapsedTime * 0.09 + delay) % 1;
    dot.current.position.copy(curve.getPoint(t));
  });

  return (
    <>
      <QuadraticBezierLine
        start={start}
        end={end}
        mid={mid}
        color={color}
        lineWidth={0.55}
        transparent
        opacity={0.32}
        dashed
        dashScale={16}
        dashSize={0.45}
        gapSize={0.35}
      />
      <mesh ref={dot}>
        <sphereGeometry args={[0.025, 12, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </>
  );
}

function Earth({
  cities,
  selectedCity,
  selectedCountryKey,
  focusLocation,
  focusDistance,
  focusRevision,
  layer,
  liveCounts = {},
  onSelect,
  onCountrySelect,
  onAgentSelect,
  onDetailChange,
  onStreetEnter,
}: {
  cities: City[];
  selectedCity: City;
  selectedCountryKey: string | null;
  focusLocation: GeoCenter;
  focusDistance: number | null;
  focusRevision: number;
  layer: Layer;
  liveCounts: Record<string, number>;
  onSelect: (city: City) => void;
  onCountrySelect: (country: CountrySelection) => void;
  onAgentSelect: (city: City, agent: Agent) => void;
  onDetailChange: (level: DetailLevel) => void;
  onStreetEnter: (center: GeoCenter) => void;
}) {
  const globe = useRef<THREE.Group>(null);
  const drag = useRef({ active: false, x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const orientation = useRef({ pitch: 0, yaw: 0 });
  const focus = useRef<{ pitch: number; yaw: number } | null>(null);
  const pitchRotation = useRef(new THREE.Quaternion());
  const yawRotation = useRef(new THREE.Quaternion());
  const pitchAxis = useRef(new THREE.Vector3(1, 0, 0));
  const yawAxis = useRef(new THREE.Vector3(0, 1, 0));
  const streetEntryLocked = useRef(false);
  const focusDistanceTarget = useRef<number | null>(null);
  const initialized = useRef(false);
  const currentDetail = useRef<DetailLevel>(1);
  const streetMaterial = useRef<THREE.LineBasicMaterial>(null);
  const cityTerritories = useRef<THREE.Group>(null);
  const [labelDetail, setLabelDetail] = useState<DetailLevel>(1);
  const liveAgentsByCountry = useMemo(() => cities.reduce<Record<string, number>>((counts, city) => {
    const key = countryEnergyKey(city.country);
    const seededLiveAgents = city.agents.filter((agent) => agent.status !== "offline").length;
    counts[key] = (counts[key] ?? 0) + seededLiveAgents + (liveCounts[city.name] ?? 0);
    return counts;
  }, {}), [cities, liveCounts]);

  const applyOrientation = () => {
    if (!globe.current) return;
    pitchRotation.current.setFromAxisAngle(pitchAxis.current, orientation.current.pitch);
    yawRotation.current.setFromAxisAngle(yawAxis.current, orientation.current.yaw);
    globe.current.quaternion.copy(pitchRotation.current).multiply(yawRotation.current);
  };

  useLayoutEffect(() => {
    if (!globe.current) return;
    const targetOrientation = {
      pitch: THREE.MathUtils.degToRad(focusLocation.lat),
      yaw: nearestEquivalentAngle(
        -Math.PI / 2 - THREE.MathUtils.degToRad(focusLocation.lng),
        orientation.current.yaw,
      ),
    };

    velocity.current = { x: 0, y: 0 };
    focusDistanceTarget.current = focusDistance;
    if (focusDistance !== null) streetEntryLocked.current = true;
    if (!initialized.current) {
      orientation.current = targetOrientation;
      applyOrientation();
      initialized.current = true;
      focus.current = null;
      return;
    }

    focus.current = targetOrientation;
  }, [focusDistance, focusLocation.lat, focusLocation.lng, focusRevision]);

  useFrame(({ camera }, delta) => {
    if (!globe.current) return;
    if (focusDistanceTarget.current !== null) {
      const nextDistance = THREE.MathUtils.damp(
        camera.position.length(),
        focusDistanceTarget.current,
        9,
        delta,
      );
      camera.position.setLength(nextDistance);
      if (Math.abs(nextDistance - focusDistanceTarget.current) < 0.006) {
        camera.position.setLength(focusDistanceTarget.current);
        focusDistanceTarget.current = null;
      }
    }
    const distance = camera.position.length();
    if (distance > 3.84) {
      streetEntryLocked.current = false;
    } else if (distance <= 3.69 && !streetEntryLocked.current) {
      streetEntryLocked.current = true;
      onStreetEnter({
        lat: THREE.MathUtils.radToDeg(orientation.current.pitch),
        lng: normalizeLongitude(-90 - THREE.MathUtils.radToDeg(orientation.current.yaw)),
      });
    }
    const nextDetail: DetailLevel = distance > 6
      ? 1
      : distance > 5.05
        ? 2
        : distance > 4.42
          ? 3
          : 4;
    if (nextDetail !== currentDetail.current) {
      currentDetail.current = nextDetail;
      setLabelDetail(nextDetail);
      onDetailChange(nextDetail);
    }

    const streetOpacity = 1 - THREE.MathUtils.smoothstep(distance, 3.88, 4.6);
    if (streetMaterial.current) streetMaterial.current.opacity = streetOpacity * 0.72;
    if (cityTerritories.current) cityTerritories.current.visible = nextDetail >= 3;

    if (focus.current) {
      orientation.current.pitch = THREE.MathUtils.damp(orientation.current.pitch, focus.current.pitch, 9, delta);
      orientation.current.yaw = THREE.MathUtils.damp(orientation.current.yaw, focus.current.yaw, 9, delta);
      applyOrientation();
      if (
        Math.abs(orientation.current.pitch - focus.current.pitch) < 0.002
        && Math.abs(orientation.current.yaw - focus.current.yaw) < 0.002
      ) {
        orientation.current = focus.current;
        focus.current = null;
        applyOrientation();
      }
      return;
    }
    if (!drag.current.active) {
      if (velocity.current.x !== 0 || velocity.current.y !== 0) {
        orientation.current.yaw += velocity.current.x;
        orientation.current.pitch = THREE.MathUtils.clamp(
          orientation.current.pitch + velocity.current.y,
          -Math.PI / 2 + 0.08,
          Math.PI / 2 - 0.08,
        );
        applyOrientation();
      }
      velocity.current.x *= 0.88;
      velocity.current.y *= 0.88;
      if (Math.abs(velocity.current.x) < 0.00005) velocity.current.x = 0;
      if (Math.abs(velocity.current.y) < 0.00005) velocity.current.y = 0;
    }
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    drag.current = { active: true, x: event.clientX, y: event.clientY };
    velocity.current = { x: 0, y: 0 };
    focus.current = null;
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    document.body.style.cursor = "grabbing";
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!drag.current.active || !globe.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current.x = event.clientX;
    drag.current.y = event.clientY;
    velocity.current = { x: dx * 0.0035, y: dy * 0.0028 };
    orientation.current.yaw += velocity.current.x;
    orientation.current.pitch = THREE.MathUtils.clamp(
      orientation.current.pitch + velocity.current.y,
      -Math.PI / 2 + 0.08,
      Math.PI / 2 - 0.08,
    );
    applyOrientation();
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    drag.current.active = false;
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
    document.body.style.cursor = "grab";
  };

  return (
    <group ref={globe}>
      <mesh
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={(event) => {
          if (drag.current.active) handlePointerUp(event);
        }}
      >
        <sphereGeometry args={[3, 128, 128]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
      </mesh>
      <CountrySurfaces liveAgentsByCountry={liveAgentsByCountry} selectedCountryKey={selectedCountryKey} detailLevel={labelDetail} onSelect={onCountrySelect} />
      <EnergyParticles cities={cities} layer={layer} />
      <StreetMesh cities={cities} layer={layer} materialRef={streetMaterial} />
      <mesh scale={1.055}>
        <sphereGeometry args={[3, 96, 96]} />
        <meshBasicMaterial color="#3cc5d7" transparent opacity={0.045} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <group ref={cityTerritories} visible={false}>
        <CityTerritories cities={cities} selectedCityId={selectedCity.id} onSelect={onSelect} />
      </group>
      {labelDetail === 1 && globalCountryLabels.map((country) => (
        <GlobeLabel
          key={country.id}
          label={country.name}
          kind="country"
          position={country.position}
        />
      ))}
      {labelDetail === 2 && globalRegionLabels.map((region) => (
        <GlobeLabel
          key={region.id}
          label={region.name}
          kind="region"
          position={region.position}
        />
      ))}
      {(labelDetail === 3 || labelDetail === 4) && globalCityLabels.map((city) => (
        <GlobeLabel
          key={city.id}
          label={city.name}
          kind="city"
          position={city.position}
        />
      ))}
      {labelDetail === 4 && cities.flatMap((city) => city.agents.map((agent) => (
        <AgentLight
          key={agent.id}
          agent={agent}
          showLabel={labelDetail === 4 && city.id === selectedCity.id}
          onSelect={(selectedAgent) => onAgentSelect(city, selectedAgent)}
        />
      )))}
      {labelDetail === 4 && (
        <>
          {selectedCity.streets.map((street) => (
            <GlobeLabel
              key={street.id}
              label={street.name}
              kind="street"
              position={latLngToVector3(
                selectedCity.lat + street.offsetLatitude,
                selectedCity.lng + street.offsetLongitude,
                3.145,
              )}
              color={selectedCity.color}
            />
          ))}
        </>
      )}
      {cities.length >= 5 && <>
        <AttentionFlow from={cities[3]} to={cities[0]} color="#ff8f62" delay={0.1} />
        <AttentionFlow from={cities[4]} to={cities[0]} color="#a68cff" delay={0.48} />
        <AttentionFlow from={cities[2]} to={cities[1]} color="#6eb7ff" delay={0.72} />
      </>}
    </group>
  );
}

function EarthScene({
  cities,
  selectedCity,
  countryTarget,
  viewTarget,
  viewRevision,
  layer,
  liveCounts = {},
  onSelect,
  onCountrySelect,
  onAgentSelect,
  onDetailChange,
}: {
  cities: City[];
  selectedCity: City;
  countryTarget: CountrySelection | null;
  viewTarget: RegionView | null;
  viewRevision: number;
  layer: Layer;
  liveCounts: Record<string, number>;
  onSelect: (city: City) => void;
  onCountrySelect: (country: CountrySelection) => void;
  onAgentSelect: (city: City, agent: Agent) => void;
  onDetailChange: (level: DetailLevel) => void;
}) {
  const [streetState, setStreetState] = useState<{ cityId: string; center: GeoCenter; viewRevision: number } | null>(null);
  const [globeState, setGlobeState] = useState<{ cityId: string; center: GeoCenter; viewRevision: number } | null>(null);
  const streetCenter = !viewTarget && !countryTarget && streetState?.cityId === selectedCity.id && streetState.viewRevision === viewRevision
    ? streetState.center
    : null;
  const globeOverride = !viewTarget && !countryTarget && globeState?.cityId === selectedCity.id && globeState.viewRevision === viewRevision
    ? globeState.center
    : null;
  const focusLocation = viewTarget ?? countryTarget ?? globeOverride ?? { lat: selectedCity.lat, lng: selectedCity.lng };

  const enterStreetView = useCallback((center: GeoCenter) => {
    if (countryTarget) return;
    setStreetState({ cityId: selectedCity.id, center, viewRevision });
  }, [countryTarget, selectedCity.id, viewRevision]);

  const exitStreetView = useCallback((center: GeoCenter) => {
    setGlobeState({ cityId: selectedCity.id, center, viewRevision });
    setStreetState(null);
  }, [selectedCity.id, viewRevision]);

  const selectActivityCity = useCallback((city: City) => {
    setStreetState(null);
    setGlobeState(null);
    onSelect(city);
  }, [onSelect]);

  const selectActivityCountry = useCallback((country: CountrySelection) => {
    setStreetState(null);
    setGlobeState(null);
    onCountrySelect(country);
  }, [onCountrySelect]);

  return (
    <>
      <div className={`earthCanvasLayer ${streetCenter ? "streetMode" : ""}`}>
        <Canvas
          camera={{ position: [0, 0.1, 6.3], fov: 38, near: 0.1, far: 70 }}
          dpr={[1, 1.7]}
          gl={{ alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}
        >
          <ambientLight intensity={0.24} color="#7ab9e8" />
          <directionalLight position={[5, 3, 5]} intensity={2.35} color="#d9edff" />
          <directionalLight position={[-4, -2, 1]} intensity={0.44} color="#6d47ff" />
          <Stars radius={36} depth={18} count={1200} factor={1.5} saturation={0.25} fade speed={0.18} />
          <Suspense fallback={null}>
            <Earth
              cities={cities}
              selectedCity={selectedCity}
              selectedCountryKey={countryTarget?.key ?? null}
              focusLocation={focusLocation}
              focusDistance={viewTarget?.distance ?? countryTarget?.distance ?? null}
              focusRevision={viewRevision}
              layer={layer}
              liveCounts={liveCounts}
              onSelect={selectActivityCity}
              onCountrySelect={selectActivityCountry}
              onAgentSelect={onAgentSelect}
              onDetailChange={onDetailChange}
              onStreetEnter={enterStreetView}
            />
          </Suspense>
          <OrbitControls
            makeDefault
            enableRotate={false}
            enablePan={false}
            enableZoom
            enableDamping
            dampingFactor={0.1}
            zoomSpeed={0.7}
            minDistance={3.65}
            maxDistance={10}
          />
          <fog attach="fog" args={["#020508", 11, 42]} />
        </Canvas>
      </div>
      {streetCenter && <StreetMap center={streetCenter} onExit={exitStreetView} />}
    </>
  );
}

function ProfilePanel({ signal, city, onClose }: { signal: Signal; city: City; onClose: () => void }) {
  const statusColor = signalStatusColor(signal.status);
  return (
    <motion.aside
      className="profilePanel glassPanel"
      initial={{ opacity: 0, x: 28, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      aria-label={`${signal.name} profile`}
    >
      <button className="iconButton profileClose" onClick={onClose} aria-label="Close profile"><X size={16} /></button>
      <div className={`avatarMark ${signal.type === "AI" ? "aiAvatar" : "humanAvatar"}`}>
        {signal.type === "AI" ? <Bot size={24} /> : signal.name.slice(0, 1)}
      </div>
      <div className="profileIdentity">
        <span className="eyebrow">{signal.type} · {city.name}</span>
        <h2>{signal.name}</h2>
        <span className="statusLine"><i style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} /> {signal.status}</span>
      </div>
      <div className="profileNow">
        <span>RIGHT NOW</span>
        <strong>{signal.activity}</strong>
        <p>{signal.topic}</p>
        <small>{signal.detail}</small>
      </div>
      <div className="timeline">
        <span className="eyebrow">RECENT SIGNAL</span>
        <div><i /><span><b>Today</b> Joined the global attention field</span></div>
        <div><i /><span><b>Earlier</b> Started exploring {signal.topic}</span></div>
      </div>
    </motion.aside>
  );
}

function signalStatusColor(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("offline")) return agentStatusColors.offline;
  if (normalized.includes("idle") || normalized.includes("away")) return agentStatusColors.idle;
  if (normalized.includes("working") || normalized.includes("autonomous")) return agentStatusColors.working;
  return agentStatusColors.online;
}

function atlasAgentToSignal(agent: Agent): Signal {
  return {
    id: `agent-${agent.id}`,
    name: agent.name,
    type: "AI",
    activity: agent.activity,
    topic: agent.topic,
    status: `${agent.status.slice(0, 1).toUpperCase()}${agent.status.slice(1)} · ${agent.runtime}`,
    detail: `${agent.detail} · ${agent.packageName}@${agent.packageVersion}`,
  };
}

function atlasPresenceToSignal(presence: AtlasPresence): Signal {
  return {
    id: `live-${presence.entityKind}-${presence.id}`,
    name: presence.displayName,
    type: presence.entityKind === "ai" ? "AI" : "Human",
    activity: presence.activity,
    topic: presence.topic,
    status: presence.controlState,
    detail: presence.detail,
  };
}

function CountryProfileCard({
  country,
  cities,
  liveCounts,
  onCitySelect,
  onTopicSelect,
  onCollapse,
}: {
  country: CountrySelection;
  cities: City[];
  liveCounts: Record<string, number>;
  onCitySelect: (city: City) => void;
  onTopicSelect: (topic: string) => void;
  onCollapse: () => void;
}) {
  const countryCities = useMemo(
    () => cities.filter((city) => countryEnergyKey(city.country) === country.key),
    [cities, country.key],
  );
  const countryAgents = useMemo(() => countryCities.flatMap((city) => city.agents), [countryCities]);
  const seededLiveAgents = countryAgents.filter((agent) => agent.status !== "offline").length;
  const connectedLiveAgents = countryCities.reduce((total, city) => total + (liveCounts[city.name] ?? 0), 0);
  const countryLiveAgents = seededLiveAgents + connectedLiveAgents;
  const density = agentDensityLevel(countryLiveAgents);
  const densityBarWidth = agentDensityBarWidth(density);
  const workingAgents = countryAgents.filter((agent) => agent.status === "working").length;
  const countryTopics = useMemo(() => {
    const totals = new Map<string, { topic: string; events: number; energy: number }>();
    countryCities.forEach((city) => {
      const topics = city.hotTopics.length
        ? city.hotTopics
        : city.topics.map((topic) => ({ topic, events: 0, energy: 0 }));
      topics.forEach((topic) => {
        const current = totals.get(topic.topic) ?? { topic: topic.topic, events: 0, energy: 0 };
        current.events += topic.events;
        current.energy += topic.energy;
        totals.set(topic.topic, current);
      });
    });
    return [...totals.values()]
      .sort((left, right) => right.energy - left.energy || right.events - left.events)
      .slice(0, 4);
  }, [countryCities]);

  return (
    <aside className="citySignal countrySignal glassPanel" aria-live="polite" aria-label={`${country.name} country profile`}>
      <div className="signalHeader countrySignalHeader">
        <div>
          <span className="eyebrow">COUNTRY PROFILE · LIVE NETWORK</span>
          <h1>{country.name}</h1>
        </div>
        <div className="signalHeaderActions">
          <Globe2 size={18} />
          <button type="button" className="panelCollapseButton" onClick={onCollapse} aria-label="Collapse Live Agent Network" aria-expanded="true" title="Collapse Live Agent Network">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <p className="countryCoordinateLine">
        Centered at {Math.abs(country.lat).toFixed(1)}°{country.lat >= 0 ? "N" : "S"} · {Math.abs(country.lng).toFixed(1)}°{country.lng >= 0 ? "E" : "W"}
      </p>
      <div className="activityTotal countryActivityTotal">
        <span style={{ background: density.color, boxShadow: `0 0 11px ${density.color}` }} />
        <strong>{countryLiveAgents.toLocaleString()}</strong>
        <small>live agents</small>
        <em>{workingAgents} working</em>
      </div>
      <div className="energyMeter" aria-label={`${country.name} energy level ${density.level}, ${countryLiveAgents} live agents`}>
        <div><span>ENERGY LEVEL</span><b style={{ color: density.color }}>LEVEL {density.level} · {density.label}</b></div>
        <div className="energyMeterTrack" aria-hidden="true"><i style={{ width: `${densityBarWidth}%`, background: density.color, boxShadow: `0 0 12px ${density.color}` }} /></div>
        <small>Calculated directly from the number of agents currently live in this country</small>
      </div>
      <div className="countrySummaryGrid" aria-label={`${country.name} network summary`}>
        <span><b>{countryCities.length}</b><small>Cities</small></span>
        <span><b>{(countryAgents.length + connectedLiveAgents).toLocaleString()}</b><small>Observed</small></span>
        <span><b>{countryLiveAgents.toLocaleString()}</b><small>Live</small></span>
      </div>
      {countryAgents.length || connectedLiveAgents ? (
        <>
          <div className="countrySectionLabel">HOT TOPICS · 24H</div>
          <div className="topicList">
            {countryTopics.map((topic, index) => (
              <button key={topic.topic} onClick={() => onTopicSelect(topic.topic)}>
                <span>0{index + 1}</span>{topic.topic}<small>{topic.events || "LIVE"}</small><ChevronRight size={13} />
              </button>
            ))}
          </div>
          <div className="countrySectionLabel">OBSERVED CITIES</div>
          <div className="countryCityList">
            {countryCities.map((city) => {
              const connectedCityAgents = liveCounts[city.name] ?? 0;
              const cityLiveAgents = city.agents.filter((agent) => agent.status !== "offline").length + connectedCityAgents;
              const cityObservedAgents = city.agents.length + connectedCityAgents;
              const cityDensity = agentDensityLevel(cityLiveAgents);
              return (
                <button key={city.id} onClick={() => onCitySelect(city)}>
                  <i style={{ background: cityDensity.color, boxShadow: `0 0 8px ${cityDensity.color}` }} />
                  <span><b>{city.name}</b><small>{city.category} · {cityObservedAgents} observed</small></span>
                  <em>{cityLiveAgents} live</em>
                  <ChevronRight size={13} />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="countryNoSignal">
          <Radio size={18} />
          <span><b>Awaiting Atlas signals</b><small>No connected agents are reporting from this country yet.</small></span>
        </div>
      )}
    </aside>
  );
}

function PresenceStudio({
  cities,
  draft,
  email,
  installations,
  configured,
  busy,
  error,
  onSave,
  onSignOut,
  onClose,
}: {
  cities: City[];
  draft: PresenceDraft;
  email: string | null;
  installations: AtlasOwnedAgent[];
  configured: boolean;
  busy: boolean;
  error: string | null;
  onSave: (draft: PresenceDraft) => Promise<boolean>;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(draft);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const syncDraft = window.setTimeout(() => setForm(draft), 0);
    return () => window.clearTimeout(syncDraft);
  }, [draft]);

  const update = <Key extends keyof PresenceDraft>(key: Key, value: PresenceDraft[Key]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(await onSave(form));
  };

  return (
    <motion.form
      className="presenceStudio glassPanel"
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.98 }}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={submit}
      aria-label="Edit your Atlas presence"
    >
      <header className="presenceHeader">
        <div>
          <span className="eyebrow"><Radio size={11} /> ATLAS IDENTITY &amp; AGENT NETWORK</span>
          <h2>Your profile in the living world.</h2>
          <p>Your human signal and every approved agent belong to one private account.</p>
        </div>
        <button type="button" className="iconButton" onClick={onClose} aria-label="Close presence editor"><X size={16} /></button>
      </header>

      <div className="presenceGrid">
        <section className="presenceColumn humanPresence">
          <div className="presenceSectionTitle"><CircleUserRound size={16} /><span><b>HUMAN SIGNAL</b><small>Your public identity and current focus</small></span></div>
          <label><span>Display name</span><input value={form.displayName} onChange={(event) => update("displayName", event.target.value)} required /></label>
          <label><span>Location</span><select value={form.city} onChange={(event) => {
            const nextCity = cities.find((city) => city.name === event.target.value) ?? cities[0];
            setForm((current) => ({ ...current, city: nextCity.name, latitude: nextCity.lat, longitude: nextCity.lng }));
            setSaved(false);
          }}>{cities.map((city) => <option key={city.name} value={city.name}>{city.name}, {city.country}</option>)}</select></label>
          <div className="fieldPair">
            <label><span>Right now</span><select value={form.activity} onChange={(event) => update("activity", event.target.value as PresenceDraft["activity"])}>{presenceActivities.map((activity) => <option key={activity}>{activity}</option>)}</select></label>
            <label><span>Availability</span><select value={form.status} onChange={(event) => update("status", event.target.value as PresenceDraft["status"])}><option>Online</option><option>Focused</option><option>Away</option><option>Offline</option></select></label>
          </div>
          <label><span>Topic</span><input value={form.topic} onChange={(event) => update("topic", event.target.value)} placeholder="What holds your attention?" /></label>
          <label><span>Control state</span><select value={form.controlState} onChange={(event) => update("controlState", event.target.value as PresenceDraft["controlState"])}>{controlStates.map((state) => <option key={state}>{state}</option>)}</select></label>
          <label><span>Bio</span><textarea value={form.bio} onChange={(event) => update("bio", event.target.value)} rows={2} /></label>
          <label><span>Interests <small>comma separated</small></span><input value={form.interests} onChange={(event) => update("interests", event.target.value)} /></label>
        </section>

        <section className="presenceColumn aiPresence">
          <div className="presenceSectionTitle"><Bot size={16} /><span><b>CONNECTED AI</b><small>The agent working alongside you</small></span></div>
          <label><span>AI name</span><input value={form.aiName} onChange={(event) => update("aiName", event.target.value)} required /></label>
          <label><span>Mission</span><textarea value={form.aiMission} onChange={(event) => update("aiMission", event.target.value)} rows={2} /></label>
          <div className="fieldPair">
            <label><span>State</span><select value={form.aiState} onChange={(event) => update("aiState", event.target.value as PresenceDraft["aiState"])}>{presenceActivities.map((activity) => <option key={activity}>{activity}</option>)}</select></label>
            <label className="autonomyToggle"><span>Autonomy</span><button type="button" className={form.aiAutonomous ? "active" : ""} onClick={() => update("aiAutonomous", !form.aiAutonomous)}><i />{form.aiAutonomous ? "Autonomous" : "Assisted"}</button></label>
          </div>
          <label><span>Current task</span><input value={form.aiTask} onChange={(event) => update("aiTask", event.target.value)} /></label>
          <label><span>Current topic</span><input value={form.aiTopic} onChange={(event) => update("aiTopic", event.target.value)} /></label>
          <label><span>Capabilities <small>comma separated</small></span><input value={form.aiCapabilities} onChange={(event) => update("aiCapabilities", event.target.value)} /></label>
          <div className="signalPreview">
            <span>LIVE SIGNAL PREVIEW</span>
            <div><i /><b>{form.aiName || "Connected AI"}</b><small>{form.aiState} · {form.aiTopic || "No topic"}</small></div>
            <p>{form.aiTask || "No active task"}</p>
          </div>
        </section>
      </div>

      <section className="ownedAgentCollection">
        <header>
          <div><Bot size={15} /><span><b>MY LINKED AGENTS</b><small>{email ?? "Local preview"}</small></span></div>
          <em>{installations.length} {installations.length === 1 ? "AGENT" : "AGENTS"}</em>
        </header>
        {installations.length ? (
          <div className="ownedAgentList">
            {installations.map((agent) => {
              const active = agent.connectionState === "live";
              const state = agent.connectionState;
              return (
                <article key={agent.id}>
                  <span className={`ownedAgentRuntime ${active ? "active" : ""}`}><Bot size={14} /></span>
                  <div><b>{agent.displayName}</b><small>{agent.runtime} {agent.runtimeVersion !== "unknown" ? `· ${agent.runtimeVersion}` : ""} · {agent.cityId.replaceAll("-", " ")}</small></div>
                  <em className={state}>{state}</em>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="ownedAgentEmpty"><Bot size={17} /><span><b>No device agents linked yet</b><small>Run <code>npx @atlas-ai/sdk setup codex</code> from an agent terminal.</small></span></div>
        )}
      </section>

      <footer className="presenceFooter">
        <button type="button" className="signOutButton" onClick={() => void onSignOut()}><LogOut size={14} /> Disconnect</button>
        <div className="presenceSaveState">
          <span className={error ? "error" : saved ? "saved" : ""}>{error ?? (saved ? "Signal broadcast" : configured ? "Supabase realtime ready" : "Local demo mode")}</span>
          <button type="submit" className="broadcastButton" disabled={busy}><Save size={14} /> {busy ? "Broadcasting…" : "Broadcast presence"}</button>
        </div>
      </footer>
    </motion.form>
  );
}

function AtlasWorldExperience({ cities, liveAgentHistory }: { cities: City[]; liveAgentHistory: AtlasDailyLiveAgent[] }) {
  const presence = useAtlasPresence();
  const [selectedCityId, setSelectedCityId] = useState(cities[0].id);
  const [selectedCountry, setSelectedCountry] = useState<CountrySelection | null>(null);
  const [regionViewId, setRegionViewId] = useState<RegionViewId | null>(null);
  const [regionViewRevision, setRegionViewRevision] = useState(0);
  const [layer, setLayer] = useState<Layer>("Attention");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchSelectionIndex, setSearchSelectionIndex] = useState(0);
  const [profile, setProfile] = useState<Signal | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [pulseCollapsed, setPulseCollapsed] = useState(false);
  const [networkCollapsed, setNetworkCollapsed] = useState(false);
  const [clock, setClock] = useState("--:-- SGT");
  const searchRef = useRef<HTMLInputElement>(null);
  const joined = presence.connected;
  const selectedCity = cities.find((city) => city.id === selectedCityId) ?? cities[0];
  const activeRegionView = regionViews.find((view) => view.id === regionViewId) ?? null;
  const activeFocusLocation = activeRegionView ?? selectedCountry ?? selectedCity;
  const visiblePresenceFeed = useMemo(
    () => presence.configured || joined ? presence.presenceFeed : [],
    [joined, presence.configured, presence.presenceFeed],
  );

  const liveCounts = useMemo(() => visiblePresenceFeed.reduce<Record<string, number>>((counts, item) => {
    if (item.entityKind !== "ai" || item.status === "Offline" || item.activity === "Offline") return counts;
    counts[item.city] = (counts[item.city] ?? 0) + 1;
    return counts;
  }, {}), [visiblePresenceFeed]);

  const seededAgents = useMemo(() => cities.flatMap((city) => city.agents), [cities]);
  const seededLiveAgents = seededAgents.filter((agent) => agent.status !== "offline");
  const liveAiAgents = visiblePresenceFeed.filter((item) => item.entityKind === "ai");
  const connectedLiveAiAgents = liveAiAgents.filter((agent) => agent.status !== "Offline" && agent.activity !== "Offline");
  const worldLiveAgentCount = seededLiveAgents.length + connectedLiveAiAgents.length;
  const worldAgentCount = seededAgents.length + liveAiAgents.length;
  const workingAgentCount = seededAgents.filter((agent) => agent.status === "working").length
    + liveAiAgents.filter((agent) => !["Idle", "Offline", "Sleeping"].includes(agent.activity)).length;
  const onlineAgentCount = seededAgents.filter((agent) => agent.status === "online").length
    + liveAiAgents.filter((agent) => agent.status !== "Offline").length;
  const selectedWorkingAgents = selectedCity.agents.filter((agent) => agent.status === "working").length;
  const selectedActiveAgents = selectedCity.agents.filter((agent) => agent.status !== "offline").length;
  const selectedConnectedAgents = liveCounts[selectedCity.name] ?? 0;
  const selectedLiveAgents = selectedActiveAgents + selectedConnectedAgents;
  const selectedObservedAgents = selectedCity.agents.length + selectedConnectedAgents;
  const selectedDensity = agentDensityLevel(selectedLiveAgents);
  const selectedDensityBarWidth = agentDensityBarWidth(selectedDensity);
  const selectedHotTopics = selectedCity.hotTopics.length
    ? selectedCity.hotTopics
    : selectedCity.topics.map((topic) => ({ topic, events: 0, energy: 0 }));
  const pulseTrend = liveAgentHistory.map((day, index) => ({
    ...day,
    count: day.count + (index === liveAgentHistory.length - 1 ? connectedLiveAiAgents.length : 0),
  }));
  const pulsePeak = Math.max(...pulseTrend.map((day) => day.count), 1);
  const pulseBars = pulseTrend.map((day) => ({
    ...day,
    height: 12 + Math.round((day.count / pulsePeak) * 88),
  }));
  const latestPulseCount = pulseTrend.at(-1)?.count ?? 0;

  const openSearch = useCallback((nextQuery?: string) => {
    if (nextQuery !== undefined) setQuery(nextQuery);
    setSearchSelectionIndex(0);
    setSearchOpen(true);
    window.setTimeout(() => searchRef.current?.focus(), 40);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setJoinOpen(false);
        setPresenceOpen(false);
        setProfile(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  useEffect(() => {
    const updateClock = () => {
      const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Singapore",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      setClock(`${time} SGT`);
    };
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const searchResults = useMemo<AtlasSearchResult[]>(() => {
    const needle = normalizeLabelName(query.trim());
    const matchesSearch = (...values: Array<string | number>) => (
      !needle || normalizeLabelName(values.join(" ")).includes(needle)
    );
    const countryResults = needle
      ? atlasLabelData.countries
        .filter((country) => matchesSearch(country.name, country.id))
        .sort((left, right) => {
          const leftName = normalizeLabelName(left.name);
          const rightName = normalizeLabelName(right.name);
          const leftRank = leftName === needle ? 0 : leftName.startsWith(needle) ? 1 : 2;
          const rightRank = rightName === needle ? 0 : rightName.startsWith(needle) ? 1 : 2;
          return leftRank - rightRank || left.rank - right.rank || left.name.localeCompare(right.name);
        })
        .slice(0, 5)
        .map((country): AtlasSearchResult => ({
          id: `country:${country.id}`,
          kind: "country",
          title: country.name,
          subtitle: "Country · focus globe and open live network",
          country: {
            name: country.name,
            key: countryEnergyKey(country.name),
            lat: country.lat,
            lng: country.lng,
            distance: 6.15,
          },
        }))
      : [];
    const liveResults = visiblePresenceFeed
      .filter((item) => matchesSearch(item.displayName, item.entityKind, item.activity, item.topic, item.city))
      .slice(0, 3)
      .map((item): AtlasSearchResult => {
        const city = cities.find((candidate) => normalizeLabelName(candidate.name) === normalizeLabelName(item.city)) ?? cities[0];
        const signal = atlasPresenceToSignal(item);
        return { id: `live:${item.id}`, kind: "signal", title: signal.name, subtitle: `${signal.type} · ${signal.activity} · ${item.city} · LIVE`, city, signal };
      });
    const cityResults = cities
      .filter((city) => matchesSearch(city.name, city.country, city.category, ...city.topics, ...city.hotTopics.map((topic) => topic.topic)))
      .slice(0, 4)
      .map((city): AtlasSearchResult => ({ id: `city:${city.id}`, kind: "city", title: city.name, subtitle: `${city.country} · city · ${city.agentEnergy} agent energy`, city }));
    const agentResults = cities
      .flatMap((city) => city.agents.map((agent) => ({ city, agent })))
      .filter(({ city, agent }) => matchesSearch(agent.name, agent.runtime, agent.status, agent.activity, agent.topic, city.name, city.country))
      .slice(0, 4)
      .map(({ city, agent }): AtlasSearchResult => ({
        id: `agent:${agent.id}`,
        kind: "signal",
        title: agent.name,
        subtitle: `${agent.status.toUpperCase()} · ${agent.activity} · ${city.name}`,
        city,
        signal: atlasAgentToSignal(agent),
      }));
    const signalResults = cities
      .flatMap((city) => city.signals.map((signal) => ({ city, signal })))
      .filter(({ signal, city }) => needle && matchesSearch(signal.name, signal.type, signal.activity, signal.topic, city.name))
      .slice(0, 3)
      .map(({ city, signal }): AtlasSearchResult => ({ id: `signal:${signal.id}`, kind: "signal", title: signal.name, subtitle: `${signal.type} · ${signal.activity} · ${city.name}`, city, signal }));
    return [...countryResults, ...cityResults, ...liveResults, ...agentResults, ...signalResults].slice(0, 8);
  }, [cities, query, visiblePresenceFeed]);

  const focusCity = useCallback((city: City) => {
    setRegionViewRevision((revision) => revision + 1);
    setRegionViewId(null);
    setSelectedCountry(null);
    setSelectedCityId(city.id);
    setProfile(null);
  }, []);

  const focusCountry = useCallback((country: CountrySelection) => {
    setRegionViewRevision((revision) => revision + 1);
    setRegionViewId(null);
    setSelectedCountry(country);
    setProfile(null);
  }, []);

  const chooseRegionView = (nextViewId: RegionViewId) => {
    setRegionViewRevision((revision) => revision + 1);
    setRegionViewId(nextViewId);
    setSelectedCountry(null);
    const nextView = regionViews.find((view) => view.id === nextViewId);
    if (!nextView) return;
    const anchorCity = cities.find((city) => city.id === nextView.anchorCityId);
    if (anchorCity) setSelectedCityId(anchorCity.id);
  };

  const chooseResult = (result: AtlasSearchResult) => {
    setSearchOpen(false);
    setQuery("");
    setSearchSelectionIndex(0);
    setNetworkCollapsed(false);
    if (result.kind === "country") {
      focusCountry(result.country);
      return;
    }
    focusCity(result.city);
    if (result.kind === "signal") setProfile(result.signal);
  };

  const chooseAgent = useCallback((city: City, agent: Agent) => {
    focusCity(city);
    setProfile(atlasAgentToSignal(agent));
  }, [focusCity]);

  const beginSignIn = async (provider: "github" | "google") => {
    await presence.signIn(provider);
    if (!presence.configured) {
      setJoinOpen(false);
      setPresenceOpen(true);
    }
  };

  return (
    <main className="atlasShell">
      <div className="spaceGlow" />
      <section className="globeStage" aria-label="Interactive living Earth. Drag to rotate; scroll or pinch to zoom.">
        <EarthScene cities={cities} selectedCity={selectedCity} countryTarget={selectedCountry} viewTarget={activeRegionView} viewRevision={regionViewRevision} layer={layer} liveCounts={liveCounts} onSelect={focusCity} onCountrySelect={focusCountry} onAgentSelect={chooseAgent} onDetailChange={setDetailLevel} />
      </section>

      <header className="topBar">
        <button className="brand" aria-label="Atlas home" onClick={() => focusCity(cities[0])}>
          <span className="atlasGlyph"><i /><i /><i /></span>
          <span>ATLAS</span>
          <small>ALPHA</small>
        </button>
        <nav className="topNav" aria-label="Primary navigation">
          <button className="active">Explore</button>
          <button onClick={() => openSearch()}>Signals</button>
          <button onClick={() => joined ? setPresenceOpen(true) : setJoinOpen(true)}>Presence</button>
        </nav>
        <div className="topActions">
          <span className="liveBadge"><i /> LIVE</span>
          <button className={`joinButton ${joined ? "joined" : ""}`} onClick={() => joined ? setPresenceOpen(true) : setJoinOpen(true)}>
            {joined ? <><Check size={14} /> Connected</> : <>Join Atlas <ArrowUpRight size={14} /></>}
          </button>
        </div>
      </header>

      {pulseCollapsed ? (
        <button
          type="button"
          className="sideCardToggle sideCardToggle--pulse glassPanel"
          onClick={() => setPulseCollapsed(false)}
          aria-label="Expand Agent Pulse"
          aria-expanded="false"
          title="Expand Agent Pulse"
        >
          <Radio size={17} />
          <i />
        </button>
      ) : (
      <aside className="worldPulse glassPanel" aria-label="Global live activity">
        <div className="panelTitle">
          <Globe2 size={14} /><span>AGENT PULSE · NOW</span><i />
          <button type="button" className="panelCollapseButton" onClick={() => setPulseCollapsed(true)} aria-label="Collapse Agent Pulse" aria-expanded="true" title="Collapse Agent Pulse">
            <ChevronLeft size={14} />
          </button>
        </div>
        <div className="pulseOverview">
          <div className="pulseTotal">
            <strong>{worldLiveAgentCount.toLocaleString()}</strong>
            <small>live agents worldwide</small>
          </div>
          <div className="pulseStats">
            <span><Bot size={13} /><b>{worldAgentCount}</b> Agents</span>
            <span><Zap size={13} /><b>{workingAgentCount}</b> Working</span>
            <span><Radio size={13} /><b>{onlineAgentCount}</b> Online</span>
            <span><Globe2 size={13} /><b>{cities.length}</b> Cities</span>
          </div>
          <div className="pulseChartHeader"><span>7D LIVE AGENTS</span><b>{latestPulseCount} today</b></div>
          <div className="pulseChart" role="img" aria-label="Distinct agents reporting live activity on each of the past seven days">
            {pulseBars.map((day) => (
              <div className="pulseChartDay" key={day.date} title={`${day.label}: ${day.count} live agents`}>
                <b>{day.count}</b>
                <span><i style={{ height: `${day.height}%` }} /></span>
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="pulseLegend" aria-label="Map legend">
          <div className="legendHeading"><span>MAP LEGEND</span><small>LIVE</small></div>
          <div className="energyScale">
            <span>LIVE AGENTS PER COUNTRY</span>
            <p>Energy level = agents live now</p>
            <div className="energyLevelLegend">
              {agentDensityLevels.map((density) => (
                <small key={density.level}><i style={{ background: density.color, boxShadow: `0 0 7px ${density.color}` }} /><b>{density.label}</b></small>
              ))}
            </div>
          </div>
          <div className="statusLegend">
            <span>AGENT STATUS</span>
            <div>
              <small><i style={{ background: agentStatusColors.working, boxShadow: `0 0 7px ${agentStatusColors.working}` }} />Working</small>
              <small><i style={{ background: agentStatusColors.online, boxShadow: `0 0 7px ${agentStatusColors.online}` }} />Online</small>
              <small><i style={{ background: agentStatusColors.idle, boxShadow: `0 0 7px ${agentStatusColors.idle}` }} />Idle</small>
              <small><i style={{ background: agentStatusColors.offline, boxShadow: `0 0 7px ${agentStatusColors.offline}` }} />Offline</small>
            </div>
          </div>
        </div>
      </aside>
      )}

      {networkCollapsed ? (
        <button
          type="button"
          className="sideCardToggle sideCardToggle--network glassPanel"
          onClick={() => setNetworkCollapsed(false)}
          aria-label="Expand Live Agent Network"
          aria-expanded="false"
          title="Expand Live Agent Network"
        >
          <Bot size={17} />
          <i />
        </button>
      ) : selectedCountry ? (
        <CountryProfileCard
          country={selectedCountry}
          cities={cities}
          liveCounts={liveCounts}
          onCollapse={() => setNetworkCollapsed(true)}
          onCitySelect={focusCity}
          onTopicSelect={(topic) => {
            openSearch(topic);
          }}
        />
      ) : (
      <aside className="citySignal glassPanel" aria-live="polite">
        <div className="signalHeader">
          <div>
            <span className="eyebrow">LIVE AGENT NETWORK · {selectedCity.country.toUpperCase()}</span>
            <h1>{selectedCity.name}</h1>
          </div>
          <div className="signalHeaderActions">
            <LocateFixed size={18} />
            <button type="button" className="panelCollapseButton" onClick={() => setNetworkCollapsed(true)} aria-label="Collapse Live Agent Network" aria-expanded="true" title="Collapse Live Agent Network">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="activityTotal">
          <span style={{ background: selectedDensity.color, boxShadow: `0 0 11px ${selectedDensity.color}` }} />
          <strong>{selectedLiveAgents.toLocaleString()}</strong>
          <small>live agents</small>
          <em>{selectedWorkingAgents} working</em>
        </div>
        <div className="energyMeter" aria-label={`${selectedCity.name} energy level ${selectedDensity.level}, ${selectedLiveAgents} live agents`}>
          <div><span>ENERGY LEVEL</span><b style={{ color: selectedDensity.color }}>LEVEL {selectedDensity.level} · {selectedDensity.label}</b></div>
          <div className="energyMeterTrack" aria-hidden="true"><i style={{ width: `${selectedDensityBarWidth}%`, background: selectedDensity.color, boxShadow: `0 0 12px ${selectedDensity.color}` }} /></div>
          <small>Calculated directly from the number of agents currently live in this city</small>
        </div>
        <p className="categoryLine">{selectedLiveAgents} live · {selectedObservedAgents} observed · right now</p>
        <div className="topicList">
          {selectedHotTopics.map((topic, index) => (
            <button key={topic.topic} onClick={() => openSearch(topic.topic)}>
              <span>0{index + 1}</span>{topic.topic}<small>{topic.events || "LIVE"}</small><ChevronRight size={13} />
            </button>
          ))}
        </div>
        <div className="agentRoster" aria-label={`${selectedCity.name} agents`}>
          {selectedCity.agents.map((agent) => (
            <button key={agent.id} onClick={() => chooseAgent(selectedCity, agent)} aria-label={`Open ${agent.name} agent signal`}>
              <i style={{ background: agentStatusColors[agent.status], boxShadow: `0 0 8px ${agentStatusColors[agent.status]}` }} />
              <span><b>{agent.name}</b><small>{agent.activity} · {agent.topic}</small></span>
              <em>{agent.status}</em>
            </button>
          ))}
        </div>
        <button className="viewSignals agentSearchLink" onClick={() => openSearch(selectedCity.name)}>View all city signals <ArrowUpRight size={12} /></button>
      </aside>
      )}

      <div className="lodIndicator glassPanel" aria-live="polite">
        <span>L0{detailLevel}</span>
        <div>
          <b>{detailLabels[detailLevel].title}</b>
          <small>{detailLabels[detailLevel].note}</small>
        </div>
      </div>

      <div className="dragHint"><Move size={13} /><span>Drag to rotate · Scroll or pinch to zoom</span></div>

      <div className="bottomDock">
        <div className="leftDockControls">
          <div className="regionControl glassPanel">
            <span><Globe2 size={12} /> VIEW</span>
            <div className="regionTabs" role="group" aria-label="Region views">
              {regionViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  className={regionViewId === view.id ? "active" : ""}
                  aria-pressed={regionViewId === view.id}
                  onClick={() => chooseRegionView(view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>

          <div className="layerControl glassPanel" role="group" aria-label="Attention layer">
            <span>LAYER</span>
            {layers.map((item) => (
              <button key={item} className={layer === item ? "active" : ""} onClick={() => setLayer(item)}>
                <i style={{ background: layerColors[item] }} />{item}
              </button>
            ))}
          </div>
        </div>

        <button className="searchBar glassPanel" onClick={() => openSearch()}>
          <Search size={17} />
          <span>Search the living world</span>
          <kbd><Command size={11} /> K</kbd>
        </button>
      </div>

      <div className="coordinates">
        {Math.abs(activeFocusLocation.lat).toFixed(2)}°{activeFocusLocation.lat >= 0 ? "N" : "S"} · {Math.abs(activeFocusLocation.lng).toFixed(2)}°{activeFocusLocation.lng >= 0 ? "E" : "W"}
        <span /> {clock}
      </div>

      <AnimatePresence>
        {profile && <ProfilePanel signal={profile} city={selectedCity} onClose={() => setProfile(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && (
          <motion.div className="modalScrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setSearchOpen(false)}>
            <motion.section className="searchDialog glassPanel" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} onMouseDown={(event) => event.stopPropagation()} aria-label="Search Atlas">
              <div className="searchInputRow">
                <Search size={19} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSearchSelectionIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setSearchSelectionIndex((index) => searchResults.length ? (index + 1) % searchResults.length : 0);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setSearchSelectionIndex((index) => searchResults.length ? (index - 1 + searchResults.length) % searchResults.length : 0);
                    } else if (event.key === "Enter") {
                      const result = searchResults[searchSelectionIndex] ?? searchResults[0];
                      if (result) {
                        event.preventDefault();
                        chooseResult(result);
                      }
                    }
                  }}
                  placeholder="Countries, cities, people, AI or topics…"
                  aria-label="Search countries, cities, people, AI or topics"
                />
                <button onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={16} /></button>
              </div>
              <div className="searchMeta"><span>{query ? `RESULTS FOR “${query.toUpperCase()}”` : "TRENDING ACROSS EARTH"}</span><small>{searchResults.length} results</small></div>
              <div className="searchResults">
                {searchResults.length ? searchResults.map((result, index) => (
                  <button
                    key={result.id}
                    className={index === searchSelectionIndex ? "active" : ""}
                    onMouseEnter={() => setSearchSelectionIndex(index)}
                    onClick={() => chooseResult(result)}
                  >
                    <span className={`resultIcon ${result.kind === "signal" && result.signal.type === "AI" ? "ai" : ""}`}>
                      {result.kind === "country" ? <Globe2 size={15} /> : result.kind === "city" ? <LocateFixed size={15} /> : result.signal.type === "AI" ? <Bot size={15} /> : <CircleUserRound size={15} />}
                    </span>
                    <span><b>{result.title}</b><small>{result.subtitle}</small></span>
                    <ChevronRight size={15} />
                  </button>
                )) : <div className="emptySearch"><Sparkles size={18} /><span>No result yet. Try a country, city, agent or topic.</span></div>}
              </div>
              <div className="searchFooter"><span><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>ENTER</kbd> focus</span><span><kbd>ESC</kbd> close</span></div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {presenceOpen && (
          <motion.div className="modalScrim presenceScrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setPresenceOpen(false)}>
            <PresenceStudio
              cities={cities}
              draft={presence.draft}
              email={presence.session?.user.email ?? null}
              installations={presence.installations}
              configured={presence.configured}
              busy={presence.busy}
              error={presence.error}
              onSave={presence.savePresence}
              onSignOut={async () => {
                await presence.signOut();
                setPresenceOpen(false);
              }}
              onClose={() => setPresenceOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {joinOpen && (
          <motion.div className="modalScrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setJoinOpen(false)}>
            <motion.section className="joinDialog glassPanel" initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} onMouseDown={(event) => event.stopPropagation()}>
              <button className="iconButton joinClose" onClick={() => setJoinOpen(false)} aria-label="Close"><X size={16} /></button>
              <span className="joinOrb"><Zap size={23} /></span>
              <span className="eyebrow">ENTER THE LIVING WORLD</span>
              <h2>{joined ? "You’re connected" : "Make your attention visible."}</h2>
              <p>{joined ? "Your human profile and linked agents are ready to broadcast." : "Create your human presence and link your agents to the world."}</p>
              {!joined ? <div className="providerButtons">
                <button disabled={presence.busy} onClick={() => void beginSignIn("github")}><Code2 size={17} /> Continue with GitHub</button>
                <button disabled={presence.busy} onClick={() => void beginSignIn("google")}><span className="googleMark">G</span> Continue with Google</button>
              </div> : <button className="primaryWide" onClick={() => { setJoinOpen(false); setPresenceOpen(true); }}>Edit your presence <ArrowUpRight size={15} /></button>}
              {presence.error && <span className="joinError">{presence.error}</span>}
              <small className="previewNote">{presence.configured ? "Supabase secured · Realtime enabled" : "Local demo mode · Add Supabase keys to persist"}</small>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

export function AtlasExperience() {
  const world = useAtlasWorld();

  if (!world.cities.length) {
    return (
      <main className="atlasShell worldDataGate">
        <div className="spaceGlow" />
        <section className="worldDataCard glassPanel" aria-live="polite">
          <span className="atlasGlyph"><i /><i /><i /></span>
          <span className="eyebrow">ATLAS WORLD DATABASE</span>
          <h1>{world.error ? "The world signal is offline." : "Loading the living world…"}</h1>
          <p>{world.error ?? "Reading cities, agent status, and recent telemetry from Supabase."}</p>
          <div className={`databasePulse ${world.loading ? "loading" : ""}`} aria-hidden="true"><i /><i /><i /><i /><i /></div>
          {world.error && <button onClick={() => void world.reload()}>Retry connection <ArrowUpRight size={14} /></button>}
        </section>
      </main>
    );
  }

  return <AtlasWorldExperience cities={world.cities} liveAgentHistory={world.liveAgentHistory} />;
}
