import type { NextConfig } from "next";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

/** Commit this build was made from: Vercel provides it at build time; locally, ask git. */
function buildSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

const config: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha(),
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_BUILD_ENV: process.env.VERCEL_ENV ?? "local",
  },
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
