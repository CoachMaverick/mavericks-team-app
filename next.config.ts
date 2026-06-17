import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Recommended for Supabase + images if using remote
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  // Turbopack friendly in dev (Next 15 default)
};

export default nextConfig;
