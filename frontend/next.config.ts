import type { NextConfig } from "next";

// Until the API has its own subdomain, the browser talks only to this site and
// these rewrites forward /api and /uploads to the backend. That keeps the
// session and CSRF cookies first-party: a page on vercel.app cannot read a
// CSRF cookie set by another domain, and Safari rejects such cookies outright.
// Pair it with NEXT_PUBLIC_API_URL=/api. Once the API lives on
// api.<your-domain>, unset this and point NEXT_PUBLIC_API_URL there instead.
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "4000",
      },
    ],
  },
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      { source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` },
      { source: "/uploads/:path*", destination: `${apiProxyTarget}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
