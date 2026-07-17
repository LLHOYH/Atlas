"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import {
  mapAtlasWorld,
  mapAtlasLiveAgentHistory,
  type AtlasAgentEventRow,
  type AtlasAgentRow,
  type AtlasAmbientSignalRow,
  type AtlasCity,
  type AtlasCityRow,
  type AtlasDailyLiveAgent,
  type AtlasDailyLiveAgentRow,
  type AtlasStreetRow,
  type AtlasTopicRow,
} from "../lib/atlas/world";

export function useAtlasWorld() {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [cities, setCities] = useState<AtlasCity[]>([]);
  const [liveAgentHistory, setLiveAgentHistory] = useState<AtlasDailyLiveAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorld = useCallback(async () => {
    if (!client) {
      setError("Atlas needs a Supabase connection before it can load the living world.");
      setLoading(false);
      return;
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const loadAgentPages = async () => {
      const data: AtlasAgentRow[] = [];
      const pageSize = 1_000;
      for (let from = 0; ; from += pageSize) {
        const result = await client
          .from("atlas_agents")
          .select("*")
          .order("city_id")
          .order("display_order")
          .range(from, from + pageSize - 1);
        if (result.error) return { data, error: result.error };
        const page = (result.data ?? []) as AtlasAgentRow[];
        data.push(...page);
        if (page.length < pageSize) return { data, error: null };
      }
    };
    const loadAgentEventPages = async () => {
      const data: AtlasAgentEventRow[] = [];
      const pageSize = 1_000;
      for (let from = 0; ; from += pageSize) {
        const result = await client
          .from("atlas_agent_events")
          .select("*")
          .gte("occurred_at", dayAgo)
          .order("occurred_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (result.error) return { data, error: result.error };
        const page = (result.data ?? []) as AtlasAgentEventRow[];
        data.push(...page);
        if (page.length < pageSize) return { data, error: null };
      }
    };
    const [cityResult, topicResult, signalResult, streetResult, agentResult, agentEventResult, liveAgentHistoryResult] = await Promise.all([
      client.from("atlas_cities").select("*").order("display_order"),
      client.from("atlas_city_topics").select("*").order("city_id").order("rank"),
      client.from("atlas_ambient_signals").select("*").order("city_id").order("display_order"),
      client.from("atlas_city_streets").select("*").order("city_id").order("display_order"),
      loadAgentPages(),
      loadAgentEventPages(),
      client.rpc("atlas_live_agent_history", { p_days: 7 }),
    ]);
    const queryError = cityResult.error
      ?? topicResult.error
      ?? signalResult.error
      ?? streetResult.error
      ?? agentResult.error
      ?? agentEventResult.error
      ?? liveAgentHistoryResult.error;
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
      (agentResult.data ?? []) as AtlasAgentRow[],
      (agentEventResult.data ?? []) as AtlasAgentEventRow[],
    );
    setCities(nextCities);
    setLiveAgentHistory(mapAtlasLiveAgentHistory((liveAgentHistoryResult.data ?? []) as AtlasDailyLiveAgentRow[]));
    setError(nextCities.length ? null : "Atlas connected, but the world catalog is empty. Run the seed script.");
    setLoading(false);
  }, [client]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadWorld(), 0);
    if (!client) return () => window.clearTimeout(initialLoad);
    const channel = client
      .channel("atlas-agent-world")
      .on("postgres_changes", { event: "*", schema: "public", table: "atlas_agents" }, () => {
        void loadWorld();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "atlas_agent_events" }, () => {
        void loadWorld();
      })
      .subscribe();
    return () => {
      window.clearTimeout(initialLoad);
      void client.removeChannel(channel);
    };
  }, [client, loadWorld]);

  return { cities, liveAgentHistory, loading, error, reload: loadWorld };
}
