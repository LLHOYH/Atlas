"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, QuadraticBezierLine, Stars } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import atlasGeoData from "./atlas-geo-data.json";
import atlasLabelData from "./atlas-label-data.json";
import {
  ArrowUpRight,
  Bot,
  Check,
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
  Users,
  X,
  Zap,
} from "lucide-react";
import * as THREE from "three";
import { useAtlasPresence } from "../hooks/useAtlasPresence";
import { useAtlasWorld } from "../hooks/useAtlasWorld";
import {
  controlStates,
  presenceActivities,
  type AtlasPresence,
  type PresenceDraft,
} from "../lib/atlas/types";
import type { AtlasCity as City, AtlasSignal as Signal } from "../lib/atlas/world";

const layers = ["Attention", "AI", "Technology", "Travel"] as const;
type Layer = (typeof layers)[number];
type DetailLevel = 1 | 2 | 3 | 4;

const detailLabels: Record<DetailLevel, { title: string; note: string }> = {
  1: { title: "COUNTRIES", note: "Country names" },
  2: { title: "REGIONS", note: "State & region names" },
  3: { title: "CITIES", note: "City names" },
  4: { title: "STREETS", note: "Named street mesh" },
};

const layerColors: Record<Layer, string> = {
  Attention: "#a68cff",
  AI: "#b684ff",
  Technology: "#59bdff",
  Travel: "#67e9bc",
};

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
  const distanceFactor = kind === "country" ? 1.875 : kind === "region" ? 1.5 : kind === "city" ? 2.5 : 0.9;

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
        zoom: 11.5,
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
            minzoom: 13.5,
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
                  1.72,
                  0.76,
                ],
              ],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.88,
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
        <small>OpenStreetMap vector detail</small>
      </div>
      <button className="streetMapReturn glassPanel" onClick={exitStreetView}>
        <Globe2 size={13} /> Return to globe
      </button>
      <div className="streetMapHint">Drag to move · Scroll to zoom · Zoom out to return</div>
    </div>
  );
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function seededRandom(seedValue: number) {
  let seed = seedValue || 1;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function PixelLand() {
  const blocks = useRef<THREE.InstancedMesh>(null);
  const landCells = atlasGeoData.cells;
  const hoveredCountry = useRef<string | null>(null);
  const hoverStrengths = useMemo(() => new Float32Array(landCells.length), [landCells.length]);
  const gold = useMemo(() => new THREE.Color("#e6bf65"), []);
  const instanceData = useMemo(() => {
    const outward = new THREE.Vector3(0, 0, 1);
    const palettes = ["#183941", "#1b4148", "#203a46", "#23444a", "#263a45", "#1c4650"];

    return landCells.map((cell) => {
      const position = latLngToVector3(cell.lat, cell.lng, 3.018);
      const normal = position.clone().normalize();
      const countryHash = hashString(cell.name);
      const latitudeScale = Math.max(0.42, Math.cos((cell.lat * Math.PI) / 180));
      const variance = 0.88 + (countryHash % 17) / 100;
      return {
        country: cell.name,
        position,
        normal,
        quaternion: new THREE.Quaternion().setFromUnitVectors(outward, normal),
        scaleX: latitudeScale * variance,
        scaleY: variance,
        color: new THREE.Color(palettes[countryHash % palettes.length]),
      };
    });
  }, [landCells]);

  const borderGeometry = useMemo(() => {
    const positions: number[] = [];
    for (let index = 0; index < atlasGeoData.borderPositions.length; index += 4) {
      const start = latLngToVector3(
        atlasGeoData.borderPositions[index],
        atlasGeoData.borderPositions[index + 1],
        3.052,
      );
      const end = latLngToVector3(
        atlasGeoData.borderPositions[index + 2],
        atlasGeoData.borderPositions[index + 3],
        3.052,
      );
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, []);

  useLayoutEffect(() => {
    if (!blocks.current) return;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    instanceData.forEach((cell, index) => {
      scale.set(cell.scaleX, cell.scaleY, 1);
      matrix.compose(cell.position, cell.quaternion, scale);
      blocks.current?.setMatrixAt(index, matrix);
      blocks.current?.setColorAt(index, cell.color);
    });
    blocks.current.instanceMatrix.needsUpdate = true;
    if (blocks.current.instanceColor) blocks.current.instanceColor.needsUpdate = true;
  }, [instanceData]);

  useFrame((_, delta) => {
    if (!blocks.current) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    let changed = false;

    instanceData.forEach((cell, index) => {
      const target = hoveredCountry.current === cell.country ? 1 : 0;
      const current = hoverStrengths[index];
      const next = THREE.MathUtils.damp(current, target, 11, delta);
      if (Math.abs(next - current) < 0.0001) return;
      hoverStrengths[index] = next;
      position.copy(cell.position).addScaledVector(cell.normal, next * 0.07);
      scale.set(cell.scaleX, cell.scaleY, 1 + next * 4.2);
      matrix.compose(position, cell.quaternion, scale);
      color.copy(cell.color).lerp(gold, next * 0.9);
      blocks.current?.setMatrixAt(index, matrix);
      blocks.current?.setColorAt(index, color);
      changed = true;
    });

    if (changed) {
      blocks.current.instanceMatrix.needsUpdate = true;
      if (blocks.current.instanceColor) blocks.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh>
        <sphereGeometry args={[2.995, 72, 72]} />
        <meshStandardMaterial color="#020a0e" roughness={0.94} metalness={0.12} emissive="#031017" emissiveIntensity={0.8} />
      </mesh>
      <mesh scale={1.001}>
        <sphereGeometry args={[3, 36, 24]} />
        <meshBasicMaterial color="#245c68" wireframe transparent opacity={0.07} depthWrite={false} />
      </mesh>
      <instancedMesh
        ref={blocks}
        args={[undefined, undefined, landCells.length]}
        frustumCulled={false}
        onPointerMove={(event) => {
          if (event.instanceId === undefined) return;
          hoveredCountry.current = instanceData[event.instanceId]?.country ?? null;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          hoveredCountry.current = null;
          document.body.style.cursor = "grab";
        }}
      >
        <boxGeometry args={[0.205, 0.205, 0.04]} />
        <meshStandardMaterial color="#d9ffff" roughness={0.72} metalness={0.08} vertexColors />
      </instancedMesh>
      <lineSegments geometry={borderGeometry}>
        <lineBasicMaterial color="#62c9d4" transparent opacity={0.38} depthWrite={false} />
      </lineSegments>
    </>
  );
}

function PixelSettlements({
  cities,
  density,
  layer,
  meshRef,
  materialRef,
}: {
  cities: City[];
  density: "city" | "town";
  layer: Layer;
  meshRef: React.RefObject<THREE.InstancedMesh | null>;
  materialRef: React.RefObject<THREE.MeshBasicMaterial | null>;
}) {
  const hoveredBlock = useRef<number | null>(null);
  const gold = useMemo(() => new THREE.Color("#e6bf65"), []);
  const blocks = useMemo(() => {
    const outward = new THREE.Vector3(0, 0, 1);
    const generated: Array<{
      height: number;
      color: THREE.Color;
      normal: THREE.Vector3;
      quaternion: THREE.Quaternion;
    }> = [];
    cities.forEach((city) => {
      const random = seededRandom(hashString(`${city.name}-${density}`));
      const count = density === "city" ? 24 : 78;
      const spread = density === "city" ? 1.1 : 2.5;
      const baseColor = new THREE.Color(layer === "Attention" ? city.color : layerColors[layer]);
      for (let index = 0; index < count; index += 1) {
        const distance = Math.pow(random(), 0.64) * spread;
        const angle = random() * Math.PI * 2;
        const latitude = city.lat + Math.sin(angle) * distance;
        const longitude = city.lng + (Math.cos(angle) * distance) / Math.max(0.25, Math.cos((city.lat * Math.PI) / 180));
        const height = density === "city" ? 0.07 + random() * 0.18 : 0.025 + random() * 0.065;
        const color = baseColor.clone().lerp(new THREE.Color("#d8ffff"), random() * 0.18);
        const normal = latLngToVector3(latitude, longitude, 1).normalize();
        generated.push({
          height,
          color,
          normal,
          quaternion: new THREE.Quaternion().setFromUnitVectors(outward, normal),
        });
      }
    });
    return generated;
  }, [cities, density, layer]);
  const hoverStrengths = useMemo(() => new Float32Array(blocks.length), [blocks.length]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, 1, 1);
    blocks.forEach((block, index) => {
      const position = block.normal.clone().multiplyScalar(3.032 + block.height / 2);
      scale.set(1, 1, block.height);
      matrix.compose(position, block.quaternion, scale);
      meshRef.current?.setMatrixAt(index, matrix);
      meshRef.current?.setColorAt(index, block.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [blocks, meshRef]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const extraHeight = density === "city" ? 0.22 : 0.1;
    let changed = false;

    blocks.forEach((block, index) => {
      const target = hoveredBlock.current === index ? 1 : 0;
      const current = hoverStrengths[index];
      const next = THREE.MathUtils.damp(current, target, 13, delta);
      if (Math.abs(next - current) < 0.0001) return;
      hoverStrengths[index] = next;
      const height = block.height + next * extraHeight;
      position.copy(block.normal).multiplyScalar(3.032 + height / 2);
      scale.set(1 + next * 0.2, 1 + next * 0.2, height);
      matrix.compose(position, block.quaternion, scale);
      color.copy(block.color).lerp(gold, next * 0.92);
      meshRef.current?.setMatrixAt(index, matrix);
      meshRef.current?.setColorAt(index, color);
      changed = true;
    });

    if (changed) {
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, blocks.length]}
      frustumCulled={false}
      onPointerMove={(event) => {
        if (event.instanceId === undefined) return;
        hoveredBlock.current = event.instanceId;
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hoveredBlock.current = null;
        document.body.style.cursor = "grab";
      }}
    >
      <boxGeometry args={[density === "city" ? 0.055 : 0.024, density === "city" ? 0.055 : 0.024, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#ffffff"
        vertexColors
        transparent
        opacity={0}
        toneMapped={false}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function GlobalCityBlocks({
  meshRef,
  materialRef,
}: {
  meshRef: React.RefObject<THREE.InstancedMesh | null>;
  materialRef: React.RefObject<THREE.MeshBasicMaterial | null>;
}) {
  const hoveredCity = useRef<number | null>(null);
  const gold = useMemo(() => new THREE.Color("#e6bf65"), []);
  const cityBlocks = useMemo(() => {
    const outward = new THREE.Vector3(0, 0, 1);
    const palette = ["#4d9ca5", "#5daab1", "#397f8a", "#6ab8ba"];
    return atlasLabelData.cities.map((city) => {
      const normal = latLngToVector3(city.lat, city.lng, 1).normalize();
      const populationHeight = THREE.MathUtils.clamp(
        (Math.log10(Math.max(city.population, 100_000)) - 5) * 0.028,
        0,
        0.1,
      );
      return {
        normal,
        quaternion: new THREE.Quaternion().setFromUnitVectors(outward, normal),
        height: 0.055 + populationHeight,
        color: new THREE.Color(palette[hashString(city.name) % palette.length]),
      };
    });
  }, []);
  const hoverStrengths = useMemo(() => new Float32Array(cityBlocks.length), [cityBlocks.length]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    cityBlocks.forEach((city, index) => {
      position.copy(city.normal).multiplyScalar(3.036 + city.height / 2);
      scale.set(1, 1, city.height);
      matrix.compose(position, city.quaternion, scale);
      meshRef.current?.setMatrixAt(index, matrix);
      meshRef.current?.setColorAt(index, city.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [cityBlocks, meshRef]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    let changed = false;

    cityBlocks.forEach((city, index) => {
      const target = hoveredCity.current === index ? 1 : 0;
      const current = hoverStrengths[index];
      const next = THREE.MathUtils.damp(current, target, 13, delta);
      if (Math.abs(next - current) < 0.0001) return;
      hoverStrengths[index] = next;
      const height = city.height + next * 0.2;
      position.copy(city.normal).multiplyScalar(3.036 + height / 2);
      scale.set(1 + next * 0.28, 1 + next * 0.28, height);
      matrix.compose(position, city.quaternion, scale);
      color.copy(city.color).lerp(gold, next * 0.94);
      meshRef.current?.setMatrixAt(index, matrix);
      meshRef.current?.setColorAt(index, color);
      changed = true;
    });

    if (changed) {
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, cityBlocks.length]}
      frustumCulled={false}
      visible={false}
      onPointerMove={(event) => {
        if (event.instanceId === undefined) return;
        hoveredCity.current = event.instanceId;
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hoveredCity.current = null;
        document.body.style.cursor = "grab";
      }}
    >
      <boxGeometry args={[0.045, 0.045, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#ffffff"
        vertexColors
        transparent
        opacity={0}
        toneMapped={false}
        depthWrite={false}
      />
    </instancedMesh>
  );
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

function CityLight({
  city,
  selected,
  layer,
  liveCount,
  onSelect,
}: {
  city: City;
  selected: boolean;
  layer: Layer;
  liveCount: number;
  onSelect: (city: City) => void;
}) {
  const pulse = useRef<THREE.Group>(null);
  const position = useMemo(
    () => latLngToVector3(city.lat, city.lng, 3.035),
    [city.lat, city.lng],
  );
  const orientation = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        position.clone().normalize(),
      ),
    [position],
  );
  const color = layer === "Attention" ? city.color : layerColors[layer];

  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const signalEnergy = 1 + Math.min(liveCount, 20) * 0.018;
    const scale = signalEnergy * (1 + Math.sin(clock.elapsedTime * 2.2 + city.lat) * 0.22);
    pulse.current.scale.setScalar(scale);
  });

  return (
    <group position={position} quaternion={orientation}>
      <group ref={pulse}>
        <mesh>
          <boxGeometry args={[selected ? 0.22 : 0.15, selected ? 0.22 : 0.15, 0.012]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={selected ? 0.58 : 0.28} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect(city);
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "grab";
        }}
      >
        <boxGeometry args={[selected ? 0.075 : 0.052, selected ? 0.075 : 0.052, selected ? 0.07 : 0.05]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
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
      for (let i = 0; i < 30; i += 1) {
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
  focusLocation,
  layer,
  liveCounts = {},
  onSelect,
  onDetailChange,
  onStreetEnter,
}: {
  cities: City[];
  selectedCity: City;
  focusLocation: GeoCenter;
  layer: Layer;
  liveCounts: Record<string, number>;
  onSelect: (city: City) => void;
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
  const initialized = useRef(false);
  const currentDetail = useRef<DetailLevel>(1);
  const cityBlocks = useRef<THREE.InstancedMesh>(null);
  const townBlocks = useRef<THREE.InstancedMesh>(null);
  const globalCityBlocks = useRef<THREE.InstancedMesh>(null);
  const cityMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const townMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const globalCityMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const streetMaterial = useRef<THREE.LineBasicMaterial>(null);
  const cityMarkers = useRef<THREE.Group>(null);
  const [labelDetail, setLabelDetail] = useState<DetailLevel>(1);
  const cityLabelColors = useMemo(
    () => new Map(cities.map((city) => [normalizeLabelName(city.name), city.color])),
    [cities],
  );

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
    if (!initialized.current) {
      orientation.current = targetOrientation;
      applyOrientation();
      initialized.current = true;
      focus.current = null;
      return;
    }

    focus.current = targetOrientation;
  }, [focusLocation.lat, focusLocation.lng]);

  useFrame(({ camera }) => {
    if (!globe.current) return;
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

    const cityOpacity = 1 - THREE.MathUtils.smoothstep(distance, 5.45, 6.2);
    const townOpacity = 1 - THREE.MathUtils.smoothstep(distance, 4.45, 5.2);
    const globalCityOpacity = 1 - THREE.MathUtils.smoothstep(distance, 4.82, 5.34);
    const streetOpacity = 1 - THREE.MathUtils.smoothstep(distance, 3.88, 4.6);
    if (cityMaterial.current) cityMaterial.current.opacity = cityOpacity;
    if (townMaterial.current) townMaterial.current.opacity = townOpacity * 0.8;
    if (globalCityMaterial.current) globalCityMaterial.current.opacity = globalCityOpacity * 0.88;
    if (streetMaterial.current) streetMaterial.current.opacity = streetOpacity * 0.72;
    if (cityBlocks.current) cityBlocks.current.visible = cityOpacity > 0.08;
    if (townBlocks.current) townBlocks.current.visible = townOpacity > 0.08;
    if (globalCityBlocks.current) globalCityBlocks.current.visible = globalCityOpacity > 0.08;
    if (cityMarkers.current) cityMarkers.current.visible = cityOpacity > 0.08;

    if (focus.current) {
      orientation.current.pitch = THREE.MathUtils.lerp(orientation.current.pitch, focus.current.pitch, 0.055);
      orientation.current.yaw = THREE.MathUtils.lerp(orientation.current.yaw, focus.current.yaw, 0.055);
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
      <PixelLand />
      <EnergyParticles cities={cities} layer={layer} />
      <PixelSettlements cities={cities} density="city" layer={layer} meshRef={cityBlocks} materialRef={cityMaterial} />
      <PixelSettlements cities={cities} density="town" layer={layer} meshRef={townBlocks} materialRef={townMaterial} />
      <GlobalCityBlocks meshRef={globalCityBlocks} materialRef={globalCityMaterial} />
      <StreetMesh cities={cities} layer={layer} materialRef={streetMaterial} />
      <mesh scale={1.055}>
        <sphereGeometry args={[3, 96, 96]} />
        <meshBasicMaterial color="#3cc5d7" transparent opacity={0.045} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <group ref={cityMarkers} visible={false}>
        {cities.map((city) => (
          <CityLight key={city.name} city={city} selected={city.name === selectedCity.name} layer={layer} liveCount={liveCounts[city.name] ?? 0} onSelect={onSelect} />
        ))}
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
          color={cityLabelColors.get(normalizeLabelName(city.name))}
        />
      ))}
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
  layer,
  liveCounts = {},
  onSelect,
  onDetailChange,
}: {
  cities: City[];
  selectedCity: City;
  layer: Layer;
  liveCounts: Record<string, number>;
  onSelect: (city: City) => void;
  onDetailChange: (level: DetailLevel) => void;
}) {
  const [streetState, setStreetState] = useState<{ cityId: string; center: GeoCenter } | null>(null);
  const [globeState, setGlobeState] = useState<{ cityId: string; center: GeoCenter } | null>(null);
  const streetCenter = streetState?.cityId === selectedCity.id ? streetState.center : null;
  const globeOverride = globeState?.cityId === selectedCity.id ? globeState.center : null;
  const focusLocation = globeOverride ?? { lat: selectedCity.lat, lng: selectedCity.lng };

  const enterStreetView = useCallback((center: GeoCenter) => {
    setStreetState({ cityId: selectedCity.id, center });
  }, [selectedCity.id]);

  const exitStreetView = useCallback((center: GeoCenter) => {
    setGlobeState({ cityId: selectedCity.id, center });
    setStreetState(null);
  }, [selectedCity.id]);

  const selectActivityCity = useCallback((city: City) => {
    setStreetState(null);
    setGlobeState(null);
    onSelect(city);
  }, [onSelect]);

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
              focusLocation={focusLocation}
              layer={layer}
              liveCounts={liveCounts}
              onSelect={selectActivityCity}
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
        <span className="statusLine"><i /> {signal.status}</span>
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

function compactActivity(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
    .format(value)
    .replace("K", "k");
}

function PresenceStudio({
  cities,
  draft,
  configured,
  busy,
  error,
  onSave,
  onSignOut,
  onClose,
}: {
  cities: City[];
  draft: PresenceDraft;
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
          <span className="eyebrow"><Radio size={11} /> PHASE 2 · IDENTITY &amp; PRESENCE</span>
          <h2>Broadcast your place in the world.</h2>
          <p>Your human signal and connected AI appear together on the live map.</p>
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

function AtlasWorldExperience({ cities }: { cities: City[] }) {
  const presence = useAtlasPresence();
  const [selectedCity, setSelectedCity] = useState(cities[0]);
  const [layer, setLayer] = useState<Layer>("Attention");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<Signal | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [clock, setClock] = useState("--:-- SGT");
  const searchRef = useRef<HTMLInputElement>(null);
  const joined = presence.connected;
  const visiblePresenceFeed = useMemo(
    () => presence.configured || joined ? presence.presenceFeed : [],
    [joined, presence.configured, presence.presenceFeed],
  );

  const liveCounts = useMemo(() => visiblePresenceFeed.reduce<Record<string, number>>((counts, item) => {
    counts[item.city] = (counts[item.city] ?? 0) + 1;
    return counts;
  }, {}), [visiblePresenceFeed]);

  const liveSignals = useMemo(() => visiblePresenceFeed
    .filter((item) => item.city.toLowerCase() === selectedCity.name.toLowerCase())
    .map(atlasPresenceToSignal), [selectedCity.name, visiblePresenceFeed]);

  const activeSignals = useMemo(() => [...liveSignals, ...selectedCity.signals]
    .filter((signal, index, all) => all.findIndex((candidate) => candidate.name === signal.name && candidate.type === signal.type) === index),
  [liveSignals, selectedCity.signals]);

  const humanPresenceCount = visiblePresenceFeed.filter((item) => item.entityKind === "human").length;
  const aiPresenceCount = visiblePresenceFeed.length - humanPresenceCount;
  const seededHumanActivity = cities.reduce((total, city) => total + city.humanActivity, 0);
  const seededAiActivity = cities.reduce((total, city) => total + city.aiActivity, 0);
  const worldHumanActivity = seededHumanActivity + humanPresenceCount;
  const worldAiActivity = seededAiActivity + aiPresenceCount;
  const pulseBars = useMemo(() => {
    const values = cities.flatMap((city) => [city.humanActivity, city.aiActivity]);
    const peak = Math.max(...values, 1);
    return values.map((value) => 16 + Math.round((value / peak) * 76));
  }, [cities]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 40);
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
  }, []);

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

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const liveResults = visiblePresenceFeed
      .filter((item) => !needle || [item.displayName, item.entityKind, item.activity, item.topic, item.city].join(" ").toLowerCase().includes(needle))
      .slice(0, 3)
      .map((item) => {
        const city = cities.find((candidate) => candidate.name.toLowerCase() === item.city.toLowerCase()) ?? cities[0];
        const signal = atlasPresenceToSignal(item);
        return { title: signal.name, subtitle: `${signal.type} · ${signal.activity} · ${item.city} · LIVE`, city, signal };
      });
    const cityResults = cities
      .filter((city) => !needle || [city.name, city.country, city.category, ...city.topics].join(" ").toLowerCase().includes(needle))
      .slice(0, 4)
      .map((city) => ({ title: city.name, subtitle: `${city.country} · ${city.category}`, city, signal: null as Signal | null }));
    const signalResults = cities
      .flatMap((city) => city.signals.map((signal) => ({ city, signal })))
      .filter(({ signal, city }) => needle && [signal.name, signal.type, signal.activity, signal.topic, city.name].join(" ").toLowerCase().includes(needle))
      .slice(0, 3)
      .map(({ city, signal }) => ({ title: signal.name, subtitle: `${signal.type} · ${signal.activity} · ${city.name}`, city, signal }));
    return [...liveResults, ...cityResults, ...signalResults].slice(0, 7);
  }, [cities, query, visiblePresenceFeed]);

  const chooseResult = (city: City, signal: Signal | null) => {
    setSelectedCity(city);
    setSearchOpen(false);
    setQuery("");
    if (signal) setProfile(signal);
  };

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
        <EarthScene cities={cities} selectedCity={selectedCity} layer={layer} liveCounts={liveCounts} onSelect={setSelectedCity} onDetailChange={setDetailLevel} />
      </section>

      <header className="topBar">
        <button className="brand" aria-label="Atlas home" onClick={() => setSelectedCity(cities[0])}>
          <span className="atlasGlyph"><i /><i /><i /></span>
          <span>ATLAS</span>
          <small>ALPHA</small>
        </button>
        <nav className="topNav" aria-label="Primary navigation">
          <button className="active">Explore</button>
          <button onClick={() => setSearchOpen(true)}>Signals</button>
          <button onClick={() => joined ? setPresenceOpen(true) : setJoinOpen(true)}>Presence</button>
        </nav>
        <div className="topActions">
          <span className="liveBadge"><i /> LIVE</span>
          <button className={`joinButton ${joined ? "joined" : ""}`} onClick={() => joined ? setPresenceOpen(true) : setJoinOpen(true)}>
            {joined ? <><Check size={14} /> Connected</> : <>Join Atlas <ArrowUpRight size={14} /></>}
          </button>
        </div>
      </header>

      <aside className="worldPulse glassPanel" aria-label="Global live activity">
        <div className="panelTitle"><Globe2 size={14} /><span>WORLD PULSE</span><i /></div>
        <strong>{(worldHumanActivity + worldAiActivity).toLocaleString()}</strong>
        <small>minds active now</small>
        <div className="pulseStats">
          <span><Users size={13} /><b>{compactActivity(worldHumanActivity)}</b> Humans</span>
          <span><Bot size={13} /><b>{compactActivity(worldAiActivity)}</b> AI</span>
        </div>
        <div className="pulseChart" aria-hidden="true">
          {pulseBars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
        </div>
      </aside>

      <aside className="citySignal glassPanel" aria-live="polite">
        <div className="signalHeader">
          <div>
            <span className="eyebrow">LIVE SIGNAL · {selectedCity.country.toUpperCase()}</span>
            <h1>{selectedCity.name}</h1>
          </div>
          <LocateFixed size={18} />
        </div>
        <div className="activityTotal">
          <span style={{ background: selectedCity.color }} />
          <strong>{(selectedCity.humanActivity + selectedCity.aiActivity + liveSignals.length).toLocaleString()}</strong>
          <small>minds active</small>
          <em>{liveSignals.length ? `+${liveSignals.length} realtime` : `+${selectedCity.growthPercent.toFixed(1)}%`}</em>
        </div>
        <p className="categoryLine">{layer === "Attention" ? selectedCity.category : `${layer} activity`}</p>
        <div className="topicList">
          {selectedCity.topics.map((topic, index) => (
            <button key={topic} onClick={() => { setQuery(topic); setSearchOpen(true); }}>
              <span>0{index + 1}</span>{topic}<ChevronRight size={13} />
            </button>
          ))}
        </div>
        <div className="entityStrip">
          {activeSignals.slice(0, 3).map((signal) => (
            <button key={signal.name} onClick={() => setProfile(signal)} aria-label={`Open ${signal.name}'s profile`}>
              {signal.type === "AI" ? <Bot size={14} /> : signal.name.slice(0, 1)}
            </button>
          ))}
          <button className="viewSignals" onClick={() => { setQuery(selectedCity.name); setSearchOpen(true); }}>View signals <ArrowUpRight size={12} /></button>
        </div>
      </aside>

      <div className="lodIndicator glassPanel" aria-live="polite">
        <span>L0{detailLevel}</span>
        <div>
          <b>{detailLabels[detailLevel].title}</b>
          <small>{detailLabels[detailLevel].note}</small>
        </div>
      </div>

      <div className="dragHint"><Move size={13} /><span>Drag to rotate · Scroll or pinch to zoom</span></div>

      <div className="bottomDock">
        <div className="layerControl glassPanel" role="group" aria-label="Attention layer">
          <span>VIEW</span>
          {layers.map((item) => (
            <button key={item} className={layer === item ? "active" : ""} onClick={() => setLayer(item)}>
              <i style={{ background: layerColors[item] }} />{item}
            </button>
          ))}
        </div>

        <button className="searchBar glassPanel" onClick={() => { setSearchOpen(true); window.setTimeout(() => searchRef.current?.focus(), 40); }}>
          <Search size={17} />
          <span>Search the living world</span>
          <kbd><Command size={11} /> K</kbd>
        </button>
      </div>

      <div className="coordinates">
        {Math.abs(selectedCity.lat).toFixed(2)}°{selectedCity.lat >= 0 ? "N" : "S"} · {Math.abs(selectedCity.lng).toFixed(2)}°{selectedCity.lng >= 0 ? "E" : "W"}
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
                <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="People, AI, cities or topics…" aria-label="Search people, AI, cities or topics" />
                <button onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={16} /></button>
              </div>
              <div className="searchMeta"><span>{query ? `RESULTS FOR “${query.toUpperCase()}”` : "TRENDING ACROSS EARTH"}</span><small>{searchResults.length} signals</small></div>
              <div className="searchResults">
                {searchResults.length ? searchResults.map((result, index) => (
                  <button key={`${result.city.name}-${result.title}-${index}`} onClick={() => chooseResult(result.city, result.signal)}>
                    <span className={`resultIcon ${result.signal?.type === "AI" ? "ai" : ""}`}>
                      {result.signal?.type === "AI" ? <Bot size={15} /> : result.signal ? <CircleUserRound size={15} /> : <Globe2 size={15} />}
                    </span>
                    <span><b>{result.title}</b><small>{result.subtitle}</small></span>
                    <ChevronRight size={15} />
                  </button>
                )) : <div className="emptySearch"><Sparkles size={18} /><span>No signal yet. Try “AI”, “travel” or “coding”.</span></div>}
              </div>
              <div className="searchFooter"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>ESC</kbd> close</span></div>
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
              <p>{joined ? "Your human and AI identities are ready to broadcast." : "Create your human presence and connect one AI to the world."}</p>
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
          <p>{world.error ?? "Reading cities, topics, and ambient signals from Supabase."}</p>
          <div className={`databasePulse ${world.loading ? "loading" : ""}`} aria-hidden="true"><i /><i /><i /><i /><i /></div>
          {world.error && <button onClick={() => void world.reload()}>Retry connection <ArrowUpRight size={14} /></button>}
        </section>
      </main>
    );
  }

  return <AtlasWorldExperience cities={world.cities} />;
}
