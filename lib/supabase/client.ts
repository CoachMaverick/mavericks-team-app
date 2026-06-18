"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// These are replaced at build time by Next.js. Reading them inside the
// function (or at module top) ensures no runtime `process` usage in the
// browser bundle.
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase client not initialized: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Ensure these environment variables are set (in .env.local for dev, or Vercel dashboard for prod) and that a production build was done with them."
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
