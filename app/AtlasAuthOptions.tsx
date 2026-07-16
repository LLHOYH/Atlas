"use client";

import { useId, useState, type FormEvent } from "react";
import { Code2, Mail, Send } from "lucide-react";

type AtlasAuthOptionsProps = {
  busy: boolean;
  disabled?: boolean;
  onOAuth: (provider: "github" | "google") => Promise<void>;
  onEmail: (email: string) => Promise<boolean>;
};

export function AtlasAuthOptions({ busy, disabled = false, onOAuth, onEmail }: AtlasAuthOptionsProps) {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLocaleLowerCase();
    if (!normalizedEmail || busy || disabled) return;
    if (await onEmail(normalizedEmail)) setSentTo(normalizedEmail);
  };

  return (
    <div className="authOptions">
      <div className="providerButtons">
        <button type="button" disabled={busy || disabled} onClick={() => void onOAuth("github")}><Code2 size={17} /> Continue with GitHub</button>
        <button type="button" disabled={busy || disabled} onClick={() => void onOAuth("google")}><span className="googleMark">G</span> Continue with Google</button>
      </div>
      <div className="authDivider" aria-hidden="true"><i /><span>OR</span><i /></div>
      {sentTo ? (
        <div className="emailAuthSent" role="status">
          <Mail size={16} />
          <span><b>Check your email</b><small>We sent a secure Atlas sign-in link to {sentTo}.</small></span>
          <button type="button" disabled={busy} onClick={() => setSentTo(null)}>Change</button>
        </div>
      ) : (
        <form className="emailAuthForm" onSubmit={submitEmail}>
          <label htmlFor={emailId}>EMAIL</label>
          <div>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={busy || disabled}
            />
            <button type="submit" disabled={busy || disabled}><Send size={14} /> Continue</button>
          </div>
          <small>No password required. We’ll email you a one-time sign-in link.</small>
        </form>
      )}
    </div>
  );
}
