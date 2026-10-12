import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Paquets internes publiés en TypeScript source (exports vers src/index.ts).
  transpilePackages: ['@pubeka/db', '@pubeka/shared', '@pubeka/contracts'],
};

export default nextConfig;
