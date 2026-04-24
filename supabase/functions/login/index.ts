import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const attempts: Map<string, { count: number; resetAt: number }> = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + LOCKOUT_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

async function hashPassword(userKey: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${userKey}:floor:${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: "Too many attempts. Try again in 60 seconds." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { user_key, password } = await req.json();
    if (!user_key || !password) {
      return new Response(JSON.stringify({ error: "Missing user_key or password" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanKey = String(user_key).trim().toLowerCase();

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await sb
      .from("floor_members")
      .select("user_key, display_name, first_name, title, password_hash, status, role_id, is_principal")
      .eq("user_key", cleanKey)
      .maybeSingle();

    if (error) throw error;

    if (!data || data.status === "inactive") {
      return new Response(JSON.stringify({ error: "Invalid username or password" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (data.password_hash) {
      const hashed = await hashPassword(data.user_key, password);
      if (hashed !== data.password_hash) {
        return new Response(JSON.stringify({ error: "Invalid username or password" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const sessionSecret = Deno.env.get("FLOOR_SESSION_SECRET");
    const issued = Date.now();
    const expires = issued + 7 * 24 * 60 * 60 * 1000;
    const payload = `${data.user_key}:${issued}:${expires}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(sessionSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const token = btoa(payload) + "." + [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");

    const { password_hash: _, ...safeMember } = data;

    return new Response(JSON.stringify({
      ok: true,
      member: safeMember,
      session_token: token,
      expires_at: new Date(expires).toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("login error:", e);
    return new Response(JSON.stringify({ error: "Login failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
