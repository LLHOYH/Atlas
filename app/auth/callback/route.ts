import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const client = await getSupabaseServerClient();
    if (client) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) {
        const destination = new URL("/", requestUrl.origin);
        destination.searchParams.set("auth_error", error.message);
        return NextResponse.redirect(destination);
      }
    }
  }

  return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
}
