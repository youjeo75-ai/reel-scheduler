import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // googleapis is large; keep it out of the bundler and load it from node_modules.
  serverExternalPackages: ["googleapis"],
};

export default nextConfig;
