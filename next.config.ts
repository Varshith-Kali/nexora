import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No `output: "standalone"` — standard `next build` / `next start`, which is
  // exactly what Vercel runs. No filesystem persistence, no long-running
  // processes: the app is request-driven by design.
};

export default nextConfig;
