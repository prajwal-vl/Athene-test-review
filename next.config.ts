import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"], // Optimize image formats
    dangerouslyAllowSVG: true,
  },
  headers: async () => [
    {
      // Only cache truly static assets; dashboard/API routes must not be shared across users
      source: "/_next/static/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
  ],
};

export default nextConfig;
