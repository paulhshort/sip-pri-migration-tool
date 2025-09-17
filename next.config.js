/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Optimize for production
  reactStrictMode: true,

  // Ensure native deps used by ssh2 are treated as externals and included in standalone
  experimental: {
    serverExternalPackages: ['ssh2', 'cpu-features'],
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      // Avoid bundling native modules; let Node require them at runtime
      config.externals.push('ssh2', 'cpu-features');
    }
    return config;
  },

  // Allow Docker production build even if ESLint finds issues (CI enforces lint separately)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Environment variable configuration
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;