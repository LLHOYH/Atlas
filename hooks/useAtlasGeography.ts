"use client";

import { useEffect, useState } from "react";

export type AtlasPlace = {
  id: string;
  name: string;
  asciiName: string;
  lat: number;
  lng: number;
  population: number;
  featureCode: string;
  admin1: string | null;
  admin2: string | null;
  rank: number;
};

export type AtlasPlacesPayload = {
  iso3: string;
  source: {
    name: string;
    placesUrl: string;
    countryInfoUrl: string;
    license: string;
    attributionUrl: string;
  };
  places: AtlasPlace[];
};

export type AtlasBoundaryProperties = {
  shapeName?: string;
  shapeISO?: string;
  shapeID?: string;
  shapeGroup?: string;
  shapeType?: string;
  [key: string]: unknown;
};

export type AtlasBoundaryFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  AtlasBoundaryProperties
>;

export type AtlasBoundaryPayload = {
  available: boolean;
  iso: string;
  level: string;
  reason?: string;
  source?: {
    name: string;
    metadataUrl: string;
    geometryUrl: string;
    canonical: string | null;
    license: string | null;
    originalSource: string | null;
    yearRepresented: string | null;
  };
  type: "FeatureCollection";
  features: AtlasBoundaryFeature[];
};

const placeCache = new Map<string, AtlasPlacesPayload>();
const boundaryCache = new Map<string, AtlasBoundaryPayload>();

function useCachedJson<T>(url: string | null, cache: Map<string, T>) {
  const [result, setResult] = useState<{ url: string; data: T | null } | null>(() => {
    const cached = url ? cache.get(url) : null;
    return url && cached ? { url, data: cached } : null;
  });

  useEffect(() => {
    if (!url || cache.has(url)) return;

    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Geography request failed (${response.status})`);
        return response.json() as Promise<T>;
      })
      .then((payload) => {
        cache.set(url, payload);
        setResult({ url, data: payload });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResult({ url, data: null });
      });

    return () => controller.abort();
  }, [cache, url]);

  const cached = url ? cache.get(url) : null;
  const data = cached ?? (url && result?.url === url ? result.data : null);
  const loading = Boolean(url && !cached && result?.url !== url);
  return { data, loading };
}

export function useAtlasPlaces(iso3: string | null, enabled: boolean) {
  const url = enabled && iso3 ? `/atlas-geography/places/${iso3}.json` : null;
  return useCachedJson(url, placeCache);
}

export function useAtlasBoundaries(iso3: string | null, level: "ADM1" | "ADM2", enabled: boolean) {
  const url = enabled && iso3 ? `/api/atlas/v1/geography?iso=${iso3}&level=${level}` : null;
  return useCachedJson(url, boundaryCache);
}
