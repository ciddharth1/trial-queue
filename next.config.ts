import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // outputFileTracingRoot pins file tracing to this project so Next does not
  // accidentally walk up into a parent monorepo. process.cwd() is safe because
  // Next always runs from the project root during build.
  outputFileTracingRoot: process.cwd(),
  // Restrict remote image hosts. Add your CDN/avatar provider here.
  // Wildcard hostname ("**") is unsafe — Next image optimizer will fetch arbitrary URLs.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google avatars
      { protocol: "https", hostname: "avatars.githubusercontent.com" }, // GitHub avatars
      { protocol: "https", hostname: "i.pravatar.cc" }, // demo placeholder
      { protocol: "https", hostname: "res.cloudinary.com" }, // common CDN
    ],
  },
  // Security headers for production
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
