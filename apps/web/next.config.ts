import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Paquets internes publiés en TypeScript source (exports vers src/index.ts).
  transpilePackages: [
    '@pubeka/db',
    '@pubeka/shared',
    '@pubeka/contracts',
    '@pubeka/i18n',
    '@pubeka/ui',
  ],
};

// Sans routage par la langue : la langue vient du profil ou du cookie (i18n/request.ts).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
