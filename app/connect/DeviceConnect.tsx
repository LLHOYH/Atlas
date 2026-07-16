"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { ArrowLeft, Bot, Check, Code2, Link2, LoaderCircle, MapPin, ShieldCheck, X } from "lucide-react";
import { atlasDeviceEndpoint, normalizeAtlasDeviceCode, type AtlasDeviceCity, type AtlasDevicePreview } from "../../lib/atlas/device";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

type Stage = "code" | "approval" | "approved" | "denied";

async function atlasRequest(path: string, body: Record<string, unknown>, accessToken?: string) {
  const response = await fetch(`${atlasDeviceEndpoint()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Atlas could not verify this device");
  return payload;
}

export function DeviceConnect() {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<AtlasDevicePreview | null>(null);
  const [cities, setCities] = useState<AtlasDeviceCity[]>([]);
  const [cityId, setCityId] = useState("");
  const [stage, setStage] = useState<Stage>("code");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const queryCode = normalizeAtlasDeviceCode(new URLSearchParams(window.location.search).get("code") ?? "");
    const syncCode = window.setTimeout(() => {
      if (queryCode) setCode(queryCode);
    }, 0);
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => {
      window.clearTimeout(syncCode);
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!client || !session) return;
    void client.from("atlas_cities").select("id, name, country").order("country").order("name").then(({ data, error: cityError }) => {
      if (cityError) setError(cityError.message);
      const next = (data ?? []) as AtlasDeviceCity[];
      setCities(next);
      setCityId((current) => current || next.find((city) => city.id === "singapore")?.id || next[0]?.id || "");
    });
  }, [client, session]);

  const verify = useCallback(async () => {
    if (!session || normalizeAtlasDeviceCode(code).length !== 9) return;
    setBusy(true);
    setError(null);
    try {
      const data = await atlasRequest("/device/verify", { user_code: code }, session.access_token);
      const next = data as unknown as AtlasDevicePreview;
      setPreview(next);
      if (next.city_id) setCityId(next.city_id);
      setStage(next.state === "approved" ? "approved" : "approval");
    } catch (nextError) {
      setPreview(null);
      setStage("code");
      setError(nextError instanceof Error ? nextError.message : "Atlas could not verify this device");
    } finally {
      setBusy(false);
    }
  }, [code, session]);

  useEffect(() => {
    if (!session || code.length !== 9 || preview || busy || error) return;
    const timer = window.setTimeout(() => void verify(), 0);
    return () => window.clearTimeout(timer);
  }, [busy, code, error, preview, session, verify]);

  const signIn = async (provider: "github" | "google") => {
    if (!client) return setError("Atlas authentication is not configured");
    setBusy(true);
    setError(null);
    const returnPath = `/connect?code=${encodeURIComponent(normalizeAtlasDeviceCode(code))}`;
    const { error: signInError } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnPath)}` },
    });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!session || !preview || !cityId) return;
    setBusy(true);
    setError(null);
    try {
      await atlasRequest("/device/approve", { user_code: preview.user_code, city_id: cityId }, session.access_token);
      setStage("approved");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Atlas could not link this agent");
    } finally {
      setBusy(false);
    }
  };

  const deny = async () => {
    if (!session || !preview) return;
    setBusy(true);
    setError(null);
    try {
      await atlasRequest("/device/deny", { user_code: preview.user_code }, session.access_token);
      setStage("denied");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Atlas could not deny this request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="deviceConnectShell">
      <div className="deviceConnectGlow" />
      <Link className="deviceBack" href="/"><ArrowLeft size={14} /> Back to Atlas</Link>
      <section className="deviceConnectCard glassPanel" aria-live="polite">
        <header className="deviceConnectHeader">
          <span className="atlasGlyph"><i /><i /><i /></span>
          <span className="eyebrow"><Link2 size={11} /> AGENT CONNECTION</span>
          <h1>{stage === "approved" ? "Agent connected." : stage === "denied" ? "Connection denied." : "Connect an agent to your Atlas profile."}</h1>
          <p>{stage === "approved" ? "The terminal will finish setup and your agent will appear in your profile." : stage === "denied" ? "No agent credential was activated." : "Review the device code shown by your agent before granting access."}</p>
        </header>

        {stage === "approved" ? (
          <div className="deviceResult success"><Check size={24} /><div><b>{preview?.display_name ?? "Your agent"} is linked</b><span>{session?.user.email} · You can return to the terminal.</span></div></div>
        ) : stage === "denied" ? (
          <div className="deviceResult denied"><X size={24} /><div><b>Request denied</b><span>Close this page or start setup again from the agent.</span></div></div>
        ) : (
          <>
            <label className="deviceCodeField">
              <span>DEVICE CODE</span>
              <input value={code} onChange={(event) => {
                setCode(normalizeAtlasDeviceCode(event.target.value));
                setPreview(null);
                setError(null);
                setStage("code");
              }} placeholder="ABCD-EFGH" maxLength={9} autoCapitalize="characters" autoComplete="one-time-code" />
            </label>

            {!session ? (
              <div className="deviceAuthBlock">
                <span><ShieldCheck size={15} /> Sign in so this agent belongs to your Atlas profile</span>
                <div className="providerButtons">
                  <button disabled={busy || code.length !== 9} onClick={() => void signIn("github")}><Code2 size={17} /> Continue with GitHub</button>
                  <button disabled={busy || code.length !== 9} onClick={() => void signIn("google")}><b className="googleMark">G</b> Continue with Google</button>
                </div>
              </div>
            ) : stage === "code" ? (
              <button className="devicePrimary" disabled={busy || code.length !== 9} onClick={() => void verify()}>{busy ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />} Verify device</button>
            ) : preview ? (
              <div className="deviceApproval">
                <div className="deviceIdentity"><span><Bot size={18} /></span><div><b>{preview.display_name}</b><small>{preview.runtime} · {preview.runtime_version}</small></div><em>REQUESTING</em></div>
                <label><span><MapPin size={12} /> Approximate agent location</span><select value={cityId} onChange={(event) => setCityId(event.target.value)}>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}, {city.country}</option>)}</select></label>
                <div className="deviceConsent"><ShieldCheck size={14} /><span>Atlas will receive status, activity category, topic category, runtime and approximate city. Prompts, responses, files, commands and precise location are excluded.</span></div>
                <div className="deviceApprovalActions"><button disabled={busy} onClick={() => void deny()}>Deny</button><button className="approve" disabled={busy || !cityId} onClick={() => void approve()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Approve &amp; link</button></div>
              </div>
            ) : null}
          </>
        )}
        {error && <div className="deviceError">{error}</div>}
        <footer><span>{session ? `Signed in as ${session.user.email}` : "Approval requires an Atlas account"}</span><small>Codes expire after 10 minutes</small></footer>
      </section>
    </main>
  );
}
