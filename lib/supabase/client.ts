"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// These are replaced at build time by Next.js. Reading them inside the
// function (or at module top) ensures no runtime `process` usage in the
// browser bundle.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
