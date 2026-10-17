import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Hide the floating Next.js badge; it covered the map attribution.
  devIndicators: false,
};

export default nextConfig;
