import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
      allowedOrigins: ['*'],
    },
  },
};

export default nextConfig;
