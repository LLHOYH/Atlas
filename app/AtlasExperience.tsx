"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import { OrbitControls, QuadraticBezierLine, Stars } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import atlasGeoData from "./atlas-geo-data.json";
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
  Move,
  Search,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import * as THREE from "three";

type Signal = {
  name: string;
  type: "Human" | "AI";
  activity: string;
  topic: string;
  status: string;
  detail: string;
};

type City = {
  name: string;
  country: string;
  lat: number;
  lng: number;
  color: string;
  category: string;
  active: string;
  change: string;
  topics: string[];
  signals: Signal[];
};

const cities: City[] = [
  {
    name: "Singapore",
    country: "Singapore",
    lat: 1.35,
    lng: 103.82,
    color: "#a68cff",
    category: "AI & Technology",
    active: "1,284",
    change: "+12.4%",
    topics: ["Agentic systems", "Stablecoin rails", "Developer tools"],
    signals: [
      { name: "Lloyd", type: "Human", activity: "Coding", topic: "Stablecoin payments", status: "Online", detail: "Building an infrastructure prototype" },
      { name: "Research AI", type: "AI", activity: "Searching", topic: "Developer tools", status: "Autonomous", detail: "Reading 42 sources" },
      { name: "Mira Chen", type: "Human", activity: "Designing", topic: "Spatial interfaces", status: "AI assisted", detail: "Exploring calm interface systems" },
    ],
  },
  {
    name: "Tokyo",
    country: "Japan",
    lat: 35.68,
    lng: 139.69,
    color: "#67e9bc",
    category: "Travel & Culture",
    active: "2,106",
    change: "+8.9%",
    topics: ["Kyoto travel", "Robotics", "Japanese learning"],
    signals: [
      { name: "Kiko", type: "Human", activity: "Planning", topic: "Kyoto in autumn", status: "AI assisted", detail: "Mapping a seven-day journey" },
      { name: "Hikari", type: "AI", activity: "Learning", topic: "Robotics", status: "Autonomous", detail: "Simulating motion paths" },
    ],
  },
  {
    name: "San Francisco",
    country: "United States",
    lat: 37.77,
    lng: -122.42,
    color: "#6eb7ff",
    category: "Technology",
    active: "3,842",
    change: "+18.2%",
    topics: ["Model context", "Robotics", "AI infrastructure"],
    signals: [
      { name: "Nova", type: "AI", activity: "Coding", topic: "Model context", status: "Autonomous", detail: "Testing an agent runtime" },
      { name: "Anya Patel", type: "Human", activity: "Building", topic: "Robotics", status: "Human + AI", detail: "Prototyping tactile controls" },
    ],
  },
  {
    name: "São Paulo",
    country: "Brazil",
    lat: -23.55,
    lng: -46.63,
    color: "#ff8f62",
    category: "Finance & Culture",
    active: "2,472",
    change: "+21.7%",
    topics: ["Payment systems", "Football", "Music festivals"],
    signals: [
      { name: "Caio", type: "Human", activity: "Researching", topic: "Payment systems", status: "Online", detail: "Comparing instant payment networks" },
      { name: "Lume", type: "AI", activity: "Reading", topic: "Brazilian fintech", status: "Autonomous", detail: "Synthesizing market signals" },
    ],
  },
  {
    name: "London",
    country: "United Kingdom",
    lat: 51.51,
    lng: -0.13,
    color: "#f5c86b",
    category: "Finance & Research",
    active: "2,934",
    change: "+7.1%",
    topics: ["AI safety", "Market structure", "Climate research"],
    signals: [
      { name: "Elias", type: "Human", activity: "Reading", topic: "AI safety", status: "Online", detail: "Reviewing evaluation methods" },
      { name: "Argus", type: "AI", activity: "Thinking", topic: "Market structure", status: "Human controlled", detail: "Preparing a risk brief" },
    ],
  },
  {
    name: "Lagos",
    country: "Nigeria",
    lat: 6.52,
    lng: 3.38,
    color: "#72e0a7",
    category: "Finance & Education",
    active: "1,632",
    change: "+16.3%",
    topics: ["Mobile money", "Creative tools", "Learning Rust"],
    signals: [
      { name: "Tomi", type: "Human", activity: "Learning", topic: "Rust", status: "Online", detail: "Building a first systems project" },
      { name: "Sage", type: "AI", activity: "Teaching", topic: "Mobile money", status: "AI assisted", detail: "Explaining payment architecture" },
    ],
  },
  {
    name: "Dubai",
    country: "United Arab Emirates",
    lat: 25.2,
    lng: 55.27,
    color: "#ffae68",
    category: "Finance & Travel",
    active: "1,548",
    change: "+9.5%",
    topics: ["Digital assets", "Future cities", "Luxury travel"],
    signals: [
      { name: "Amal", type: "Human", activity: "Planning", topic: "Future cities", status: "Human + AI", detail: "Developing an urban systems brief" },
      { name: "Orbit", type: "AI", activity: "Searching", topic: "Digital assets", status: "Autonomous", detail: "Tracking policy changes" },
    ],
  },
  {
    name: "Sydney",
    country: "Australia",
    lat: -33.87,
    lng: 151.21,
    color: "#ff72b1",
    category: "Culture & Research",
    active: "1,126",
    change: "+6.4%",
    topics: ["Climate tech", "Ocean research", "Indie games"],
    signals: [
      { name: "Iris", type: "AI", activity: "Researching", topic: "Ocean systems", status: "Autonomous", detail: "Comparing reef recovery data" },
      { name: "Noah Kim", type: "Human", activity: "Designing", topic: "Indie games", status: "Online", detail: "Sketching a new world" },
    ],
  },
];

const layers = ["Attention", "AI", "Technology", "Travel"] as const;
type Layer = (typeof layers)[number];
type DetailLevel = 1 | 2 | 3 | 4;

const detailLabels: Record<DetailLevel, { title: string; note: string }> = {
  1: { title: "COUNTRIES", note: "National grid cells" },
  2: { title: "CITIES", note: "Urban activity blocks" },
  3: { title: "TOWNS", note: "Local presence clusters" },
  4: { title: "STREETS", note: "Street-level signal mesh" },
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
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const outward = new THREE.Vector3(0, 0, 1);
    const palettes = ["#183941", "#1b4148", "#203a46", "#23444a", "#263a45", "#1c4650"];

    landCells.forEach((cell, index) => {
      const position = latLngToVector3(cell.lat, cell.lng, 3.018);
      quaternion.setFromUnitVectors(outward, position.clone().normalize());
      const countryHash = hashString(cell.name);
      const latitudeScale = Math.max(0.42, Math.cos((cell.lat * Math.PI) / 180));
      const variance = 0.88 + (countryHash % 17) / 100;
      scale.set(latitudeScale * variance, variance, 1);
      matrix.compose(position, quaternion, scale);
      blocks.current?.setMatrixAt(index, matrix);
      blocks.current?.setColorAt(index, new THREE.Color(palettes[countryHash % palettes.length]));
    });
    blocks.current.instanceMatrix.needsUpdate = true;
    if (blocks.current.instanceColor) blocks.current.instanceColor.needsUpdate = true;
  }, [landCells]);

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
      <instancedMesh ref={blocks} args={[undefined, undefined, landCells.length]} frustumCulled={false}>
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
  density,
  layer,
  materialRef,
}: {
  density: "city" | "town";
  layer: Layer;
  materialRef: React.RefObject<THREE.MeshBasicMaterial | null>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const blocks = useMemo(() => {
    const generated: Array<{ lat: number; lng: number; height: number; color: THREE.Color }> = [];
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
        generated.push({ lat: latitude, lng: longitude, height, color });
      }
    });
    return generated;
  }, [density, layer]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const outward = new THREE.Vector3(0, 0, 1);
    const scale = new THREE.Vector3(1, 1, 1);
    blocks.forEach((block, index) => {
      const position = latLngToVector3(block.lat, block.lng, 3.032 + block.height / 2);
      quaternion.setFromUnitVectors(outward, position.clone().normalize());
      scale.set(1, 1, block.height);
      matrix.compose(position, quaternion, scale);
      meshRef.current?.setMatrixAt(index, matrix);
      meshRef.current?.setColorAt(index, block.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [blocks]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]} frustumCulled={false}>
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

function StreetMesh({
  layer,
  materialRef,
}: {
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
    });

    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return result;
  }, []);

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
  onSelect,
}: {
  city: City;
  selected: boolean;
  layer: Layer;
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
    const scale = 1 + Math.sin(clock.elapsedTime * 2.2 + city.lat) * 0.22;
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

function EnergyParticles({ layer }: { layer: Layer }) {
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
  }, []);

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
  selectedCity,
  layer,
  onSelect,
  onDetailChange,
}: {
  selectedCity: City;
  layer: Layer;
  onSelect: (city: City) => void;
  onDetailChange: (level: DetailLevel) => void;
}) {
  const globe = useRef<THREE.Group>(null);
  const drag = useRef({ active: false, x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const focus = useRef<THREE.Quaternion | null>(null);
  const initialized = useRef(false);
  const currentDetail = useRef<DetailLevel>(1);
  const cityMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const townMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const streetMaterial = useRef<THREE.LineBasicMaterial>(null);
  const cityMarkers = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    if (!globe.current) return;
    const target = latLngToVector3(selectedCity.lat, selectedCity.lng, 1).normalize();
    const targetRotation = new THREE.Quaternion().setFromUnitVectors(
      target,
      new THREE.Vector3(0.08, 0.08, 1).normalize(),
    );

    velocity.current = { x: 0, y: 0 };
    if (!initialized.current) {
      globe.current.quaternion.copy(targetRotation);
      initialized.current = true;
      focus.current = null;
      return;
    }

    focus.current = targetRotation;
  }, [selectedCity]);

  useFrame(({ camera }) => {
    if (!globe.current) return;
    const distance = camera.position.length();
    const nextDetail: DetailLevel = distance > 6
      ? 1
      : distance > 5.05
        ? 2
        : distance > 4.42
          ? 3
          : 4;
    if (nextDetail !== currentDetail.current) {
      currentDetail.current = nextDetail;
      onDetailChange(nextDetail);
    }

    const cityOpacity = 1 - THREE.MathUtils.smoothstep(distance, 5.45, 6.2);
    const townOpacity = 1 - THREE.MathUtils.smoothstep(distance, 4.45, 5.2);
    const streetOpacity = 1 - THREE.MathUtils.smoothstep(distance, 3.88, 4.6);
    if (cityMaterial.current) cityMaterial.current.opacity = cityOpacity;
    if (townMaterial.current) townMaterial.current.opacity = townOpacity * 0.8;
    if (streetMaterial.current) streetMaterial.current.opacity = streetOpacity * 0.72;
    if (cityMarkers.current) cityMarkers.current.visible = cityOpacity > 0.08;

    if (focus.current) {
      globe.current.quaternion.slerp(focus.current, 0.055);
      if (globe.current.quaternion.angleTo(focus.current) < 0.008) focus.current = null;
      return;
    }
    if (!drag.current.active) {
      if (velocity.current.x !== 0 || velocity.current.y !== 0) {
        const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), velocity.current.x);
        const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), velocity.current.y);
        globe.current.quaternion.premultiply(qy).premultiply(qx);
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
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), velocity.current.x);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), velocity.current.y);
    globe.current.quaternion.premultiply(qy).premultiply(qx);
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
      <PixelSettlements density="city" layer={layer} materialRef={cityMaterial} />
      <PixelSettlements density="town" layer={layer} materialRef={townMaterial} />
      <StreetMesh layer={layer} materialRef={streetMaterial} />
      <mesh scale={1.055}>
        <sphereGeometry args={[3, 96, 96]} />
        <meshBasicMaterial color="#3cc5d7" transparent opacity={0.045} blending={THREE.AdditiveBlending} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <group ref={cityMarkers} visible={false}>
        {cities.map((city) => (
          <CityLight key={city.name} city={city} selected={city.name === selectedCity.name} layer={layer} onSelect={onSelect} />
        ))}
      </group>
      <AttentionFlow from={cities[3]} to={cities[0]} color="#ff8f62" delay={0.1} />
      <AttentionFlow from={cities[4]} to={cities[0]} color="#a68cff" delay={0.48} />
      <AttentionFlow from={cities[2]} to={cities[1]} color="#6eb7ff" delay={0.72} />
    </group>
  );
}

function EarthScene({
  selectedCity,
  layer,
  onSelect,
  onDetailChange,
}: {
  selectedCity: City;
  layer: Layer;
  onSelect: (city: City) => void;
  onDetailChange: (level: DetailLevel) => void;
}) {
  return (
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
        <Earth selectedCity={selectedCity} layer={layer} onSelect={onSelect} onDetailChange={onDetailChange} />
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

export function AtlasExperience() {
  const [selectedCity, setSelectedCity] = useState(cities[0]);
  const [layer, setLayer] = useState<Layer>("Attention");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<Signal | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joined, setJoined] = useState(false);
  const [clock, setClock] = useState("--:-- SGT");
  const searchRef = useRef<HTMLInputElement>(null);

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
    const cityResults = cities
      .filter((city) => !needle || [city.name, city.country, city.category, ...city.topics].join(" ").toLowerCase().includes(needle))
      .slice(0, 4)
      .map((city) => ({ title: city.name, subtitle: `${city.country} · ${city.category}`, city, signal: null as Signal | null }));
    const signalResults = cities
      .flatMap((city) => city.signals.map((signal) => ({ city, signal })))
      .filter(({ signal, city }) => needle && [signal.name, signal.type, signal.activity, signal.topic, city.name].join(" ").toLowerCase().includes(needle))
      .slice(0, 3)
      .map(({ city, signal }) => ({ title: signal.name, subtitle: `${signal.type} · ${signal.activity} · ${city.name}`, city, signal }));
    return [...cityResults, ...signalResults];
  }, [query]);

  const chooseResult = (city: City, signal: Signal | null) => {
    setSelectedCity(city);
    setSearchOpen(false);
    setQuery("");
    if (signal) setProfile(signal);
  };

  return (
    <main className="atlasShell">
      <div className="spaceGlow" />
      <section className="globeStage" aria-label="Interactive living Earth. Drag to rotate; scroll or pinch to zoom.">
        <EarthScene selectedCity={selectedCity} layer={layer} onSelect={setSelectedCity} onDetailChange={setDetailLevel} />
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
          <button onClick={() => setProfile(selectedCity.signals[0])}>Profiles</button>
        </nav>
        <div className="topActions">
          <span className="liveBadge"><i /> LIVE</span>
          <button className={`joinButton ${joined ? "joined" : ""}`} onClick={() => setJoinOpen(true)}>
            {joined ? <><Check size={14} /> Connected</> : <>Join Atlas <ArrowUpRight size={14} /></>}
          </button>
        </div>
      </header>

      <aside className="worldPulse glassPanel" aria-label="Global live activity">
        <div className="panelTitle"><Globe2 size={14} /><span>WORLD PULSE</span><i /></div>
        <strong>12,804</strong>
        <small>minds active now</small>
        <div className="pulseStats">
          <span><Users size={13} /><b>8.4k</b> Humans</span>
          <span><Bot size={13} /><b>4.3k</b> AI</span>
        </div>
        <div className="pulseChart" aria-hidden="true">
          {[16, 24, 20, 37, 29, 48, 42, 58, 44, 69, 62, 78, 64, 86, 80, 92].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
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
          <strong>{selectedCity.active}</strong>
          <small>minds active</small>
          <em>{selectedCity.change}</em>
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
          {selectedCity.signals.slice(0, 3).map((signal) => (
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
                {searchResults.length ? searchResults.map((result) => (
                  <button key={`${result.city.name}-${result.title}`} onClick={() => chooseResult(result.city, result.signal)}>
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
        {joinOpen && (
          <motion.div className="modalScrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setJoinOpen(false)}>
            <motion.section className="joinDialog glassPanel" initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} onMouseDown={(event) => event.stopPropagation()}>
              <button className="iconButton joinClose" onClick={() => setJoinOpen(false)} aria-label="Close"><X size={16} /></button>
              <span className="joinOrb"><Zap size={23} /></span>
              <span className="eyebrow">ENTER THE LIVING WORLD</span>
              <h2>{joined ? "You’re connected" : "Make your attention visible."}</h2>
              <p>{joined ? "Your Atlas identity is ready for this preview." : "Create your human presence and connect one AI to the world."}</p>
              {!joined ? <div className="providerButtons">
                <button onClick={() => { setJoined(true); setJoinOpen(false); }}><Code2 size={17} /> Continue with GitHub</button>
                <button onClick={() => { setJoined(true); setJoinOpen(false); }}><span className="googleMark">G</span> Continue with Google</button>
              </div> : <button className="primaryWide" onClick={() => { setJoinOpen(false); setProfile(cities[0].signals[0]); }}>View your presence <ArrowUpRight size={15} /></button>}
              <small className="previewNote">Interactive product preview · No account data is transmitted</small>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
