import type { NextConfig } from "next";

/**
 * Backend application config.
 *
 * This repo serves `/api/*` and the authenticated admin UI at `/admin`. It is
 * deployed as a long-running Railway container, not a serverless function
 * (D-019), so there is no request-body ceiling to design around — the 10 KB cap
 * on public submissions is enforced in application code instead.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `pg` and `@node-rs/argon2` are native/node-only; keep them out of any
  // bundling attempt.
  serverExternalPackages: ["pg", "@node-rs/argon2"],
  async headers() {
    return [
      {
        // The whole backend is private surface: nothing here should ever be
        // indexed, including error pages (SECURITY §robots, F-14).
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
