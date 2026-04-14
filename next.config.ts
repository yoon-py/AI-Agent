import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true
};

export default nextConfig;

void import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
