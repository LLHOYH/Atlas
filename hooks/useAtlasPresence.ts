"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "../lib/supabase/client";
import {
  defaultPresenceDraft,
  type AtlasPresence,
  type ControlState,
  type EntityKind,
  type PresenceActivity,
  type PresenceDraft,
  type PresenceStatus,
} from "../lib/atlas/types";

export type AtlasOwnedAgent = {
  id: string;
  agentId: string;
  displayName: string;
  runtime: string;
  runtimeVersion: string;
  cityId: string;
  visibility: "public" | "private" | "paused";
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  connectionState: "live" | "offline" | "linked" | "paused" | "revoked";
};

const now = () => new Date().toISOString();
const expiresAt = () => new Date(Date.now() + 2 * 60 * 1000).toISOString();

function presenceFromDraft(draft: PresenceDraft): AtlasPresence[] {
  const updatedAt = now();
  return [
    {
      id: "demo-human-lloyd",
      ownerId: "demo-owner",
      entityKind: "human",
      displayName: draft.displayName,
      city: draft.city,
      latitude: draft.latitude,
      longitude: draft.longitude,
      activity: draft.activity,
      topic: draft.topic,
      status: draft.status,
      controlState: draft.controlState,
      detail: draft.bio,
      updatedAt,
    },
    {
      id: "demo-ai-research",
      ownerId: "demo-owner",
      entityKind: "ai",
      displayName: draft.aiName,
      city: draft.city,
      latitude: draft.latitude,
      longitude: draft.longitude,
      activity: draft.aiState,
      topic: draft.aiTopic,
      status: "Online",
      controlState: draft.aiAutonomous ? "Autonomous" : "AI Assisted",
      detail: draft.aiTask,
      updatedAt,
    },
  ];
}

function mapPresenceRow(row: Record<string, unknown>): AtlasPresence {
  return {
    id: String(row.entity_id),
    ownerId: String(row.owner_id),
    entityKind: row.entity_kind as EntityKind,
    displayName: String(row.display_name),
    city: String(row.city),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    activity: row.activity as PresenceActivity,
    topic: String(row.topic),
    status: row.status as PresenceStatus,
    controlState: row.control_state as ControlState,
    detail: String(row.detail ?? ""),
    updatedAt: String(row.updated_at),
  };
}

export function useAtlasPresence() {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [demoConnected, setDemoConnected] = useState(false);
  const [draft, setDraft] = useState<PresenceDraft>(defaultPresenceDraft);
  const [presenceFeed, setPresenceFeed] = useState<AtlasPresence[]>(() =>
    isSupabaseConfigured ? [] : presenceFromDraft(defaultPresenceDraft),
  );
  const [installations, setInstallations] = useState<AtlasOwnedAgent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    if (!authError) return;
    const showError = window.setTimeout(() => setError(authError), 0);
    window.history.replaceState({}, "", window.location.pathname);
    return () => window.clearTimeout(showError);
  }, []);

  const loadPresenceFeed = useCallback(async () => {
    if (!client) return;
    const { data, error: queryError } = await client
      .from("presence")
      .select("*")
      .gt("expires_at", now())
      .order("updated_at", { ascending: false })
      .limit(500);
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setPresenceFeed((data ?? []).map((row) => mapPresenceRow(row as Record<string, unknown>)));
  }, [client]);

  const loadInstallations = useCallback(async (ownerId: string) => {
    if (!client) return;
    const { data, error: queryError } = await client
      .from("atlas_agent_installations")
      .select("id, agent_id, display_name, runtime, runtime_version, city_id, visibility, last_seen_at, created_at, revoked_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setInstallations((data ?? []).map((row) => {
      const lastSeenAt = row.last_seen_at ? String(row.last_seen_at) : null;
      const revokedAt = row.revoked_at ? String(row.revoked_at) : null;
      const visibility = row.visibility as AtlasOwnedAgent["visibility"];
      const live = lastSeenAt ? Date.now() - new Date(lastSeenAt).getTime() <= 2 * 60 * 1000 : false;
      return {
        id: String(row.id),
        agentId: String(row.agent_id),
        displayName: String(row.display_name),
        runtime: String(row.runtime),
        runtimeVersion: String(row.runtime_version),
        cityId: String(row.city_id),
        visibility,
        lastSeenAt,
        createdAt: String(row.created_at),
        revokedAt,
        connectionState: revokedAt ? "revoked" : visibility === "paused" ? "paused" : live ? "live" : lastSeenAt ? "offline" : "linked",
      };
    }));
  }, [client]);

  const loadUserDraft = useCallback(async (activeSession: Session) => {
    if (!client) return;
    const ownerId = activeSession.user.id;
    const [profileResult, aiProfileResult, humanPresenceResult] = await Promise.all([
      client.from("profiles").select("*").eq("id", ownerId).maybeSingle(),
      client.from("ai_profiles").select("*").eq("owner_id", ownerId).maybeSingle(),
      client.from("presence").select("*").eq("owner_id", ownerId).eq("entity_kind", "human").maybeSingle(),
    ]);
    const queryError = profileResult.error ?? aiProfileResult.error ?? humanPresenceResult.error;
    if (queryError) setError(queryError.message);
    const profile = profileResult.data;
    const aiProfile = aiProfileResult.data;
    const humanPresence = humanPresenceResult.data;

    await loadInstallations(ownerId);

    setDraft((current) => ({
      ...current,
      displayName: profile?.display_name ?? activeSession.user.user_metadata?.full_name ?? current.displayName,
      city: profile?.city ?? humanPresence?.city ?? current.city,
      latitude: Number(profile?.latitude ?? humanPresence?.latitude ?? current.latitude),
      longitude: Number(profile?.longitude ?? humanPresence?.longitude ?? current.longitude),
      bio: profile?.bio ?? current.bio,
      interests: Array.isArray(profile?.interests) ? profile.interests.join(", ") : current.interests,
      activity: (humanPresence?.activity as PresenceActivity | undefined) ?? current.activity,
      topic: humanPresence?.topic ?? current.topic,
      status: (humanPresence?.status as PresenceStatus | undefined) ?? current.status,
      controlState: (humanPresence?.control_state as ControlState | undefined) ?? current.controlState,
      aiName: aiProfile?.name ?? current.aiName,
      aiMission: aiProfile?.mission ?? current.aiMission,
      aiTask: aiProfile?.current_task ?? current.aiTask,
      aiTopic: aiProfile?.current_topic ?? current.aiTopic,
      aiState: (aiProfile?.current_state as PresenceActivity | undefined) ?? current.aiState,
      aiAutonomous: aiProfile?.autonomous ?? current.aiAutonomous,
      aiCapabilities: Array.isArray(aiProfile?.capabilities) ? aiProfile.capabilities.join(", ") : current.aiCapabilities,
    }));
  }, [client, loadInstallations]);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) void loadUserDraft(data.session);
    });
    const initialLoad = window.setTimeout(() => void loadPresenceFeed(), 0);

    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) void loadUserDraft(nextSession);
    });
    const channel = client
      .channel("atlas-presence-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, () => {
        void loadPresenceFeed();
      })
      .subscribe();

    return () => {
      active = false;
      window.clearTimeout(initialLoad);
      authListener.subscription.unsubscribe();
      void client.removeChannel(channel);
    };
  }, [client, loadPresenceFeed, loadUserDraft]);

  useEffect(() => {
    if (!client || !session) return;
    const ownerId = session.user.id;
    const channel = client
      .channel(`atlas-owned-agents-${ownerId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "atlas_agent_installations",
        filter: `owner_id=eq.${ownerId}`,
      }, () => {
        void loadInstallations(ownerId);
      })
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [client, loadInstallations, session]);

  useEffect(() => {
    if (!client || !session) return;
    const timer = window.setInterval(() => {
      void client
        .from("presence")
        .update({ updated_at: now(), expires_at: expiresAt() })
        .eq("owner_id", session.user.id);
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [client, session]);

  const signIn = useCallback(async (provider: "github" | "google") => {
    setError(null);
    if (!client) {
      setDemoConnected(true);
      return;
    }
    setBusy(true);
    const { error: signInError } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
    if (signInError) setError(signInError.message);
    setBusy(false);
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) {
      setDemoConnected(false);
      return;
    }
    if (session) {
      await client.from("presence").delete().eq("owner_id", session.user.id);
      setPresenceFeed((current) => current.filter((item) => item.ownerId !== session.user.id));
    }
    await client.auth.signOut();
    setSession(null);
    setInstallations([]);
  }, [client, session]);

  const savePresence = useCallback(async (nextDraft: PresenceDraft) => {
    setBusy(true);
    setError(null);
    setDraft(nextDraft);

    if (!client || !session) {
      setPresenceFeed(presenceFromDraft(nextDraft));
      setDemoConnected(true);
      setBusy(false);
      return true;
    }

    const ownerId = session.user.id;
    const interests = nextDraft.interests.split(",").map((item) => item.trim()).filter(Boolean);
    const capabilities = nextDraft.aiCapabilities.split(",").map((item) => item.trim()).filter(Boolean);
    const { error: profileError } = await client.from("profiles").upsert({
      id: ownerId,
      display_name: nextDraft.displayName,
      city: nextDraft.city,
      latitude: nextDraft.latitude,
      longitude: nextDraft.longitude,
      bio: nextDraft.bio,
      interests,
      updated_at: now(),
    });

    const { data: aiProfile, error: aiError } = await client.from("ai_profiles").upsert({
      owner_id: ownerId,
      name: nextDraft.aiName,
      mission: nextDraft.aiMission,
      current_task: nextDraft.aiTask,
      current_topic: nextDraft.aiTopic,
      current_state: nextDraft.aiState,
      autonomous: nextDraft.aiAutonomous,
      capabilities,
      updated_at: now(),
    }, { onConflict: "owner_id" }).select("id").single();

    if (profileError || aiError || !aiProfile) {
      setError(profileError?.message ?? aiError?.message ?? "Unable to save AI profile.");
      setBusy(false);
      return false;
    }

    const humanPresence = {
      entity_id: ownerId,
      owner_id: ownerId,
      entity_kind: "human",
      display_name: nextDraft.displayName,
      city: nextDraft.city,
      latitude: nextDraft.latitude,
      longitude: nextDraft.longitude,
      activity: nextDraft.activity,
      topic: nextDraft.topic,
      status: nextDraft.status,
      control_state: nextDraft.controlState,
      detail: nextDraft.bio,
      updated_at: now(),
      expires_at: expiresAt(),
    };
    const aiPresence = {
      entity_id: aiProfile.id,
      owner_id: ownerId,
      entity_kind: "ai",
      display_name: nextDraft.aiName,
      city: nextDraft.city,
      latitude: nextDraft.latitude,
      longitude: nextDraft.longitude,
      activity: nextDraft.aiState,
      topic: nextDraft.aiTopic,
      status: "Online",
      control_state: nextDraft.aiAutonomous ? "Autonomous" : "AI Assisted",
      detail: nextDraft.aiTask,
      updated_at: now(),
      expires_at: expiresAt(),
    };
    const { error: presenceError } = await client
      .from("presence")
      .upsert([humanPresence, aiPresence], { onConflict: "entity_kind,entity_id" });

    if (presenceError) {
      setError(presenceError.message);
      setBusy(false);
      return false;
    }

    const { error: historyError } = await client.from("presence_history").insert([
      { ...humanPresence, presence_id: crypto.randomUUID() },
      { ...aiPresence, presence_id: crypto.randomUUID() },
    ]);
    if (historyError) {
      setError(`Presence is live, but its history could not be recorded: ${historyError.message}`);
    }
    await loadPresenceFeed();
    setBusy(false);
    return true;
  }, [client, loadPresenceFeed, session]);

  return {
    configured: isSupabaseConfigured,
    connected: Boolean(session || demoConnected),
    session,
    installations,
    draft,
    presenceFeed,
    busy,
    error,
    signIn,
    signOut,
    savePresence,
  };
}
