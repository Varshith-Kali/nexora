import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Suppress the "N" build indicator overlay — clean demo experience.
  devIndicators: false,
  // No `output: "standalone"` — standard `next build` / `next start`, which is
  // exactly what Vercel runs. No filesystem persistence, no long-running
  // processes: the app is request-driven by design.
};

export default nextConfig;
