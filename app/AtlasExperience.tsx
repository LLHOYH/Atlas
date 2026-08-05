"use client";

import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, QuadraticBezierLine, Stars } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import atlasGeoData from "./atlas-geo-data.json";
import atlasLabelData from "./atlas-label-data.json";
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
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
import { AtlasAuthOptions } from "./AtlasAuthOptions";
import {
  useAtlasBoundaries,
  useAtlasCityBoundaries,
  useAtlasPlaces,
  type AtlasBoundaryFeature,
  type AtlasPlace,
} from "../hooks/useAtlasGeography";

const layers = ["Attention", "AI", "Technology", "Travel"] as const;
type Layer = (typeof layers)[number];
type DetailLevel = 1 | 2;

const COUNTRY_FOCUS_DISTANCE = 10.2;

const regionViews = [
  { id: "north-america", label: "North America", lat: 43, lng: -102, distance: COUNTRY_FOCUS_DISTANCE, anchorCityId: "san-francisco" },
  { id: "south-america", label: "South America", lat: -17, lng: -60, distance: COUNTRY_FOCUS_DISTANCE, anchorCityId: "sao-paulo" },
  { id: "europe", label: "Europe", lat: 50, lng: 15, distance: COUNTRY_FOCUS_DISTANCE, anchorCityId: "london" },
  { id: "africa", label: "Africa", lat: 5, lng: 20, distance: COUNTRY_FOCUS_DISTANCE, anchorCityId: "lagos" },
  { id: "asia", label: "Asia", lat: 34, lng: 96, distance: COUNTRY_FOCUS_DISTANCE, anchorCityId: "tokyo" },
  { id: "oceania", label: "Oceania", lat: -24, lng: 140, distance: COUNTRY_FOCUS_DISTANCE, anchorCityId: "sydney" },
] as const;

type RegionViewId = (typeof regionViews)[number]["id"];
type RegionView = (typeof regionViews)[number];

const detailLabels: Record<DetailLevel, { title: string; note: string }> = {
  1: { title: "COUNTRY", note: "National agent energy" },
  2: { title: "CITY", note: "Regions, districts & city activity" },
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

type LabelKind = "country" | "region" | "city";
type GeoCenter = { lat: number; lng: number };
type CountrySelection = GeoCenter & { name: string; key: string; distance: number };
type BoundaryKind = "region" | "district" | "localadmin" | "city";
type CityAreaSelection = GeoCenter & {
  name: string;
  countryKey: string;
  countryName: string;
  cityId?: string;
  boundaryKind?: BoundaryKind;
};
type GlobeAgentEntry = {
  city: City;
  agent: Agent;
};
type AtlasSearchResult =
  | { id: string; kind: "country"; title: string; subtitle: string; country: CountrySelection }
  | { id: string; kind: "city"; title: string; subtitle: string; city: City }
  | { id: string; kind: "signal"; title: string; subtitle: string; city: City; signal: Signal };

type GeographicLabel = {
  id: string;
  name: string;
  rank: number;
  population: number;
  lat: number;
  lng: number;
  position: THREE.Vector3;
};

const globalCountryLabels: GeographicLabel[] = atlasLabelData.countries.map((label) => ({
  id: label.id,
  name: label.name,
  rank: label.rank,
  population: 0,
  lat: label.lat,
  lng: label.lng,
  position: latLngToVector3(label.lat, label.lng, 3.105),
}));

function declutterGeographicLabels(
  labels: GeographicLabel[],
  minimumSeparationDegrees: number,
  limit: number,
) {
  const minimumSeparation = THREE.MathUtils.degToRad(minimumSeparationDegrees);
  const selected: GeographicLabel[] = [];
  const ranked = [...labels].sort((left, right) => (
    left.rank - right.rank
    || right.population - left.population
    || left.name.localeCompare(right.name)
  ));

  for (const candidate of ranked) {
    const overlaps = selected.some((existing) => (
      geoDistance([candidate.lng, candidate.lat], [existing.lng, existing.lat]) < minimumSeparation
    ));
    if (overlaps) continue;
    selected.push(candidate);
    if (selected.length >= limit) break;
  }

  return selected;
}

const countryLabelByKey = new Map(atlasLabelData.countries.map((label) => [
  countryEnergyKey(label.name),
  label,
]));

function iso3ForCountryKey(countryKey: string | null) {
  if (!countryKey) return null;
  const id = countryLabelByKey.get(countryKey)?.id.toUpperCase();
  return id && /^[A-Z]{3}$/.test(id) ? id : null;
}

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

const COUNTRY_DETAIL_DISTANCE = 6.15;
const CITY_MAX_DISTANCE = 3.28;
const AGENT_MARKER_RADIUS = 3.105;
const AGENT_MARKER_GEOMETRY_RADIUS = 0.001;
const AGENT_MARKER_SCREEN_RADIUS_PX = 3.25;
const CITY_DEEP_ZOOM_DISTANCE = 3.1085;
const DEEP_ZOOM_PROGRESS_PER_DOUBLING = 20;
const DEEP_ZOOM_PROGRESS_LIMIT = 220;
const CITY_SELECTION_DISTANCE = 3.85;
const GLOBE_MAX_DISTANCE = 11;
const ZOOM_SPEED_MULTIPLIER = 1.5;
const ZOOM_SCROLLS_PER_LEVEL = 16 / ZOOM_SPEED_MULTIPLIER;
const COUNTRY_ZOOM_SPEED = 0.14 * ZOOM_SPEED_MULTIPLIER;
const CITY_ZOOM_SPEED = 0.075 * ZOOM_SPEED_MULTIPLIER;
const RENDERER_RELEASE_DELAY_MS = 600;
const CITY_PROGRESS = 45;
const STREET_MAP_INITIAL_ZOOM = 13.6;
const STREET_MAP_MIN_ZOOM = 11.5;
const STREET_MAP_MAX_ZOOM = 18;
const completeDeepDetailCountries = new Set(["united states"]);

function hasCompleteDeepDetail(countryKey: string) {
  return completeDeepDetailCountries.has(countryKey);
}

function zoomProgressForDistance(distance: number) {
  if (distance < CITY_MAX_DISTANCE) {
    const standardCityGap = CITY_MAX_DISTANCE - AGENT_MARKER_RADIUS;
    const deepCityGap = Math.max(
      distance - AGENT_MARKER_RADIUS,
      CITY_DEEP_ZOOM_DISTANCE - AGENT_MARKER_RADIUS,
    );
    return Math.min(
      100 + Math.log2(standardCityGap / deepCityGap) * DEEP_ZOOM_PROGRESS_PER_DOUBLING,
      DEEP_ZOOM_PROGRESS_LIMIT,
    );
  }

  const thresholds = [GLOBE_MAX_DISTANCE, COUNTRY_DETAIL_DISTANCE, CITY_MAX_DISTANCE];
  const progressStops = [0, CITY_PROGRESS, 100];
  const clampedDistance = THREE.MathUtils.clamp(distance, thresholds.at(-1) ?? distance, thresholds[0]);

  for (let index = 0; index < thresholds.length - 1; index += 1) {
    const far = thresholds[index];
    const near = thresholds[index + 1];
    if (clampedDistance >= near) {
      const localProgress = THREE.MathUtils.inverseLerp(far, near, clampedDistance);
      return THREE.MathUtils.lerp(progressStops[index], progressStops[index + 1], localProgress);
    }
  }

  return progressStops.at(-1) ?? 100;
}

function deepCityMagnificationForProgress(progress: number) {
  if (progress <= 100) return 1;
  return Math.pow(2, (progress - 100) / DEEP_ZOOM_PROGRESS_PER_DOUBLING);
}

function agentMarkerScaleForScreenSize(cameraDistance: number, viewportHeight: number, fovDegrees: number) {
  const worldUnitsPerPixel = 2
    * Math.max(cameraDistance, 0.001)
    * Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2)
    / Math.max(viewportHeight, 1);
  return worldUnitsPerPixel * AGENT_MARKER_SCREEN_RADIUS_PX / AGENT_MARKER_GEOMETRY_RADIUS;
}

function cityBandForProgress(progress: number) {
  if (progress < CITY_PROGRESS) return 0;
  if (progress < 80) return 1;
  return 2;
}

function dragSensitivityForProgress(progress: number) {
  if (progress < CITY_PROGRESS) return 1;
  if (progress > 100) {
    return Math.max(0.012, 0.12 / Math.sqrt(deepCityMagnificationForProgress(progress)));
  }
  const cityProgress = THREE.MathUtils.clamp(
    (progress - CITY_PROGRESS) / (100 - CITY_PROGRESS),
    0,
    1,
  );
  return THREE.MathUtils.lerp(0.72, 0.12, cityProgress);
}

function cityAreaSelectionFromCity(city: City): CityAreaSelection {
  return {
    name: city.name,
    lat: city.lat,
    lng: city.lng,
    countryKey: countryEnergyKey(city.country),
    countryName: city.country,
    cityId: city.id,
    boundaryKind: "city",
  };
}

function GlobeLabel({
  label,
  kind,
  position,
  color,
  onSelect,
  onHoverChange,
}: {
  label: string;
  kind: LabelKind;
  position: THREE.Vector3;
  color?: string;
  onSelect?: () => void;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const anchor = useRef<THREE.Group>(null);
  const content = useRef<HTMLDivElement>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(), []);
  const surfaceNormal = useMemo(() => new THREE.Vector3(), []);
  const towardCamera = useMemo(() => new THREE.Vector3(), []);
  const distanceFactor = kind === "country"
    ? 1.875
    : kind === "city"
      ? 0.9
      : 0.95;

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
        <div
          ref={content}
          className={`mapLabel mapLabel--${kind} ${onSelect ? "mapLabel--interactive" : ""} ${onHoverChange ? "mapLabel--linked" : ""}`}
          style={color ? { color } : undefined}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onPointerEnter={() => onHoverChange?.(true)}
          onPointerLeave={() => onHoverChange?.(false)}
          onClick={(event) => {
            if (!onSelect) return;
            event.stopPropagation();
            onSelect();
          }}
          onKeyDown={(event) => {
            if (!onSelect || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            onSelect();
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

type StreetAgentProperties = {
  id: string;
  name: string;
  runtime: string;
  status: Agent["status"];
  activity: string;
  topic: string;
  energy: number;
  color: string;
};

function streetAgentCollection(agents: Agent[]): GeoJSON.FeatureCollection<GeoJSON.Point, StreetAgentProperties> {
  return {
    type: "FeatureCollection",
    features: agents.map((agent) => ({
      type: "Feature",
      id: agent.id,
      geometry: {
        type: "Point",
        coordinates: [agent.lng, agent.lat],
      },
      properties: {
        id: agent.id,
        name: agent.name,
        runtime: agent.runtime,
        status: agent.status,
        activity: agent.activity,
        topic: agent.topic,
        energy: agent.energy,
        color: agentStatusColors[agent.status],
      },
    })),
  };
}

function StreetMap({
  center,
  city,
  onAgentSelect,
}: {
  center: GeoCenter;
  city: City;
  onAgentSelect: (agent: Agent) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<import("maplibre-gl").Map | null>(null);
  const agentsById = useRef(new Map<string, Agent>());
  const agentData = useRef(streetAgentCollection(city.agents));
  const selectAgent = useRef(onAgentSelect);
  const [loaded, setLoaded] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState<Agent | null>(null);

  const activeAgents = city.agents.filter((agent) => agent.status !== "offline").length;

  useEffect(() => {
    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;
    let hoveredAgentId: string | number | null = null;

    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/dark",
        center: [center.lng, center.lat],
        zoom: STREET_MAP_INITIAL_ZOOM,
        minZoom: STREET_MAP_MIN_ZOOM,
        maxZoom: STREET_MAP_MAX_ZOOM,
        bearing: 0,
        pitch: 34,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        maxTileCacheSize: 24,
        fadeDuration: 0,
        pixelRatio: Math.min(window.devicePixelRatio, 1.25),
        attributionControl: { compact: true },
      });
      mapInstance.current = map;
      map.touchZoomRotate.disableRotation();
      map.scrollZoom.setZoomRate(1 / 600);
      map.scrollZoom.setWheelZoomRate(1 / 1800);
      map.on("load", () => {
        if (cancelled || !map) return;
        for (const layerId of ["highway_name_other", "highway_name_motorway"]) {
          if (!map.getLayer(layerId)) continue;
          map.setPaintProperty(layerId, "text-color", "#d2a95d");
          map.setPaintProperty(layerId, "text-halo-color", "#071013");
          map.setPaintProperty(layerId, "text-halo-width", 1);
          map.setLayoutProperty(layerId, "text-size", 8);
        }
        for (const layerId of ["place_city", "place_city_large"]) {
          if (!map.getLayer(layerId)) continue;
          map.setPaintProperty(layerId, "text-color", "#7fdde7");
          map.setPaintProperty(layerId, "text-halo-color", "#061014");
          map.setPaintProperty(layerId, "text-halo-width", 1.2);
          map.setLayoutProperty(layerId, "text-size", 9);
        }
        for (const layerId of ["place_village", "place_town"]) {
          if (!map.getLayer(layerId)) continue;
          map.setPaintProperty(layerId, "text-color", "#9cb7bb");
          map.setPaintProperty(layerId, "text-halo-color", "#061014");
          map.setPaintProperty(layerId, "text-halo-width", 1);
          map.setLayoutProperty(layerId, "text-size", 7);
        }
        if (map.getLayer("place_state")) {
          map.setPaintProperty("place_state", "text-color", "#6f8f95");
          map.setPaintProperty("place_state", "text-halo-color", "#061014");
          map.setPaintProperty("place_state", "text-halo-width", 1);
          map.setLayoutProperty("place_state", "text-size", 8);
        }
        for (const [layerId, color] of [
          ["highway_minor", "#1d3c42"],
          ["highway_major_inner", "#826d42"],
          ["highway_motorway_inner", "#b18b43"],
          ["boundary_state", "#3a7f86"],
        ] as const) {
          if (map.getLayer(layerId)) map.setPaintProperty(layerId, "line-color", color);
        }

        for (const styleLayer of map.getStyle().layers) {
          if ("source-layer" in styleLayer && styleLayer["source-layer"] === "building") {
            map.setLayoutProperty(styleLayer.id, "visibility", "none");
          }
        }

        const statusColor: import("maplibre-gl").ExpressionSpecification = [
          "match",
          ["get", "status"],
          "working",
          agentStatusColors.working,
          "online",
          agentStatusColors.online,
          "idle",
          agentStatusColors.idle,
          agentStatusColors.offline,
        ];
        map.addSource("atlas-street-agents", {
          type: "geojson",
          data: agentData.current,
          promoteId: "id",
        });
        map.addLayer({
          id: "atlas-agent-glow",
          type: "circle",
          source: "atlas-street-agents",
          paint: {
            "circle-color": statusColor,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 8, 18, 17],
            "circle-blur": 0.82,
            "circle-opacity": ["case", ["==", ["get", "status"], "offline"], 0.16, 0.4],
          },
        });
        map.addLayer({
          id: "atlas-agent-pulse",
          type: "circle",
          source: "atlas-street-agents",
          filter: ["==", ["get", "status"], "working"],
          paint: {
            "circle-color": agentStatusColors.working,
            "circle-radius": 12,
            "circle-blur": 0.55,
            "circle-opacity": 0.28,
            "circle-stroke-color": agentStatusColors.working,
            "circle-stroke-width": 1,
            "circle-stroke-opacity": 0.28,
          },
        });
        map.addLayer({
          id: "atlas-agent-core",
          type: "circle",
          source: "atlas-street-agents",
          paint: {
            "circle-color": statusColor,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              13,
              ["case", ["boolean", ["feature-state", "hover"], false], 7, 3.4],
              18,
              ["case", ["boolean", ["feature-state", "hover"], false], 9, 6.2],
            ],
            "circle-opacity": ["case", ["==", ["get", "status"], "offline"], 0.38, 0.96],
            "circle-stroke-color": "#effcff",
            "circle-stroke-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0.8],
            "circle-stroke-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.95, 0.46],
          },
        });
        map.addLayer({
          id: "atlas-agent-labels",
          type: "symbol",
          source: "atlas-street-agents",
          minzoom: 16,
          filter: ["!=", ["get", "status"], "offline"],
          layout: {
            "text-field": ["get", "name"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 16, 8, 19, 10],
            "text-offset": [0, 1.15],
            "text-anchor": "top",
            "text-allow-overlap": false,
            "text-padding": 4,
            "symbol-sort-key": ["get", "energy"],
          },
          paint: {
            "text-color": statusColor,
            "text-halo-color": "#02080b",
            "text-halo-width": 1.3,
            "text-opacity": 0.88,
          },
        });

        map.on("mousemove", "atlas-agent-core", (event) => {
          const feature = event.features?.[0];
          const nextAgentId = feature?.properties?.id as string | undefined;
          if (!nextAgentId) return;
          if (hoveredAgentId !== null && hoveredAgentId !== nextAgentId) {
            map?.setFeatureState({ source: "atlas-street-agents", id: hoveredAgentId }, { hover: false });
          }
          hoveredAgentId = nextAgentId;
          map?.setFeatureState({ source: "atlas-street-agents", id: nextAgentId }, { hover: true });
          setHoveredAgent(agentsById.current.get(nextAgentId) ?? null);
          map?.getCanvas().style.setProperty("cursor", "pointer");
        });
        map.on("mouseleave", "atlas-agent-core", () => {
          if (hoveredAgentId !== null) {
            map?.setFeatureState({ source: "atlas-street-agents", id: hoveredAgentId }, { hover: false });
          }
          hoveredAgentId = null;
          setHoveredAgent(null);
          map?.getCanvas().style.setProperty("cursor", "grab");
        });
        map.on("click", "atlas-agent-core", (event) => {
          const agentId = event.features?.[0]?.properties?.id as string | undefined;
          const agent = agentId ? agentsById.current.get(agentId) : undefined;
          if (agent) selectAgent.current(agent);
        });

        setLoaded(true);
      });
    });

    return () => {
      cancelled = true;
      mapInstance.current = null;
      map?.remove();
    };
  }, [center.lat, center.lng]);

  useEffect(() => {
    agentsById.current = new Map(city.agents.map((agent) => [agent.id, agent]));
    agentData.current = streetAgentCollection(city.agents);
    const source = mapInstance.current?.getSource("atlas-street-agents") as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData(agentData.current);
  }, [city.agents]);

  useEffect(() => {
    selectAgent.current = onAgentSelect;
  }, [onAgentSelect]);

  return (
    <div className={`streetMapStage ${loaded ? "loaded" : ""}`}>
      <div ref={container} className="streetMapCanvas" />
      {!loaded && (
        <div className="streetMapLoading" role="status">
          <i />
          <span>ALIGNING STREET GRID</span>
          <small>{city.name.toUpperCase()} · NORTH LOCKED</small>
        </div>
      )}
      <div className="streetMapReadout glassPanel">
        <span>{city.name.toUpperCase()} · LIVE STREET VIEW</span>
        <b>{Math.abs(center.lat).toFixed(3)}°{center.lat >= 0 ? "N" : "S"} · {Math.abs(center.lng).toFixed(3)}°{center.lng >= 0 ? "E" : "W"}</b>
        <small>{activeAgents} active · street labels · north locked</small>
      </div>
      <div className="streetAgentLegend glassPanel" aria-label="Street agent status legend">
        {(Object.keys(agentStatusColors) as Agent["status"][]).map((status) => (
          <span key={status}><i style={{ backgroundColor: agentStatusColors[status] }} />{status}</span>
        ))}
      </div>
      {hoveredAgent && (
        <div className="streetAgentHover glassPanel">
          <span><i style={{ backgroundColor: agentStatusColors[hoveredAgent.status] }} />{hoveredAgent.status} · {hoveredAgent.runtime}</span>
          <b>{hoveredAgent.name}</b>
          <small>{hoveredAgent.activity} · {hoveredAgent.topic}</small>
          <em>Click for agent profile</em>
        </div>
      )}
      <div className="streetMapHint">Hover or click an agent · Drag to move · Scroll to zoom · north locked</div>
    </div>
  );
}

type CountryPoint = { lng: number; lat: number };

const COUNTRY_BOTTOM_RADIUS = 3.003;
const COUNTRY_TOP_RADIUS = 3.026;
const COUNTRY_HOVER_RADIUS = 3.22;
const ADMIN_CONTEXT_RADIUS = 3.044;
const ADMIN_BASE_RADIUS = 3.052;
const ADMIN_HOVER_RADIUS = 3.078;
const CITY_LABEL_RADIUS = ADMIN_BASE_RADIUS + 0.006;

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

function boundaryFeatureName(feature: AtlasBoundaryFeature) {
  return String(feature.properties?.atlasName ?? feature.properties?.shapeName ?? feature.properties?.name ?? "Administrative area");
}

function boundaryFeatureId(feature: AtlasBoundaryFeature) {
  return String(feature.properties?.shapeID ?? feature.properties?.atlasPlaceId ?? boundaryFeatureName(feature));
}

function normalizeBoundaryOrientation(feature: AtlasBoundaryFeature): AtlasBoundaryFeature {
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
  return { ...feature, geometry } as AtlasBoundaryFeature;
}

function boundaryKindFor(level: string | undefined, features: AtlasBoundaryFeature[]): BoundaryKind {
  if (features.some((feature) => feature.properties?.shapeType === "CITY")) return "city";
  if (level === "ADM1") return "region";
  if (level === "ADM2") return "district";
  return "localadmin";
}

function boundaryKindLabel(kind: BoundaryKind | undefined) {
  if (kind === "region") return "REGION";
  if (kind === "district") return "DISTRICT";
  if (kind === "localadmin") return "LOCAL AREA";
  return "CITY";
}

function boundaryFeatureCenter(feature: AtlasBoundaryFeature, fallback?: GeoCenter) {
  const atlasLat = feature.properties?.atlasLat;
  const atlasLng = feature.properties?.atlasLng;
  if (typeof atlasLat === "number" && typeof atlasLng === "number") {
    const center = { lat: atlasLat, lng: normalizeLongitude(atlasLng) };
    if (geoContains(feature, [center.lng, center.lat])) return center;
  }
  const [lng, lat] = geoCentroid(feature);
  const center = { lat, lng: normalizeLongitude(lng) };
  if (Number.isFinite(lat) && Number.isFinite(lng) && geoContains(feature, [center.lng, center.lat])) {
    return center;
  }
  return fallback ?? center;
}

function boundaryBoundsContain(
  bounds: [[number, number], [number, number]],
  lng: number,
  lat: number,
) {
  const [[west, south], [east, north]] = bounds;
  const longitudeInside = west <= east
    ? lng >= west && lng <= east
    : lng >= west || lng <= east;
  return longitudeInside && lat >= south && lat <= north;
}

function prepareBoundaryRing(coordinates: GeoJSON.Position[]) {
  const ring = coordinates
    .filter((coordinate) => coordinate.length >= 2)
    .map((coordinate) => ({ lng: coordinate[0], lat: coordinate[1] }));
  const first = ring[0];
  const last = ring.at(-1);
  if (first && last && first.lng === last.lng && first.lat === last.lat) ring.pop();
  for (let index = 1; index < ring.length; index += 1) {
    while (ring[index].lng - ring[index - 1].lng > 180) ring[index].lng -= 360;
    while (ring[index].lng - ring[index - 1].lng < -180) ring[index].lng += 360;
  }
  return ring;
}

function boundaryPolygons(feature: AtlasBoundaryFeature) {
  const polygons = feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
  return polygons.map((polygon) => {
    const rings = polygon.map(prepareBoundaryRing).filter((ring) => ring.length >= 3);
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
  }).filter((rings) => rings.length > 0);
}

function appendBoundaryTriangle(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  radius: number,
  depth = 0,
) {
  const edges = [
    { length: a.angleTo(b), start: a, end: b, opposite: c },
    { length: b.angleTo(c), start: b, end: c, opposite: a },
    { length: c.angleTo(a), start: c, end: a, opposite: b },
  ].sort((left, right) => right.length - left.length);
  const longest = edges[0];
  if (longest.length > 0.14 && depth < 7) {
    const midpoint = longest.start.clone().add(longest.end).normalize();
    appendBoundaryTriangle(positions, longest.start, midpoint, longest.opposite, radius, depth + 1);
    appendBoundaryTriangle(positions, midpoint, longest.end, longest.opposite, radius, depth + 1);
    return;
  }

  let second = b;
  let third = c;
  if (b.clone().sub(a).cross(c.clone().sub(a)).dot(a) < 0) {
    second = c;
    third = b;
  }
  for (const point of [a, second, third]) {
    const surface = point.clone().multiplyScalar(radius);
    positions.push(surface.x, surface.y, surface.z);
  }
}

function buildBoundaryGeometry(features: AtlasBoundaryFeature[], radius: number) {
  const positions: number[] = [];
  const outlinePositions: number[] = [];

  for (const feature of features) {
    for (const rings of boundaryPolygons(feature)) {
      const contour = rings[0].map((point) => new THREE.Vector2(point.lng, point.lat));
      const holes = rings.slice(1).map((ring) => ring.map((point) => new THREE.Vector2(point.lng, point.lat)));
      const flattened = contour.concat(...holes);
      for (const face of THREE.ShapeUtils.triangulateShape(contour, holes)) {
        appendBoundaryTriangle(
          positions,
          sphericalDirection({ lng: flattened[face[0]].x, lat: flattened[face[0]].y }),
          sphericalDirection({ lng: flattened[face[1]].x, lat: flattened[face[1]].y }),
          sphericalDirection({ lng: flattened[face[2]].x, lat: flattened[face[2]].y }),
          radius,
        );
      }
      for (const ring of rings) {
        for (let index = 0; index < ring.length; index += 1) {
          const start = sphericalDirection(ring[index]);
          const end = sphericalDirection(ring[(index + 1) % ring.length]);
          const divisions = Math.max(1, Math.ceil(start.angleTo(end) / 0.045));
          for (let division = 0; division < divisions; division += 1) {
            const from = start.clone().lerp(end, division / divisions).normalize().multiplyScalar(radius + 0.002);
            const to = start.clone().lerp(end, (division + 1) / divisions).normalize().multiplyScalar(radius + 0.002);
            outlinePositions.push(from.x, from.y, from.z, to.x, to.y, to.z);
          }
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const outline = new THREE.BufferGeometry();
  outline.setAttribute("position", new THREE.Float32BufferAttribute(outlinePositions, 3));
  outline.computeBoundingSphere();
  return { geometry, outline };
}

function AdministrativeBoundaryContext({
  features,
}: {
  features: AtlasBoundaryFeature[];
}) {
  const boundaryGeometry = useMemo(
    () => features.length ? buildBoundaryGeometry(features, ADMIN_CONTEXT_RADIUS) : null,
    [features],
  );

  if (!boundaryGeometry) return null;
  return (
    <group renderOrder={4}>
      <lineSegments
        geometry={boundaryGeometry.outline}
        frustumCulled={false}
        raycast={() => undefined}
        renderOrder={4}
      >
        <lineBasicMaterial
          color="#78d3dc"
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </lineSegments>
      <lineSegments
        geometry={boundaryGeometry.outline}
        scale={1.00055}
        frustumCulled={false}
        raycast={() => undefined}
        renderOrder={5}
      >
        <lineBasicMaterial
          color="#4ab7c5"
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

function EnergyFlowMaterial({
  color,
  emissive,
  emissiveIntensity,
  flowColor,
  flowStrength,
  flowPhase,
  opacity = 1,
  transparent = false,
  depthWrite = true,
  roughness = 0.58,
  metalness = 0.14,
}: {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  flowColor: string;
  flowStrength: number;
  flowPhase: number;
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  roughness?: number;
  metalness?: number;
}) {
  const shader = useRef<THREE.WebGLProgramParametersWithUniforms | null>(null);
  const flowTint = useMemo(() => new THREE.Color(flowColor), [flowColor]);
  const configureShader = useCallback((compiled: THREE.WebGLProgramParametersWithUniforms) => {
    compiled.uniforms.atlasFlowTime = { value: 0 };
    compiled.uniforms.atlasFlowStrength = { value: flowStrength };
    compiled.uniforms.atlasFlowPhase = { value: flowPhase };
    compiled.uniforms.atlasFlowColor = { value: flowTint };
    compiled.vertexShader = compiled.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vAtlasFlowPosition;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vAtlasFlowPosition = position;`,
      );
    compiled.fragmentShader = compiled.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float atlasFlowTime;
        uniform float atlasFlowStrength;
        uniform float atlasFlowPhase;
        uniform vec3 atlasFlowColor;
        varying vec3 vAtlasFlowPosition;`,
      )
      .replace(
        "#include <opaque_fragment>",
        `float atlasFlowA = pow(max(0.0, 0.5 + 0.5 * sin(
          dot(vAtlasFlowPosition, vec3(12.0, 8.0, 5.0))
          - atlasFlowTime * 1.45
          + atlasFlowPhase
        )), 9.0);
        float atlasFlowB = pow(max(0.0, 0.5 + 0.5 * sin(
          dot(vAtlasFlowPosition, vec3(-6.0, 11.0, 9.0))
          - atlasFlowTime * 0.92
          + atlasFlowPhase * 1.7
        )), 14.0);
        outgoingLight += atlasFlowColor * (atlasFlowA * 0.72 + atlasFlowB * 0.36) * atlasFlowStrength;
        #include <opaque_fragment>`,
      );
    shader.current = compiled;
  }, [flowPhase, flowStrength, flowTint]);

  useFrame(({ clock }) => {
    if (!shader.current) return;
    shader.current.uniforms.atlasFlowTime.value = clock.elapsedTime;
    shader.current.uniforms.atlasFlowStrength.value = flowStrength;
    shader.current.uniforms.atlasFlowPhase.value = flowPhase;
    shader.current.uniforms.atlasFlowColor.value.copy(flowTint);
  });

  return (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
      roughness={roughness}
      metalness={metalness}
      transparent={transparent}
      opacity={opacity}
      depthWrite={depthWrite}
      side={THREE.DoubleSide}
      onBeforeCompile={configureShader}
      customProgramCacheKey={() => "atlas-energy-flow-v1"}
    />
  );
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
      const cityLayerActive = detailLevel >= 2;
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
      {detailLevel < 2 && <mesh
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
            distance: COUNTRY_FOCUS_DISTANCE,
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
            {detailLevel >= 2 ? (
              <meshBasicMaterial color="#07303a" side={THREE.DoubleSide} />
            ) : (
              <EnergyFlowMaterial
                color={density.color}
                emissive={density.color}
                emissiveIntensity={0.18 + density.level * 0.11}
                flowColor={density.level >= 4 ? "#ffd36f" : "#6fe9df"}
                flowStrength={liveAgentCount > 0 ? 0.42 + density.level * 0.12 : 0}
                flowPhase={index * 0.73}
                roughness={0.56}
                metalness={0.16}
              />
            )}
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

function AdministrativeTerritories({
  features,
  detailLevel,
  boundaryKind,
  cities,
  countryKey,
  countryName,
  hoveredIndex,
  onSelect,
  onAreaSelect,
  onHoverChange,
}: {
  features: AtlasBoundaryFeature[];
  detailLevel: DetailLevel;
  boundaryKind: BoundaryKind;
  cities: City[];
  countryKey: string;
  countryName: string;
  hoveredIndex: number | null;
  onSelect: (city: City) => void;
  onAreaSelect: (area: CityAreaSelection) => void;
  onHoverChange: (index: number | null) => void;
}) {
  const cityByName = useMemo(() => new Map(cities
    .filter((city) => countryEnergyKey(city.country) === countryKey)
    .map((city) => [normalizeLabelName(city.name), city])), [cities, countryKey]);
  const municipalLayer = features.some((feature) => feature.properties?.shapeType === "CITY");
  const baseGeometry = useMemo(() => features.length ? buildBoundaryGeometry(features, ADMIN_BASE_RADIUS) : null, [features]);
  const featureBounds = useMemo(() => features.map((feature) => geoBounds(feature)), [features]);
  const hoveredFeature = hoveredIndex === null ? null : features[hoveredIndex] ?? null;
  const hoveredGeometry = useMemo(
    () => hoveredFeature ? buildBoundaryGeometry([hoveredFeature], ADMIN_HOVER_RADIUS) : null,
    [hoveredFeature],
  );

  if (!features.length || !baseGeometry) return null;

  const findFeatureAtPoint = (worldPoint: THREE.Vector3, hitSurface: THREE.Object3D) => {
    const geo = vectorToGeoCenter(hitSurface.worldToLocal(worldPoint.clone()));
    for (let index = 0; index < features.length; index += 1) {
      if (
        boundaryBoundsContain(featureBounds[index], geo.lng, geo.lat)
        && geoContains(features[index], [geo.lng, geo.lat])
      ) return index;
    }
    return null;
  };

  return (
    <group>
      <mesh geometry={baseGeometry.geometry} frustumCulled={false} raycast={() => undefined}>
        <meshStandardMaterial
          color="#082832"
          emissive="#061c24"
          emissiveIntensity={0.12}
          roughness={0.62}
          metalness={0.12}
          transparent
          opacity={municipalLayer ? 0.22 : detailLevel === 2 ? 0.12 : 0.075}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={baseGeometry.outline} frustumCulled={false} raycast={() => undefined}>
        <lineBasicMaterial
          color={detailLevel === 2 ? "#92e5ea" : "#659ca5"}
          transparent
          opacity={municipalLayer ? 0.98 : detailLevel === 2 ? 0.82 : 0.46}
          depthWrite={false}
        />
      </lineSegments>
      {municipalLayer && (
        <lineSegments geometry={baseGeometry.outline} scale={1.0007} frustumCulled={false} raycast={() => undefined}>
          <lineBasicMaterial color="#58c6d4" transparent opacity={0.34} depthWrite={false} blending={THREE.AdditiveBlending} />
        </lineSegments>
      )}
      {hoveredFeature && hoveredGeometry && (
        <group>
          <mesh geometry={hoveredGeometry.geometry} frustumCulled={false} raycast={() => undefined}>
            <meshStandardMaterial
              color="#d9a846"
              emissive="#ffd36f"
              emissiveIntensity={1.1}
              roughness={0.42}
              metalness={0.16}
              transparent
              opacity={0.72}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <lineSegments geometry={hoveredGeometry.outline} frustumCulled={false} raycast={() => undefined}>
            <lineBasicMaterial color="#ffe4a3" transparent opacity={0.98} depthWrite={false} />
          </lineSegments>
        </group>
      )}
      <mesh
        onPointerMove={(event) => {
          const nextIndex = findFeatureAtPoint(event.point, event.eventObject);
          onHoverChange(nextIndex);
          if (event.buttons === 0) document.body.style.cursor = nextIndex === null ? "grab" : "pointer";
        }}
        onPointerOut={() => {
          onHoverChange(null);
          document.body.style.cursor = "grab";
        }}
        onClick={(event) => {
          if (event.delta > 5) return;
          const index = findFeatureAtPoint(event.point, event.eventObject);
          if (index === null) {
            onHoverChange(null);
            return;
          }
          event.stopPropagation();
          const clickedCenter = vectorToGeoCenter(event.eventObject.worldToLocal(event.point.clone()));
          const selectedCenter = boundaryFeatureCenter(features[index], clickedCenter);
          onHoverChange(null);
          document.body.style.cursor = "grab";
          const city = cityByName.get(normalizeLabelName(boundaryFeatureName(features[index])));
          if (city) {
            onSelect(city);
          } else {
            onAreaSelect({
              name: boundaryFeatureName(features[index]),
              lat: selectedCenter.lat,
              lng: selectedCenter.lng,
              countryKey,
              countryName,
              boundaryKind,
            });
          }
        }}
      >
        <sphereGeometry args={[ADMIN_HOVER_RADIUS + 0.015, 96, 64]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} side={THREE.FrontSide} />
      </mesh>
    </group>
  );
}

function LiveAgentMarkers({
  entries,
  onSelect,
}: {
  entries: GlobeAgentEntry[];
  onSelect: (city: City, agent: Agent) => void;
}) {
  const cores = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const hitTargets = useRef<THREE.InstancedMesh>(null);
  const markerTransformScratch = useRef({
    matrix: new THREE.Matrix4(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    worldPosition: new THREE.Vector3(),
  });
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const markerPositions = useMemo(
    () => entries.map(({ agent }) => latLngToVector3(agent.lat, agent.lng, AGENT_MARKER_RADIUS)),
    [entries],
  );

  useLayoutEffect(() => {
    const coreMesh = cores.current;
    const ringMesh = rings.current;
    if (!coreMesh || !ringMesh) return;
    const coreColor = new THREE.Color();
    const ringColor = new THREE.Color();
    entries.forEach((entry, index) => {
      const statusColor = agentStatusColors[entry.agent.status];
      coreColor.set(statusColor);
      ringColor.set(statusColor).multiplyScalar(0.5);
      coreMesh.setColorAt(index, coreColor);
      ringMesh.setColorAt(index, ringColor);
    });
    if (coreMesh.instanceColor) coreMesh.instanceColor.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
  }, [entries]);

  useFrame(({ camera, size }) => {
    const coreMesh = cores.current;
    const ringMesh = rings.current;
    const hitMesh = hitTargets.current;
    if (!coreMesh || !ringMesh || !hitMesh) return;
    ringMesh.updateWorldMatrix(true, false);
    const effectiveFov = camera instanceof THREE.PerspectiveCamera ? camera.getEffectiveFOV() : 38;
    const scratch = markerTransformScratch.current;
    markerPositions.forEach((position, index) => {
      scratch.worldPosition.copy(position).applyMatrix4(ringMesh.matrixWorld);
      const scale = agentMarkerScaleForScreenSize(
        camera.position.distanceTo(scratch.worldPosition),
        size.height,
        effectiveFov,
      );
      scratch.scale.setScalar(scale);
      scratch.matrix.compose(position, scratch.quaternion, scratch.scale);
      coreMesh.setMatrixAt(index, scratch.matrix);
      ringMesh.setMatrixAt(index, scratch.matrix);
      hitMesh.setMatrixAt(index, scratch.matrix);
    });
    coreMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    hitMesh.instanceMatrix.needsUpdate = true;
  });

  if (!entries.length) return null;
  const hoveredIndex = hoveredAgentId === null
    ? null
    : entries.findIndex((entry) => entry.agent.id === hoveredAgentId);
  const hovered = hoveredIndex === null ? null : entries[hoveredIndex] ?? null;
  const hoveredPosition = hoveredIndex === null ? null : markerPositions[hoveredIndex] ?? null;

  const setHoverFromEvent = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const nextIndex = event.instanceId ?? null;
    setHoveredAgentId(nextIndex === null ? null : entries[nextIndex]?.agent.id ?? null);
    if (event.buttons === 0) document.body.style.cursor = nextIndex === null ? "grab" : "pointer";
  };

  return (
    <group>
      <instancedMesh
        ref={rings}
        args={[undefined, undefined, entries.length]}
        frustumCulled={false}
        raycast={() => undefined}
        renderOrder={10}
      >
        <sphereGeometry args={[AGENT_MARKER_GEOMETRY_RADIUS, 10, 10]} />
        <meshBasicMaterial depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={cores}
        args={[undefined, undefined, entries.length]}
        frustumCulled={false}
        raycast={() => undefined}
        renderOrder={11}
      >
        <sphereGeometry args={[AGENT_MARKER_GEOMETRY_RADIUS * 0.5, 8, 8]} />
        <meshBasicMaterial depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={hitTargets}
        args={[undefined, undefined, entries.length]}
        frustumCulled={false}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={setHoverFromEvent}
        onPointerOut={(event) => {
          event.stopPropagation();
          setHoveredAgentId(null);
          document.body.style.cursor = "grab";
        }}
        onClick={(event) => {
          if (event.delta > 5 || event.instanceId === undefined) return;
          event.stopPropagation();
          const entry = entries[event.instanceId];
          if (entry) onSelect(entry.city, entry.agent);
        }}
      >
        <sphereGeometry args={[AGENT_MARKER_GEOMETRY_RADIUS * 3.2, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
      </instancedMesh>
      {hovered && hoveredPosition && (
        <Html
          position={hoveredPosition.clone().multiplyScalar(1.00025)}
          center
          zIndexRange={[34, 0]}
          className="globeAgentTooltipAnchor"
        >
          <div className="globeAgentTooltip">
            <span><i style={{ background: agentStatusColors[hovered.agent.status] }} /> LIVE AGENT</span>
            <b>{hovered.agent.name}</b>
            <small>{hovered.agent.runtime} · {hovered.agent.status.toUpperCase()}</small>
            <em>{hovered.agent.activity}</em>
          </div>
        </Html>
      )}
    </group>
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
  presenceAgents = [],
  onSelect,
  onAgentSelect,
  onCountrySelect,
  onCityAreaSelect,
  onDetailChange,
  onZoomChange,
}: {
  cities: City[];
  selectedCity: City;
  selectedCountryKey: string | null;
  focusLocation: GeoCenter;
  focusDistance: number | null;
  focusRevision: number;
  layer: Layer;
  liveCounts: Record<string, number>;
  presenceAgents: Agent[];
  onSelect: (city: City) => void;
  onAgentSelect: (city: City, agent: Agent) => void;
  onCountrySelect: (country: CountrySelection) => void;
  onCityAreaSelect: (area: CityAreaSelection) => void;
  onDetailChange: (level: DetailLevel) => void;
  onZoomChange: (progress: number) => void;
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
  const focusDistanceTarget = useRef<number | null>(null);
  const initialized = useRef(false);
  const currentDetail = useRef<DetailLevel>(1);
  const currentZoomProgress = useRef(-1);
  const currentCityLabelBand = useRef(0);
  const [labelDetail, setLabelDetail] = useState<DetailLevel>(1);
  const [cityLabelBand, setCityLabelBand] = useState(0);
  const [administrativeHover, setAdministrativeHover] = useState<{
    countryKey: string;
    featureId: string;
    source: "surface" | "label";
    contextKey: string;
  } | null>(null);
  const administrativeLabelHover = useRef<{
    countryKey: string;
    featureId: string;
    contextKey: string;
  } | null>(null);
  const focusedCountryKey = selectedCountryKey ?? countryEnergyKey(selectedCity.country);
  const focusedCountryName = countryLabelByKey.get(focusedCountryKey)?.name ?? selectedCity.country;
  const focusedIso3 = iso3ForCountryKey(focusedCountryKey);
  const prefetchFocusedGeography = selectedCountryKey !== null || labelDetail >= 2;
  const { data: placesPayload } = useAtlasPlaces(focusedIso3, prefetchFocusedGeography);
  const { data: regionBoundaryPayload } = useAtlasBoundaries(
    focusedIso3,
    "ADM1",
    labelDetail === 2,
  );
  const { data: districtBoundaryPayload } = useAtlasBoundaries(
    focusedIso3,
    "ADM2",
    labelDetail === 2 && cityLabelBand >= 1,
  );
  const { data: localBoundaryPayload } = useAtlasBoundaries(
    focusedIso3,
    "LOCAL",
    labelDetail === 2 && cityLabelBand >= 2,
  );
  const liveAgentsByCountry = useMemo(() => cities.reduce<Record<string, number>>((counts, city) => {
    const key = countryEnergyKey(city.country);
    const seededLiveAgents = city.agents.filter((agent) => agent.status !== "offline").length;
    counts[key] = (counts[key] ?? 0) + seededLiveAgents + (liveCounts[city.name] ?? 0);
    return counts;
  }, {}), [cities, liveCounts]);
  const focusedLiveAgentEntries = useMemo<GlobeAgentEntry[]>(() => {
    const focusedCities = cities.filter((city) => countryEnergyKey(city.country) === focusedCountryKey);
    const focusedCityIds = new Set(focusedCities.map((city) => city.id));
    const cityById = new Map(focusedCities.map((city) => [city.id, city]));
    const telemetryEntries = focusedCities.flatMap((city) => city.agents
      .filter((agent) => agent.status !== "offline" && Number.isFinite(agent.lat) && Number.isFinite(agent.lng))
      .map((agent) => ({ city, agent })));
    const presenceEntries = presenceAgents.flatMap((agent) => {
      if (
        agent.status === "offline"
        || !focusedCityIds.has(agent.cityId)
        || !Number.isFinite(agent.lat)
        || !Number.isFinite(agent.lng)
      ) return [];
      const city = cityById.get(agent.cityId);
      return city ? [{ city, agent }] : [];
    });
    return [...telemetryEntries, ...presenceEntries];
  }, [cities, focusedCountryKey, presenceAgents]);
  const detailedPlaceLabels = useMemo(() => {
    if (labelDetail !== 2) return [];
    const labelConfig = cityLabelBand === 0
      ? { maximumRank: 2, minimumSeparation: 5.5, limit: 26 }
      : cityLabelBand === 1
        ? { maximumRank: 3, minimumSeparation: 3.6, limit: 48 }
        : { maximumRank: 5, minimumSeparation: 2.25, limit: 76 };
    const source: AtlasPlace[] = placesPayload?.places ?? [];
    if (source.length) {
      return declutterGeographicLabels(
        source
          .filter((place) => place.rank <= labelConfig.maximumRank)
          .map((place): GeographicLabel => ({
            id: `geonames-${place.id}`,
            name: place.name,
            rank: place.rank,
            population: place.population,
            lat: place.lat,
            lng: place.lng,
            position: latLngToVector3(place.lat, place.lng, CITY_LABEL_RADIUS),
          })),
        labelConfig.minimumSeparation,
        labelConfig.limit,
      );
    }
    return declutterGeographicLabels(
      atlasLabelData.cities
        .filter((place) => (
          countryEnergyKey(place.country) === focusedCountryKey
          && place.rank <= labelConfig.maximumRank
        ))
        .map((place): GeographicLabel => ({
          id: place.id,
          name: place.name,
          rank: place.rank,
          population: 0,
          lat: place.lat,
          lng: place.lng,
          position: latLngToVector3(place.lat, place.lng, CITY_LABEL_RADIUS),
        })),
      labelConfig.minimumSeparation,
      labelConfig.limit,
    );
  }, [cityLabelBand, focusedCountryKey, labelDetail, placesPayload?.places]);
  const cityBoundaryPlaces = useMemo(() => detailedPlaceLabels.map((place) => ({
    id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    population: place.population,
    rank: place.rank,
  })), [detailedPlaceLabels]);
  const { data: cityBoundaryPayload } = useAtlasCityBoundaries(
    focusedIso3,
    cityBoundaryPlaces,
    labelDetail === 2 && cityLabelBand >= 2,
  );
  const activeBoundaryPayload = cityLabelBand === 0
    ? regionBoundaryPayload
    : cityLabelBand === 1
      ? districtBoundaryPayload?.available ? districtBoundaryPayload : regionBoundaryPayload
      : cityBoundaryPayload?.available
        ? cityBoundaryPayload
        : localBoundaryPayload?.available
          ? localBoundaryPayload
          : districtBoundaryPayload?.available
            ? districtBoundaryPayload
            : regionBoundaryPayload;
  const activeBoundaryFeatures = useMemo(
    () => activeBoundaryPayload?.available
      ? activeBoundaryPayload.features.map(normalizeBoundaryOrientation)
      : [],
    [activeBoundaryPayload],
  );
  const activeBoundaryKind = boundaryKindFor(activeBoundaryPayload?.level, activeBoundaryFeatures);
  const contextBoundaryPayload = districtBoundaryPayload?.available
    ? districtBoundaryPayload
    : regionBoundaryPayload?.available
      ? regionBoundaryPayload
      : null;
  const contextBoundaryFeatures = useMemo(
    () => (
      labelDetail === 2
      && cityLabelBand >= 2
      && (activeBoundaryKind === "city" || activeBoundaryKind === "localadmin")
      && contextBoundaryPayload?.available
    )
      ? contextBoundaryPayload.features.map(normalizeBoundaryOrientation)
      : [],
    [
      activeBoundaryKind,
      cityLabelBand,
      contextBoundaryPayload,
      labelDetail,
    ],
  );
  const activeBoundaryBounds = useMemo(
    () => activeBoundaryFeatures.map((feature) => geoBounds(feature)),
    [activeBoundaryFeatures],
  );
  const activeBoundaryIndexById = useMemo(() => new Map(activeBoundaryFeatures.map((feature, index) => [
    boundaryFeatureId(feature),
    index,
  ])), [activeBoundaryFeatures]);
  const administrativeContextKey = `${focusedCountryKey}:${cityLabelBand}:${activeBoundaryPayload?.level ?? "none"}:${activeBoundaryFeatures.length}`;
  const hoveredBoundaryIndex = administrativeHover?.countryKey === focusedCountryKey
    && administrativeHover.contextKey === administrativeContextKey
    ? activeBoundaryIndexById.get(administrativeHover.featureId) ?? null
    : null;
  const administrativeLabels = useMemo(() => {
    if (cityLabelBand >= 1 || activeBoundaryKind === "city") return [];
    const minimumSeparation = cityLabelBand === 0 ? 4.2 : 2.2;
    const limit = cityLabelBand === 0 ? 42 : 90;
    return declutterGeographicLabels(activeBoundaryFeatures.map((feature, index) => {
      const center = boundaryFeatureCenter(feature);
      return {
        id: `boundary-${boundaryFeatureId(feature)}-${index}`,
        name: boundaryFeatureName(feature),
        rank: 1,
        population: 0,
        lat: center.lat,
        lng: center.lng,
        position: latLngToVector3(center.lat, center.lng, CITY_LABEL_RADIUS),
      };
    }), minimumSeparation, limit);
  }, [activeBoundaryFeatures, activeBoundaryKind, cityLabelBand]);
  const displayPlaceLabels = useMemo(() => {
    const featureByPlaceId = new Map(activeBoundaryFeatures.flatMap((feature) => {
      const id = feature.properties?.atlasPlaceId;
      return typeof id === "string" ? [[id, feature] as const] : [];
    }));
    return detailedPlaceLabels.map((place) => {
      const feature = featureByPlaceId.get(place.id);
      if (!feature) return place;
      const center = boundaryFeatureCenter(feature);
      return {
        ...place,
        lat: center.lat,
        lng: center.lng,
        position: latLngToVector3(center.lat, center.lng, CITY_LABEL_RADIUS),
      };
    });
  }, [activeBoundaryFeatures, detailedPlaceLabels]);

  useEffect(() => {
    administrativeLabelHover.current = null;
    const frame = window.requestAnimationFrame(() => setAdministrativeHover(null));
    return () => window.cancelAnimationFrame(frame);
  }, [activeBoundaryFeatures, cityLabelBand, focusedCountryKey]);

  const handleAdministrativeLabelHover = useCallback((featureId: string, hovered: boolean) => {
    if (hovered) {
      administrativeLabelHover.current = { countryKey: focusedCountryKey, featureId, contextKey: administrativeContextKey };
      setAdministrativeHover({ countryKey: focusedCountryKey, featureId, source: "label", contextKey: administrativeContextKey });
      return;
    }

    const labelHover = administrativeLabelHover.current;
    if (
      labelHover?.countryKey === focusedCountryKey
      && labelHover.featureId === featureId
      && labelHover.contextKey === administrativeContextKey
    ) {
      administrativeLabelHover.current = null;
    }
    setAdministrativeHover((current) => (
      current?.source === "label"
        && current.countryKey === focusedCountryKey
        && current.featureId === featureId
        && current.contextKey === administrativeContextKey
        ? null
        : current
    ));
  }, [administrativeContextKey, focusedCountryKey]);

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
    const nextDetail: DetailLevel = distance > COUNTRY_DETAIL_DISTANCE
      ? 1
      : 2;
    if (nextDetail !== currentDetail.current) {
      currentDetail.current = nextDetail;
      setLabelDetail(nextDetail);
      onDetailChange(nextDetail);
    }

    const nextZoomProgress = zoomProgressForDistance(distance);
    const nextCityLabelBand = cityBandForProgress(nextZoomProgress);
    if (nextCityLabelBand !== currentCityLabelBand.current) {
      currentCityLabelBand.current = nextCityLabelBand;
      setCityLabelBand(nextCityLabelBand);
    }

    if (Math.abs(nextZoomProgress - currentZoomProgress.current) >= 0.5) {
      currentZoomProgress.current = nextZoomProgress;
      onZoomChange(nextZoomProgress);
    }

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
    const dragSensitivity = dragSensitivityForProgress(currentZoomProgress.current);
    velocity.current = {
      x: dx * 0.0035 * dragSensitivity,
      y: dy * 0.0028 * dragSensitivity,
    };
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
      <mesh scale={1.055}>
        <sphereGeometry args={[3, 96, 96]} />
        <meshBasicMaterial color="#3cc5d7" transparent opacity={0.045} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      {labelDetail === 2 && contextBoundaryFeatures.length > 0 && (
        <AdministrativeBoundaryContext features={contextBoundaryFeatures} />
      )}
      {labelDetail === 2 && activeBoundaryFeatures.length > 0 && (
        <AdministrativeTerritories
          features={activeBoundaryFeatures}
          detailLevel={labelDetail}
          boundaryKind={activeBoundaryKind}
          cities={cities}
          countryKey={focusedCountryKey}
          countryName={focusedCountryName}
          hoveredIndex={hoveredBoundaryIndex}
          onSelect={onSelect}
          onAreaSelect={onCityAreaSelect}
          onHoverChange={(index) => {
            setAdministrativeHover((current) => {
              const labelHover = administrativeLabelHover.current;
              if (
                labelHover?.countryKey === focusedCountryKey
                && labelHover.contextKey === administrativeContextKey
              ) {
                const nextFeatureId = index === null
                  ? null
                  : boundaryFeatureId(activeBoundaryFeatures[index]);
                if (nextFeatureId === null || nextFeatureId === labelHover.featureId) return current;
                administrativeLabelHover.current = null;
              }
              if (index === null) return current === null ? current : null;
              const featureId = boundaryFeatureId(activeBoundaryFeatures[index]);
              if (
                current?.countryKey === focusedCountryKey
                && current.featureId === featureId
                && current.source === "surface"
                && current.contextKey === administrativeContextKey
              ) return current;
              return {
                countryKey: focusedCountryKey,
                featureId,
                source: "surface",
                contextKey: administrativeContextKey,
              };
            });
          }}
        />
      )}
      {labelDetail === 2 && (
        <LiveAgentMarkers entries={focusedLiveAgentEntries} onSelect={onAgentSelect} />
      )}
      {labelDetail === 1 && globalCountryLabels.map((country) => (
        <GlobeLabel
          key={country.id}
          label={country.name}
          kind="country"
          position={country.position}
        />
      ))}
      {labelDetail === 2 && cityLabelBand < 2 && administrativeLabels.map((area) => {
        const boundaryIndex = activeBoundaryIndexById.get(
          area.id.replace(/^boundary-/, "").replace(/-\d+$/, ""),
        ) ?? -1;
        const boundaryFeature = boundaryIndex >= 0 ? activeBoundaryFeatures[boundaryIndex] : null;
        const boundaryHovered = administrativeHover?.countryKey === focusedCountryKey
          && administrativeHover.contextKey === administrativeContextKey
          && boundaryFeature !== null
          && administrativeHover.featureId === boundaryFeatureId(boundaryFeature);
        return (
          <GlobeLabel
            key={area.id}
            label={area.name}
            kind="region"
            position={area.position}
            color={boundaryHovered ? "#ffd36f" : undefined}
            onHoverChange={boundaryFeature ? (hovered) => {
              const featureId = boundaryFeatureId(boundaryFeature);
              handleAdministrativeLabelHover(featureId, hovered);
            } : undefined}
            onSelect={boundaryFeature ? () => {
              const center = boundaryFeatureCenter(boundaryFeature);
              administrativeLabelHover.current = null;
              setAdministrativeHover(null);
              onCityAreaSelect({
                name: boundaryFeatureName(boundaryFeature),
                lat: center.lat,
                lng: center.lng,
                countryKey: focusedCountryKey,
                countryName: focusedCountryName,
                boundaryKind: activeBoundaryKind,
              });
            } : undefined}
          />
        );
      })}
      {labelDetail === 2 && cityLabelBand >= 1 && displayPlaceLabels.map((city) => {
        const directBoundaryIndex = activeBoundaryKind === "city"
          ? activeBoundaryFeatures.findIndex((feature) => feature.properties?.atlasPlaceId === city.id)
          : -1;
        const boundaryIndex = directBoundaryIndex >= 0
          ? directBoundaryIndex
          : activeBoundaryKind === "city"
            ? activeBoundaryFeatures.findIndex((feature, featureIndex) => (
              boundaryBoundsContain(activeBoundaryBounds[featureIndex], city.lng, city.lat)
              && geoContains(feature, [city.lng, city.lat])
            ))
            : -1;
        const boundaryFeature = boundaryIndex >= 0 ? activeBoundaryFeatures[boundaryIndex] : null;
        const boundaryHovered = administrativeHover?.countryKey === focusedCountryKey
          && administrativeHover.contextKey === administrativeContextKey
          && boundaryFeature !== null
          && administrativeHover.featureId === boundaryFeatureId(boundaryFeature);
        return (
          <GlobeLabel
            key={city.id}
            label={city.name}
            kind="city"
            position={city.position}
            color={boundaryHovered ? "#ffd36f" : undefined}
            onHoverChange={boundaryFeature ? (hovered) => {
              const featureId = boundaryFeatureId(boundaryFeature);
              handleAdministrativeLabelHover(featureId, hovered);
            } : undefined}
            onSelect={() => {
              administrativeLabelHover.current = null;
              setAdministrativeHover(null);
              const seededCity = cities.find((candidate) => (
                normalizeLabelName(candidate.name) === normalizeLabelName(city.name)
                && countryEnergyKey(candidate.country) === focusedCountryKey
              ));
              if (seededCity) {
                onSelect(seededCity);
              } else {
                onCityAreaSelect({
                  name: city.name,
                  lat: city.lat,
                  lng: city.lng,
                  countryKey: focusedCountryKey,
                  countryName: focusedCountryName,
                  boundaryKind: "city",
                });
              }
            }}
          />
        );
      })}
      {labelDetail === 1 && layer === "Attention" && cities.length >= 5 && <>
        <AttentionFlow from={cities[3]} to={cities[0]} color="#ff8f62" delay={0.1} />
        <AttentionFlow from={cities[4]} to={cities[0]} color="#a68cff" delay={0.48} />
        <AttentionFlow from={cities[2]} to={cities[1]} color="#6eb7ff" delay={0.72} />
      </>}
    </group>
  );
}

function CanvasWorldFallback({
  cities,
  selectedCity,
  selectedCountryKey,
  focusLocation,
  focusDistance,
  liveCounts,
  presenceAgents,
  onSelect,
  onAgentSelect,
  onCountrySelect,
  onCityAreaSelect,
  onDetailChange,
  onZoomChange,
}: {
  cities: City[];
  selectedCity: City;
  selectedCountryKey: string | null;
  focusLocation: GeoCenter;
  focusDistance: number | null;
  liveCounts: Record<string, number>;
  presenceAgents: Agent[];
  onSelect: (city: City) => void;
  onAgentSelect: (city: City, agent: Agent) => void;
  onCountrySelect: (country: CountrySelection) => void;
  onCityAreaSelect: (area: CityAreaSelection) => void;
  onDetailChange: (level: DetailLevel) => void;
  onZoomChange: (progress: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fallbackCountries = useMemo(() => atlasGeoData.countries.map((country) => {
    const key = countryEnergyKey(country.name);
    const label = atlasLabelData.countries.find((candidate) => countryEnergyKey(candidate.name) === key);
    const geometry = countryToGeoJson(country);
    const feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
      type: "Feature",
      properties: { name: country.name, key },
      geometry,
    };
    const centroid = geoCentroid(feature);
    return {
      name: label?.name ?? country.name,
      key,
      lat: label?.lat ?? centroid[1],
      lng: label?.lng ?? centroid[0],
      rank: label?.rank ?? 3,
      geometry,
      feature,
    };
  }), []);
  const countryLiveAgents = useMemo(() => cities.reduce<Record<string, number>>((counts, city) => {
    const key = countryEnergyKey(city.country);
    const seeded = city.agents.filter((agent) => agent.status !== "offline").length;
    counts[key] = (counts[key] ?? 0) + seeded + (liveCounts[city.name] ?? 0);
    return counts;
  }, {}), [cities, liveCounts]);
  const focusedCityCountryKey = selectedCountryKey ?? countryEnergyKey(selectedCity.country);
  const focusedCountryIso = iso3ForCountryKey(focusedCityCountryKey);
  const [fallbackDetail, setFallbackDetail] = useState<DetailLevel>(1);
  const [fallbackCityBand, setFallbackCityBand] = useState(0);
  const { data: fallbackPlacesPayload } = useAtlasPlaces(
    focusedCountryIso,
    selectedCountryKey !== null || fallbackDetail === 2,
  );
  const fallbackDetailedPlaces = useMemo(() => (
    [...(fallbackPlacesPayload?.places ?? [])]
      .filter((place) => place.rank <= 4)
      .sort((left, right) => left.rank - right.rank || right.population - left.population)
      .slice(0, 100)
  ), [fallbackPlacesPayload?.places]);
  const { data: fallbackCityBoundaryPayload } = useAtlasCityBoundaries(
    focusedCountryIso,
    fallbackDetailedPlaces,
    fallbackDetail === 2 && fallbackCityBand >= 2,
  );
  const { data: fallbackRegionBoundaryPayload } = useAtlasBoundaries(
    focusedCountryIso,
    "ADM1",
    fallbackDetail === 2,
  );
  const { data: fallbackDistrictBoundaryPayload } = useAtlasBoundaries(
    focusedCountryIso,
    "ADM2",
    fallbackDetail === 2 && fallbackCityBand >= 1,
  );
  const { data: fallbackLocalBoundaryPayload } = useAtlasBoundaries(
    focusedCountryIso,
    "LOCAL",
    fallbackDetail === 2 && fallbackCityBand >= 2,
  );
  const fallbackActiveBoundaryPayload = fallbackCityBand === 0
    ? fallbackRegionBoundaryPayload
    : fallbackCityBand === 1
      ? fallbackDistrictBoundaryPayload?.available ? fallbackDistrictBoundaryPayload : fallbackRegionBoundaryPayload
      : fallbackCityBoundaryPayload?.available
        ? fallbackCityBoundaryPayload
        : fallbackLocalBoundaryPayload?.available
          ? fallbackLocalBoundaryPayload
          : fallbackDistrictBoundaryPayload?.available
            ? fallbackDistrictBoundaryPayload
            : fallbackRegionBoundaryPayload;
  const fallbackBoundaryFeatures = useMemo(
    () => fallbackActiveBoundaryPayload?.available
      ? fallbackActiveBoundaryPayload.features.map(normalizeBoundaryOrientation)
      : [],
    [fallbackActiveBoundaryPayload],
  );
  const fallbackContextBoundaryFeatures = useMemo(
    () => (
      fallbackDetail === 2
      && fallbackCityBand >= 2
      && (boundaryKindFor(fallbackActiveBoundaryPayload?.level, fallbackBoundaryFeatures) === "city"
        || boundaryKindFor(fallbackActiveBoundaryPayload?.level, fallbackBoundaryFeatures) === "localadmin")
      && fallbackDistrictBoundaryPayload?.available
    )
      ? fallbackDistrictBoundaryPayload.features.map(normalizeBoundaryOrientation)
      : [],
    [
      fallbackActiveBoundaryPayload?.level,
      fallbackBoundaryFeatures,
      fallbackCityBand,
      fallbackDetail,
      fallbackDistrictBoundaryPayload,
    ],
  );
  const fallbackBoundaryBounds = useMemo(
    () => fallbackBoundaryFeatures.map((feature) => geoBounds(feature)),
    [fallbackBoundaryFeatures],
  );
  const fallbackBoundaryKind = boundaryKindFor(fallbackActiveBoundaryPayload?.level, fallbackBoundaryFeatures);
  const fallbackDisplayPlaces = useMemo(() => {
    const featureByPlaceId = new Map(fallbackBoundaryFeatures.flatMap((feature) => {
      const id = feature.properties?.atlasPlaceId;
      return typeof id === "string" ? [[id, feature] as const] : [];
    }));
    return fallbackDetailedPlaces.map((place) => {
      const feature = featureByPlaceId.get(place.id);
      if (!feature) return place;
      return { ...place, ...boundaryFeatureCenter(feature) };
    });
  }, [fallbackBoundaryFeatures, fallbackDetailedPlaces]);
  const fallbackCityByName = useMemo(
    () => new Map(cities
      .filter((city) => countryEnergyKey(city.country) === focusedCityCountryKey)
      .map((city) => [normalizeLabelName(city.name), city])),
    [cities, focusedCityCountryKey],
  );
  const fallbackFocusedAgentEntries = useMemo<GlobeAgentEntry[]>(() => {
    const focusedCities = cities.filter((city) => countryEnergyKey(city.country) === focusedCityCountryKey);
    const cityById = new Map(focusedCities.map((city) => [city.id, city]));
    return [
      ...focusedCities.flatMap((city) => city.agents
        .filter((agent) => agent.status !== "offline")
        .map((agent) => ({ city, agent }))),
      ...presenceAgents.flatMap((agent) => {
        if (agent.status === "offline") return [];
        const city = cityById.get(agent.cityId);
        return city ? [{ city, agent }] : [];
      }),
    ];
  }, [cities, focusedCityCountryKey, presenceAgents]);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;

    const initialProgress = focusDistance === null
      ? Math.round(zoomProgressForDistance(GLOBE_MAX_DISTANCE))
      : Math.round(zoomProgressForDistance(focusDistance));
    const view = {
      lat: focusLocation.lat,
      lng: focusLocation.lng,
      progress: initialProgress,
      hoveredCountryKey: null as string | null,
      hoveredBoundaryIndex: null as number | null,
      hoveredAgentIndex: null as number | null,
    };
    let projection = geoOrthographic();
    let frame = 0;
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let wheelGestureLocked = false;
    let wheelGestureTimer: number | undefined;

    const detailForProgress = (progress: number): DetailLevel => {
      if (progress >= CITY_PROGRESS) return 2;
      return 1;
    };

    const isVisible = (lng: number, lat: number) => (
      geoDistance([view.lng, view.lat], [lng, lat]) < Math.PI / 2
    );

    const draw = () => {
      frame = 0;
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (element.width !== pixelWidth || element.height !== pixelHeight) {
        element.width = pixelWidth;
        element.height = pixelHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const maximumScale = 28;
      const standardProgress = Math.min(view.progress, 100);
      const scaleMultiplier = 0.72
        * Math.pow(maximumScale, standardProgress / 100)
        * deepCityMagnificationForProgress(view.progress);
      const globeRadius = Math.min(width, height) * 0.34 * scaleMultiplier;
      projection = geoOrthographic()
        .translate([width / 2, height / 2])
        .scale(globeRadius)
        .rotate([-view.lng, -view.lat, 0])
        .clipAngle(90)
        .precision(0.4);
      const path = geoPath(projection, context);

      const oceanGlow = context.createRadialGradient(
        width / 2 - globeRadius * 0.22,
        height / 2 - globeRadius * 0.25,
        globeRadius * 0.08,
        width / 2,
        height / 2,
        globeRadius,
      );
      oceanGlow.addColorStop(0, "#0b3543");
      oceanGlow.addColorStop(0.62, "#061b25");
      oceanGlow.addColorStop(1, "#02080d");
      context.beginPath();
      context.arc(width / 2, height / 2, globeRadius, 0, Math.PI * 2);
      context.fillStyle = oceanGlow;
      context.fill();
      context.strokeStyle = "rgba(99, 185, 202, 0.22)";
      context.lineWidth = 1;
      context.stroke();

      context.beginPath();
      path(geoGraticule10());
      context.strokeStyle = "rgba(80, 150, 164, 0.09)";
      context.lineWidth = 0.55;
      context.stroke();

      const detail = detailForProgress(view.progress);
      for (const country of fallbackCountries) {
        context.beginPath();
        path(country.feature);
        const density = agentDensityLevel(countryLiveAgents[country.key] ?? 0);
        const highlighted = country.key === view.hoveredCountryKey || country.key === selectedCountryKey;
        context.globalAlpha = highlighted ? 0.96 : 0.72;
        context.fillStyle = highlighted ? "#b48a3c" : density.color;
        context.fill();
        context.globalAlpha = 1;
        context.strokeStyle = highlighted ? "rgba(255, 220, 142, 0.92)" : "rgba(92, 164, 174, 0.34)";
        context.lineWidth = highlighted ? 1.35 : 0.55;
        context.stroke();
      }

      if (detail === 2) {
        fallbackContextBoundaryFeatures.forEach((feature) => {
          context.beginPath();
          path(feature);
          context.strokeStyle = "rgba(120, 211, 220, 0.68)";
          context.lineWidth = 0.78;
          context.stroke();
        });
        fallbackBoundaryFeatures.forEach((feature, index) => {
          const highlighted = index === view.hoveredBoundaryIndex;
          context.beginPath();
          path(feature);
          if (highlighted) {
            context.globalAlpha = 0.58;
            context.fillStyle = "#e8b957";
            context.fill();
            context.globalAlpha = 1;
          }
          context.strokeStyle = highlighted
            ? "rgba(255, 220, 142, 0.96)"
            : "rgba(146, 229, 234, 0.82)";
          context.lineWidth = highlighted ? 1.6 : 0.86;
          context.stroke();
        });
      }

      context.textAlign = "center";
      context.textBaseline = "middle";
      if (detail === 1) {
        context.font = "600 7px ui-monospace, SFMono-Regular, Menlo, monospace";
        context.fillStyle = "#d9b76b";
        for (const country of fallbackCountries) {
          if (country.rank > 2 || !isVisible(country.lng, country.lat)) continue;
          const point = projection([country.lng, country.lat]);
          if (!point) continue;
          context.fillText(country.name.toUpperCase(), point[0], point[1]);
        }
      }

      if (detail === 2) {
        context.font = "600 7px ui-monospace, SFMono-Regular, Menlo, monospace";
        if (cityBandForProgress(view.progress) === 0) {
          fallbackBoundaryFeatures.slice(0, 140).forEach((feature, index) => {
            const center = boundaryFeatureCenter(feature);
            if (!isVisible(center.lng, center.lat)) return;
            const point = projection([center.lng, center.lat]);
            if (!point) return;
            context.fillStyle = index === view.hoveredBoundaryIndex ? "#ffd36f" : "#8abdc5";
            context.fillText(boundaryFeatureName(feature).toUpperCase(), point[0], point[1]);
          });
        }
        const cityLimit = cityBandForProgress(view.progress) === 0
          ? 30
          : cityBandForProgress(view.progress) === 1
            ? 65
            : 140;
        const visibleCities = fallbackDisplayPlaces
          .filter((city) => isVisible(city.lng, city.lat))
          .slice(0, cityLimit);
        for (const city of visibleCities) {
          const point = projection([city.lng, city.lat]);
          if (!point) continue;
          const boundaryIndex = fallbackBoundaryFeatures.findIndex((feature) => (
            feature.properties?.atlasPlaceId === city.id
          ));
          context.fillStyle = boundaryIndex === view.hoveredBoundaryIndex ? "#ffd36f" : "#7fdde7";
          context.fillText(city.name.toUpperCase(), point[0], point[1]);
        }
      }

      if (detail === 2) {
        fallbackFocusedAgentEntries.forEach((entry, index) => {
          if (!isVisible(entry.agent.lng, entry.agent.lat)) return;
          const point = projection([entry.agent.lng, entry.agent.lat]);
          if (!point) return;
          const hovered = view.hoveredAgentIndex === index;
          const color = agentStatusColors[entry.agent.status];
          context.beginPath();
          context.arc(point[0], point[1], hovered ? 3.2 : 2, 0, Math.PI * 2);
          context.fillStyle = "rgba(2, 8, 12, 0.96)";
          context.fill();
          context.strokeStyle = color;
          context.lineWidth = hovered ? 1.4 : 0.9;
          context.stroke();
          context.beginPath();
          context.arc(point[0], point[1], hovered ? 1.25 : 0.75, 0, Math.PI * 2);
          context.fillStyle = color;
          context.fill();
        });
      }

      if (view.hoveredAgentIndex !== null) {
        const hovered = fallbackFocusedAgentEntries[view.hoveredAgentIndex];
        if (hovered) {
          context.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
          context.fillStyle = agentStatusColors[hovered.agent.status];
          context.textAlign = "left";
          context.fillText(`${hovered.agent.name.toUpperCase()} · ${hovered.agent.status.toUpperCase()}`, 22, height - 28);
        }
      } else if (view.hoveredBoundaryIndex !== null) {
        const hovered = fallbackBoundaryFeatures[view.hoveredBoundaryIndex];
        if (hovered) {
          context.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
          context.fillStyle = "#f0c66f";
          context.textAlign = "left";
          context.fillText(boundaryFeatureName(hovered).toUpperCase(), 22, height - 28);
        }
      } else if (view.hoveredCountryKey) {
        const hovered = fallbackCountries.find((country) => country.key === view.hoveredCountryKey);
        if (hovered) {
          context.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
          context.fillStyle = "#f0c66f";
          context.textAlign = "left";
          context.fillText(hovered.name.toUpperCase(), 22, height - 28);
        }
      }
    };

    const requestDraw = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    const pointerPosition = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    const hitCountry = (x: number, y: number) => {
      const location = projection.invert?.([x, y]);
      if (!location) return null;
      return fallbackCountries.find((country) => geoContains(country.geometry, location)) ?? null;
    };
    const hitBoundary = (x: number, y: number) => {
      const location = projection.invert?.([x, y]);
      if (!location) return null;
      const index = fallbackBoundaryFeatures.findIndex((feature, featureIndex) => (
        boundaryBoundsContain(fallbackBoundaryBounds[featureIndex], location[0], location[1])
        && geoContains(feature, location)
      ));
      return index < 0 ? null : {
        index,
        feature: fallbackBoundaryFeatures[index],
        center: boundaryFeatureCenter(fallbackBoundaryFeatures[index]),
      };
    };
    const hitAgent = (x: number, y: number) => {
      if (detailForProgress(view.progress) !== 2) return null;
      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < fallbackFocusedAgentEntries.length; index += 1) {
        const entry = fallbackFocusedAgentEntries[index];
        if (!isVisible(entry.agent.lng, entry.agent.lat)) continue;
        const point = projection([entry.agent.lng, entry.agent.lat]);
        if (!point) continue;
        const distance = Math.hypot(point[0] - x, point[1] - y);
        if (distance <= 9 && distance < nearestDistance) {
          nearestIndex = index;
          nearestDistance = distance;
        }
      }
      return nearestIndex < 0
        ? null
        : {
          index: nearestIndex,
          distance: nearestDistance,
          entry: fallbackFocusedAgentEntries[nearestIndex],
        };
    };
    const onPointerDown = (event: PointerEvent) => {
      const point = pointerPosition(event);
      dragging = true;
      moved = false;
      lastX = point.x;
      lastY = point.y;
      element.setPointerCapture(event.pointerId);
      element.style.cursor = "grabbing";
    };
    const onPointerMove = (event: PointerEvent) => {
      const point = pointerPosition(event);
      if (dragging) {
        const deltaX = point.x - lastX;
        const deltaY = point.y - lastY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 1) moved = true;
        const dragSensitivity = dragSensitivityForProgress(view.progress);
        view.lng = normalizeLongitude(view.lng - deltaX * 0.22 * dragSensitivity);
        view.lat = THREE.MathUtils.clamp(view.lat + deltaY * 0.18 * dragSensitivity, -82, 82);
        lastX = point.x;
        lastY = point.y;
      } else {
        const agent = hitAgent(point.x, point.y);
        const boundary = detailForProgress(view.progress) >= 2
          ? hitBoundary(point.x, point.y)
          : null;
        view.hoveredAgentIndex = agent?.index ?? null;
        view.hoveredBoundaryIndex = agent ? null : boundary?.index ?? null;
        view.hoveredCountryKey = agent || boundary ? null : hitCountry(point.x, point.y)?.key ?? null;
        element.style.cursor = view.hoveredAgentIndex !== null || view.hoveredBoundaryIndex !== null || view.hoveredCountryKey ? "pointer" : "grab";
      }
      requestDraw();
    };
    const onPointerUp = (event: PointerEvent) => {
      const point = pointerPosition(event);
      dragging = false;
      element.releasePointerCapture(event.pointerId);
      element.style.cursor = "grab";
      if (moved) return;

      if (detailForProgress(view.progress) >= 2) {
        const agent = hitAgent(point.x, point.y);
        if (agent) {
          onAgentSelect(agent.entry.city, agent.entry.agent);
          return;
        }
        const boundary = hitBoundary(point.x, point.y);
        if (boundary) {
          view.lng = boundary.center.lng;
          view.lat = THREE.MathUtils.clamp(boundary.center.lat, -82, 82);
          view.hoveredBoundaryIndex = null;
          requestDraw();
          const city = fallbackCityByName.get(normalizeLabelName(boundaryFeatureName(boundary.feature)));
          if (city) {
            onSelect(city);
          } else {
            onCityAreaSelect({
              name: boundaryFeatureName(boundary.feature),
              lat: boundary.center.lat,
              lng: boundary.center.lng,
              countryKey: focusedCityCountryKey,
              countryName: countryLabelByKey.get(focusedCityCountryKey)?.name ?? selectedCity.country,
              boundaryKind: fallbackBoundaryKind,
            });
          }
          return;
        }
      }

      const country = hitCountry(point.x, point.y);
      if (country) {
        onCountrySelect({
          name: country.name,
          key: country.key,
          lat: country.lat,
          lng: country.lng,
          distance: COUNTRY_FOCUS_DISTANCE,
        });
      }
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY === 0) return;
      if (wheelGestureTimer !== undefined) window.clearTimeout(wheelGestureTimer);
      wheelGestureTimer = window.setTimeout(() => {
        wheelGestureLocked = false;
      }, 120);
      if (wheelGestureLocked) return;
      wheelGestureLocked = true;
      const previousDetail = detailForProgress(view.progress);
      const progressStep = previousDetail >= 2
        ? (100 - CITY_PROGRESS) / (ZOOM_SCROLLS_PER_LEVEL * 2)
        : CITY_PROGRESS / ZOOM_SCROLLS_PER_LEVEL;
      view.progress = THREE.MathUtils.clamp(
        view.progress - Math.sign(event.deltaY) * progressStep,
        0,
        DEEP_ZOOM_PROGRESS_LIMIT,
      );
      const nextDetail = detailForProgress(view.progress);
      setFallbackCityBand(cityBandForProgress(view.progress));
      onZoomChange(view.progress);
      if (nextDetail !== previousDetail) {
        setFallbackDetail(nextDetail);
        onDetailChange(nextDetail);
      }
      requestDraw();
    };
    const observer = new ResizeObserver(requestDraw);
    observer.observe(element);
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("wheel", onWheel, { passive: false });
    onZoomChange(view.progress);
    const initialDetail = detailForProgress(view.progress);
    setFallbackDetail(initialDetail);
    setFallbackCityBand(cityBandForProgress(view.progress));
    onDetailChange(initialDetail);
    requestDraw();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (wheelGestureTimer !== undefined) window.clearTimeout(wheelGestureTimer);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("wheel", onWheel);
    };
  }, [
    cities,
    countryLiveAgents,
    fallbackBoundaryFeatures,
    fallbackBoundaryBounds,
    fallbackBoundaryKind,
    fallbackContextBoundaryFeatures,
    fallbackCountries,
    fallbackCityByName,
    fallbackDisplayPlaces,
    fallbackFocusedAgentEntries,
    focusDistance,
    focusLocation.lat,
    focusLocation.lng,
    focusedCityCountryKey,
    onCityAreaSelect,
    onAgentSelect,
    onCountrySelect,
    onDetailChange,
    onSelect,
    onZoomChange,
    selectedCity,
    selectedCountryKey,
  ]);

  return (
    <div className="canvasWorldFallback" aria-label="Interactive Atlas compatibility globe">
      <canvas ref={canvas} />
      <span className="canvasWorldMode"><Globe2 size={11} /> 2D MAP · COMPATIBILITY MODE</span>
    </div>
  );
}

class GlobeRendererBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

function EarthScene({
  cities,
  selectedCity,
  cityAreaTarget,
  countryTarget,
  viewTarget,
  viewRevision,
  streetViewRequested,
  layer,
  liveCounts = {},
  presenceAgents = [],
  onSelect,
  onCountrySelect,
  onCityAreaSelect,
  onStreetViewChange,
  onAgentSelect,
  onDetailChange,
  onZoomChange,
}: {
  cities: City[];
  selectedCity: City;
  cityAreaTarget: CityAreaSelection | null;
  countryTarget: CountrySelection | null;
  viewTarget: RegionView | null;
  viewRevision: number;
  streetViewRequested: boolean;
  layer: Layer;
  liveCounts: Record<string, number>;
  presenceAgents: Agent[];
  onSelect: (city: City) => void;
  onCountrySelect: (country: CountrySelection) => void;
  onCityAreaSelect: (area: CityAreaSelection) => void;
  onStreetViewChange: (active: boolean) => void;
  onAgentSelect: (city: City, agent: Agent) => void;
  onDetailChange: (level: DetailLevel) => void;
  onZoomChange: (progress: number) => void;
}) {
  const [streetState, setStreetState] = useState<{ cityId: string; center: GeoCenter } | null>(null);
  const [streetRendererActive, setStreetRendererActive] = useState(false);
  const [sceneDetail, setSceneDetail] = useState<DetailLevel>(1);
  const [rendererAvailability, setRendererAvailability] = useState<"checking" | "available" | "unavailable">("checking");
  const streetCenter = streetState?.cityId === selectedCity.id
    ? streetState.center
    : null;
  const focusLocation = viewTarget ?? cityAreaTarget ?? countryTarget ?? { lat: selectedCity.lat, lng: selectedCity.lng };
  const globeFocusDistance = viewTarget?.distance
    ?? (cityAreaTarget ? CITY_SELECTION_DISTANCE : null)
    ?? countryTarget?.distance
    ?? null;
  const focusedCountryKey = cityAreaTarget?.countryKey ?? countryTarget?.key ?? countryEnergyKey(selectedCity.country);
  const streetViewAvailable = Boolean(
    cityAreaTarget?.cityId === selectedCity.id
    && hasCompleteDeepDetail(cityAreaTarget.countryKey)
    && selectedCity.streets.length > 0
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setStreetRendererActive(Boolean(streetCenter));
    }, RENDERER_RELEASE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [streetCenter]);

  useEffect(() => {
    let releaseTimeout: number | undefined;
    const syncTimeout = window.setTimeout(() => {
      if (streetViewRequested && !streetViewAvailable) {
        onStreetViewChange(false);
        return;
      }

      if (streetViewRequested && streetViewAvailable) {
        if (streetState?.cityId === selectedCity.id) return;
        setRendererAvailability("checking");
        setSceneDetail(2);
        onDetailChange(2);
        onZoomChange(100);
        setStreetState({
          cityId: selectedCity.id,
          center: { lat: selectedCity.lat, lng: selectedCity.lng },
        });
        return;
      }

      if (!streetState) return;
      setRendererAvailability("checking");
      setStreetRendererActive(false);
      setSceneDetail(2);
      onDetailChange(2);
      onZoomChange(zoomProgressForDistance(CITY_SELECTION_DISTANCE));
      releaseTimeout = window.setTimeout(() => setStreetState(null), RENDERER_RELEASE_DELAY_MS);
    }, 0);

    return () => {
      window.clearTimeout(syncTimeout);
      if (releaseTimeout !== undefined) window.clearTimeout(releaseTimeout);
    };
  }, [
    onDetailChange,
    onStreetViewChange,
    onZoomChange,
    selectedCity.id,
    selectedCity.lat,
    selectedCity.lng,
    streetState,
    streetViewAvailable,
    streetViewRequested,
  ]);

  const handleSceneDetailChange = useCallback((level: DetailLevel) => {
    setSceneDetail(level);
    onDetailChange(level);
  }, [onDetailChange]);

  const selectActivityCity = useCallback((city: City) => {
    setStreetState(null);
    setStreetRendererActive(false);
    onStreetViewChange(false);
    onSelect(city);
  }, [onSelect, onStreetViewChange]);

  const selectActivityCountry = useCallback((country: CountrySelection) => {
    setStreetState(null);
    setStreetRendererActive(false);
    onStreetViewChange(false);
    onCountrySelect(country);
  }, [onCountrySelect, onStreetViewChange]);

  const showGlobeRenderer = !streetCenter && !streetRendererActive;
  const showStreetRenderer = Boolean(streetCenter && streetRendererActive);
  const globeRendererReady = showGlobeRenderer && rendererAvailability === "available";
  const handingOffRenderer = (!showGlobeRenderer && !showStreetRenderer)
    || (showGlobeRenderer && rendererAvailability === "checking");

  useEffect(() => {
    if (!showGlobeRenderer || rendererAvailability !== "checking") return;

    const probe = document.createElement("canvas");
    const attributes: WebGLContextAttributes = {
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    };
    const context = probe.getContext("webgl2", attributes) ?? probe.getContext("webgl", attributes);

    if (!context) {
      const timeout = window.setTimeout(() => setRendererAvailability("unavailable"), 0);
      return () => window.clearTimeout(timeout);
    }

    context.getExtension("WEBGL_lose_context")?.loseContext();
    const timeout = window.setTimeout(() => {
      setRendererAvailability("available");
    }, RENDERER_RELEASE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [rendererAvailability, showGlobeRenderer]);

  const compatibilityGlobe = (
    <CanvasWorldFallback
      cities={cities}
      selectedCity={selectedCity}
      selectedCountryKey={focusedCountryKey}
      focusLocation={focusLocation}
      focusDistance={globeFocusDistance}
      liveCounts={liveCounts}
      presenceAgents={presenceAgents}
      onSelect={selectActivityCity}
      onAgentSelect={onAgentSelect}
      onCountrySelect={selectActivityCountry}
      onCityAreaSelect={onCityAreaSelect}
      onDetailChange={handleSceneDetailChange}
      onZoomChange={onZoomChange}
    />
  );

  return (
    <>
      {globeRendererReady && (
        <GlobeRendererBoundary
          fallback={compatibilityGlobe}
        >
          <div className="earthCanvasLayer">
            <Canvas
              camera={{ position: [0, 0.1, GLOBE_MAX_DISTANCE], fov: 38, near: 0.001, far: 70 }}
              dpr={[1, 1.35]}
              gl={{
                alpha: true,
                antialias: false,
                powerPreference: "high-performance",
                failIfMajorPerformanceCaveat: false,
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.08,
              }}
            >
              <ambientLight intensity={0.24} color="#7ab9e8" />
              <directionalLight position={[5, 3, 5]} intensity={2.35} color="#d9edff" />
              <directionalLight position={[-4, -2, 1]} intensity={0.44} color="#6d47ff" />
              <Stars radius={36} depth={18} count={1200} factor={1.5} saturation={0.25} fade speed={0.18} />
              <Suspense fallback={null}>
                <Earth
                  cities={cities}
                  selectedCity={selectedCity}
                  selectedCountryKey={focusedCountryKey}
                  focusLocation={focusLocation}
                  focusDistance={globeFocusDistance}
                  focusRevision={viewRevision}
                  layer={layer}
                  liveCounts={liveCounts}
                  presenceAgents={presenceAgents}
                  onSelect={selectActivityCity}
                  onAgentSelect={onAgentSelect}
                  onCountrySelect={selectActivityCountry}
                  onCityAreaSelect={onCityAreaSelect}
                  onDetailChange={handleSceneDetailChange}
                  onZoomChange={onZoomChange}
                />
              </Suspense>
              <OrbitControls
                makeDefault
                enableRotate={false}
                enablePan={false}
                enableZoom
                enableDamping
                dampingFactor={0.1}
                zoomSpeed={sceneDetail >= 2 ? CITY_ZOOM_SPEED : COUNTRY_ZOOM_SPEED}
                minDistance={CITY_DEEP_ZOOM_DISTANCE}
                maxDistance={GLOBE_MAX_DISTANCE}
              />
              <fog attach="fog" args={["#020508", 11, 42]} />
            </Canvas>
          </div>
        </GlobeRendererBoundary>
      )}
      {showGlobeRenderer && rendererAvailability === "unavailable" && (
        compatibilityGlobe
      )}
      {showStreetRenderer && streetCenter && (
        <StreetMap
          center={streetCenter}
          city={selectedCity}
          onAgentSelect={(agent) => onAgentSelect(selectedCity, agent)}
        />
      )}
      {handingOffRenderer && (
        <div className="rendererHandoff" role="status">
          <div className="rendererHandoffStatus">
            <i />
            <span>{streetCenter ? "DESCENDING TO STREET GRID" : "RESTORING GLOBE VIEW"}</span>
            <small>{selectedCity.name.toUpperCase()} · NORTH LOCKED</small>
          </div>
        </div>
      )}
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

function atlasPresenceToAgent(presence: AtlasPresence, city: City): Agent {
  const inactive = presence.status === "Offline" || presence.activity === "Offline";
  const idle = presence.status === "Away" || ["Idle", "Sleeping"].includes(presence.activity);
  const working = presence.status === "Focused" || (!inactive && !idle && presence.activity !== "Custom");
  const status: Agent["status"] = inactive ? "offline" : idle ? "idle" : working ? "working" : "online";
  return {
    id: `presence-${presence.id}`,
    cityId: city.id,
    name: presence.displayName,
    runtime: "Atlas Presence",
    packageName: "atlas-presence",
    packageVersion: "live",
    status,
    activity: presence.activity,
    topic: presence.topic,
    detail: presence.detail,
    lat: presence.latitude,
    lng: presence.longitude,
    energy: status === "working" ? 80 : status === "online" ? 55 : status === "idle" ? 25 : 0,
    lastSeenAt: presence.updatedAt,
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

function CityProfileCard({
  selection,
  city,
  liveCounts,
  onTopicSelect,
  onAgentSelect,
  onCollapse,
}: {
  selection: CityAreaSelection;
  city: City | null;
  liveCounts: Record<string, number>;
  onTopicSelect: (topic: string) => void;
  onAgentSelect: (city: City, agent: Agent) => void;
  onCollapse: () => void;
}) {
  const connectedAgents = city ? liveCounts[city.name] ?? 0 : 0;
  const liveAgents = city
    ? city.agents.filter((agent) => agent.status !== "offline").length + connectedAgents
    : 0;
  const observedAgents = city ? city.agents.length + connectedAgents : 0;
  const workingAgents = city ? city.agents.filter((agent) => agent.status === "working").length : 0;
  const density = agentDensityLevel(liveAgents);
  const densityBarWidth = agentDensityBarWidth(density);
  const topics = city
    ? city.hotTopics.length
      ? city.hotTopics
      : city.topics.map((topic) => ({ topic, events: 0, energy: 0 }))
    : [];
  const roster = city?.agents.slice(0, 12) ?? [];
  const hiddenAgentCount = city ? Math.max(0, city.agents.length - roster.length) : 0;
  const profileKind = boundaryKindLabel(selection.boundaryKind);

  return (
    <aside className="citySignal countrySignal glassPanel" aria-live="polite" aria-label={`${selection.name} ${profileKind.toLowerCase()} profile`}>
      <div className="signalHeader countrySignalHeader">
        <div>
          <span className="eyebrow">{profileKind} PROFILE · {selection.countryName.toUpperCase()}</span>
          <h1>{selection.name}</h1>
        </div>
        <div className="signalHeaderActions">
          <LocateFixed size={18} />
          <button type="button" className="panelCollapseButton" onClick={onCollapse} aria-label="Collapse City Profile" aria-expanded="true" title="Collapse City Profile">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <p className="countryCoordinateLine">
        Centered at {Math.abs(selection.lat).toFixed(2)}°{selection.lat >= 0 ? "N" : "S"} · {Math.abs(selection.lng).toFixed(2)}°{selection.lng >= 0 ? "E" : "W"}
      </p>
      <div className="activityTotal countryActivityTotal">
        <span style={{ background: density.color, boxShadow: `0 0 11px ${density.color}` }} />
        <strong>{liveAgents.toLocaleString()}</strong>
        <small>live agents</small>
        <em>{workingAgents} working</em>
      </div>
      <div className="energyMeter" aria-label={`${selection.name} energy level ${density.level}, ${liveAgents} live agents`}>
        <div><span>ENERGY LEVEL</span><b style={{ color: density.color }}>LEVEL {density.level} · {density.label}</b></div>
        <div className="energyMeterTrack" aria-hidden="true"><i style={{ width: `${densityBarWidth}%`, background: density.color, boxShadow: `0 0 12px ${density.color}` }} /></div>
        <small>Calculated directly from the number of agents currently live in this {profileKind.toLowerCase()}</small>
      </div>
      <div className="countrySummaryGrid" aria-label={`${selection.name} network summary`}>
        <span><b>{observedAgents.toLocaleString()}</b><small>Observed</small></span>
        <span><b>{liveAgents.toLocaleString()}</b><small>Live</small></span>
        <span><b>{workingAgents.toLocaleString()}</b><small>Working</small></span>
      </div>
      {city ? (
        <>
          <div className="countrySectionLabel">HOT TOPICS · 24H</div>
          <div className="topicList">
            {topics.map((topic, index) => (
              <button key={topic.topic} onClick={() => onTopicSelect(topic.topic)}>
                <span>0{index + 1}</span>{topic.topic}<small>{topic.events || "LIVE"}</small><ChevronRight size={13} />
              </button>
            ))}
          </div>
          <div className="countrySectionLabel">LIVE AGENT NETWORK</div>
          <div className="agentRoster" aria-label={`${selection.name} agents`}>
            {roster.map((agent) => (
              <button key={agent.id} onClick={() => onAgentSelect(city, agent)} aria-label={`Open ${agent.name} agent signal`}>
                <i style={{ background: agentStatusColors[agent.status], boxShadow: `0 0 8px ${agentStatusColors[agent.status]}` }} />
                <span><b>{agent.name}</b><small>{agent.activity} · {agent.topic}</small></span>
                <em>{agent.status}</em>
              </button>
            ))}
            {hiddenAgentCount > 0 && (
              <div className="agentRosterMore"><Bot size={11} />+{hiddenAgentCount} more agents available in Street View</div>
            )}
          </div>
          <button className="viewSignals agentSearchLink" onClick={() => onTopicSelect(selection.name)}>View all city signals <ArrowUpRight size={12} /></button>
        </>
      ) : (
        <div className="countryNoSignal">
          <Radio size={18} />
          <span><b>Awaiting Atlas signals</b><small>No connected agents are reporting from this {profileKind.toLowerCase()} yet.</small></span>
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
          <div className="ownedAgentEmpty"><Bot size={17} /><span><b>No device agents linked yet</b><small>Run <code>npx atlas-ai-sdk setup codex</code> from an agent terminal.</small></span></div>
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
  const [selectedCityArea, setSelectedCityArea] = useState<CityAreaSelection | null>(() => cityAreaSelectionFromCity(cities[0]));
  const [selectedCountry, setSelectedCountry] = useState<CountrySelection | null>(null);
  const [streetViewRequested, setStreetViewRequested] = useState(false);
  const [regionViewId, setRegionViewId] = useState<RegionViewId | null>(null);
  const [regionViewRevision, setRegionViewRevision] = useState(0);
  const [layer, setLayer] = useState<Layer>("Attention");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(1);
  const [zoomProgress, setZoomProgress] = useState(() => Math.round(zoomProgressForDistance(GLOBE_MAX_DISTANCE)));
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
  const activeFocusLocation = activeRegionView ?? selectedCityArea ?? selectedCountry ?? selectedCity;
  const streetViewAvailable = Boolean(
    selectedCityArea?.cityId === selectedCity.id
    && hasCompleteDeepDetail(selectedCityArea.countryKey)
    && selectedCity.streets.length > 0
  );
  const zoomStops = [
    { level: 1 as DetailLevel, label: "Country", position: 0 },
    { level: 2 as DetailLevel, label: "City", position: CITY_PROGRESS },
  ];
  const zoomTrackProgress = Math.min(zoomProgress, 100);
  const deepCityMagnification = deepCityMagnificationForProgress(zoomProgress);
  const deepCityZoomActive = zoomProgress > 100;
  const visiblePresenceFeed = useMemo(
    () => presence.configured || joined ? presence.presenceFeed : [],
    [joined, presence.configured, presence.presenceFeed],
  );
  const connectedAtlasAgents = useMemo(() => visiblePresenceFeed.flatMap((item) => {
    if (item.entityKind !== "ai") return [];
    const city = cities.find((candidate) => normalizeLabelName(candidate.name) === normalizeLabelName(item.city));
    return city ? [atlasPresenceToAgent(item, city)] : [];
  }), [cities, visiblePresenceFeed]);

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

  const handleZoomChange = useCallback((progress: number) => {
    const nextProgress = Math.round(THREE.MathUtils.clamp(progress, 0, DEEP_ZOOM_PROGRESS_LIMIT));
    setZoomProgress((current) => current === nextProgress ? current : nextProgress);
  }, []);

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
            distance: COUNTRY_FOCUS_DISTANCE,
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
    setSelectedCityArea(cityAreaSelectionFromCity(city));
    setStreetViewRequested(false);
    setProfile(null);
  }, []);

  const focusCityArea = useCallback((area: CityAreaSelection) => {
    setRegionViewRevision((revision) => revision + 1);
    setRegionViewId(null);
    setSelectedCountry(null);
    setSelectedCityArea(area);
    setStreetViewRequested(false);
    setNetworkCollapsed(false);
    setProfile(null);
  }, []);

  const focusCountry = useCallback((country: CountrySelection) => {
    setRegionViewRevision((revision) => revision + 1);
    setRegionViewId(null);
    setSelectedCountry(country);
    setSelectedCityArea(null);
    setStreetViewRequested(false);
    const countryAnchor = cities.find((city) => countryEnergyKey(city.country) === country.key);
    if (countryAnchor) setSelectedCityId(countryAnchor.id);
    setProfile(null);
  }, [cities]);

  const chooseRegionView = (nextViewId: RegionViewId) => {
    setRegionViewRevision((revision) => revision + 1);
    setRegionViewId(nextViewId);
    setSelectedCountry(null);
    setSelectedCityArea(null);
    setStreetViewRequested(false);
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
        <EarthScene
          cities={cities}
          selectedCity={selectedCity}
          cityAreaTarget={selectedCityArea}
          countryTarget={selectedCountry}
          viewTarget={activeRegionView}
          viewRevision={regionViewRevision}
          streetViewRequested={streetViewRequested}
          layer={layer}
          liveCounts={liveCounts}
          presenceAgents={connectedAtlasAgents}
          onSelect={focusCity}
          onCountrySelect={focusCountry}
          onCityAreaSelect={focusCityArea}
          onStreetViewChange={setStreetViewRequested}
          onAgentSelect={chooseAgent}
          onDetailChange={setDetailLevel}
          onZoomChange={handleZoomChange}
        />
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
            <span>LIVE AGENTS · COUNTRY ENERGY</span>
            <p>Area color = agents live now</p>
            <div className="energyLevelLegend">
              {agentDensityLevels.map((density) => (
                <small key={density.level}><i style={{ background: density.color, boxShadow: `0 0 7px ${density.color}` }} /><b>{density.label}</b></small>
              ))}
            </div>
          </div>
          <div className="statusLegend">
            <span>INDIVIDUAL AGENTS · CITY</span>
            <p>One dot = one agent at its reported approximate location</p>
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
        <CityProfileCard
          selection={selectedCityArea ?? cityAreaSelectionFromCity(selectedCity)}
          city={!selectedCityArea || selectedCityArea.cityId === selectedCity.id ? selectedCity : null}
          liveCounts={liveCounts}
          onCollapse={() => setNetworkCollapsed(true)}
          onTopicSelect={openSearch}
          onAgentSelect={chooseAgent}
        />
      )}

      <div className="zoomIndicator glassPanel" aria-live="polite">
        <div className="zoomIndicatorHeader">
          <span>{deepCityZoomActive ? `DEEP CITY · ${deepCityMagnification.toFixed(1)}×` : `ZOOM · ${zoomProgress}%`}</span>
          <b>{detailLabels[detailLevel].title}</b>
          <small>OPEN ZOOM</small>
        </div>
        <div
          className="zoomScale"
          role="progressbar"
          aria-label={`Map zoom level: ${detailLabels[detailLevel].title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={zoomTrackProgress}
          aria-valuetext={deepCityZoomActive
            ? `Deep city zoom, ${deepCityMagnification.toFixed(1)} times magnification`
            : `${zoomProgress} percent`}
        >
          <div className="zoomScaleTrack" aria-hidden="true">
            <i className="zoomScaleFill" style={{ width: `${zoomTrackProgress}%` }} />
            <i className="zoomScaleThumb" style={{ left: `${zoomTrackProgress}%` }} />
            {zoomStops.map((stop) => (
              <i
                key={stop.label}
                className={`zoomScaleBreakpoint ${stop.level <= detailLevel ? "active" : ""}`}
                style={{ left: `${stop.position}%` }}
              />
            ))}
          </div>
          <div className="zoomScaleLabels" aria-hidden="true">
            {zoomStops.map((stop) => (
              <span
                key={stop.label}
                className={stop.level === detailLevel ? "active" : ""}
                style={{ left: `${stop.position}%` }}
              >
                {stop.label}
              </span>
            ))}
          </div>
        </div>
        {streetViewAvailable && (
          <button
            type="button"
            className="zoomViewToggle"
            onClick={() => setStreetViewRequested((active) => !active)}
          >
            {streetViewRequested ? <Globe2 size={13} /> : <LocateFixed size={13} />}
            {streetViewRequested ? "Show Globe" : "Show Street View"}
          </button>
        )}
        {detailLevel === 2 && !streetViewRequested && (
          <div className="geographyCredit">
            PLACES <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GEONAMES</a>
            <span /> GLOBAL BORDERS <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">GEOBOUNDARIES</a> · ADM1–ADM3
            <span /> US CITIES <a href="https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer" target="_blank" rel="noreferrer">CENSUS TIGERWEB</a>
          </div>
        )}
      </div>

      {!streetViewRequested && <div className="dragHint"><Move size={13} /><span>Drag to rotate · Scroll or pinch to zoom</span></div>}

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
              {!joined ? (
                <AtlasAuthOptions
                  busy={presence.busy}
                  onOAuth={beginSignIn}
                  onEmail={presence.signInWithEmail}
                />
              ) : <button className="primaryWide" onClick={() => { setJoinOpen(false); setPresenceOpen(true); }}>Edit your presence <ArrowUpRight size={15} /></button>}
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
