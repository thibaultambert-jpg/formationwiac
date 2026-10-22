import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI (migrations) uses the direct connection; the app runtime uses the
// pooled DATABASE_URL through the pg driver adapter (see src/lib/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
