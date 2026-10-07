import type { NextConfig } from "next";
import { resolve } from "node:path";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@imprest/core"],
  outputFileTracingRoot: resolve(process.cwd(), ".."),
  outputFileTracingIncludes: { "/**": ["../proof/**/*.json", "../docs/**/*.md", "../config/**/*.json"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
