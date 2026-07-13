"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import {
  mapAtlasWorld,
  type AtlasAmbientSignalRow,
  type AtlasCity,
  type AtlasCityRow,
  type AtlasStreetRow,
  type AtlasTopicRow,
} from "../lib/atlas/world";

export function useAtlasWorld() {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [cities, setCities] = useState<AtlasCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorld = useCallback(async () => {
    if (!client) {
      setError("Atlas needs a Supabase connection before it can load the living world.");
      setLoading(false);
      return;
    }

    const [cityResult, topicResult, signalResult, streetResult] = await Promise.all([
      client.from("atlas_cities").select("*").order("display_order"),
      client.from("atlas_city_topics").select("*").order("city_id").order("rank"),
      client.from("atlas_ambient_signals").select("*").order("city_id").order("display_order"),
      client.from("atlas_city_streets").select("*").order("city_id").order("display_order"),
    ]);
    const queryError = cityResult.error ?? topicResult.error ?? signalResult.error ?? streetResult.error;
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    const nextCities = mapAtlasWorld(
      (cityResult.data ?? []) as AtlasCityRow[],
      (topicResult.data ?? []) as AtlasTopicRow[],
      (signalResult.data ?? []) as AtlasAmbientSignalRow[],
      (streetResult.data ?? []) as AtlasStreetRow[],
    );
    setCities(nextCities);
    setError(nextCities.length ? null : "Atlas connected, but the world catalog is empty. Run the seed script.");
    setLoading(false);
  }, [client]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadWorld(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadWorld]);

  return { cities, loading, error, reload: loadWorld };
}
