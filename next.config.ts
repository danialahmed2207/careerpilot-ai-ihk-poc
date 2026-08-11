import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for the portable Docker image.
  output: "standalone",
};

export default nextConfig;
