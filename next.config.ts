import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // e2e tests run their own dev server with NEXT_DIST_DIR=.next-e2e so they never clash with `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
