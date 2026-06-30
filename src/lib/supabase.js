/**
 * Supabase Client — Ralli
 *
 * Singleton client used across the entire app.
 * Import `supabase` from this file for all database and realtime operations.
 *
 * Config notes:
 *   - eventsPerSecond: 10 — sufficient for game play (default is 10 anyway)
 *   - heartbeatIntervalMs: 15000 — keep connections alive through NAT/proxies
 *   - reconnectAfterMs: exponential backoff capped at 30s
 *
 * Production checklist:
 *   - Rotate the anon key if it's ever exposed beyond .env.local
 *   - Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Vercel environment variables
 *   - The service_role key must NEVER appear in client code — server-side only
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[ralli] Missing Supabase environment variables.\n" +
    "Copy .env.example → .env.local and fill in your project URL and anon key."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
    heartbeatIntervalMs: 15000,
    reconnectAfterMs: (tries) => Math.min(tries * 1000, 30000),
  },
  auth: {
    // Persist sessions in localStorage — swap to sessionStorage if needed
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
