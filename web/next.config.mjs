const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export is only used for the production build served by the C++ http_server.
  // In dev mode we run a normal Next.js server with API proxying.
  ...(isProd ? { output: "export", distDir: "out" } : {}),

  // In dev mode, proxy /api/* to the C++ http_server so the frontend
  // can fetch from the same origin. Only defined in dev to avoid export warnings.
  ...(!isProd && {
    async rewrites() {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:2525/api/:path*",
        },
      ];
    },
  }),
};

export default nextConfig;
