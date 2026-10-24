import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

// Cache Components is intentionally disabled: every page is per-user and
// rendered at request time behind Google authentication.
const nextConfig: NextConfig = {
  // PDF rendering runs in Node.js only (server routes and actions).
  serverExternalPackages: ["@react-pdf/renderer"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV === "development") }];
  },
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
