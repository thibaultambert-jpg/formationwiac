import type { NextConfig } from "next";

// Cache Components is intentionally disabled: every page is per-user and
// rendered at request time behind Google authentication.
const nextConfig: NextConfig = {
  // PDF rendering runs in Node.js only (server routes and actions).
  serverExternalPackages: ["@react-pdf/renderer"],
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
