import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Migrasi memakai koneksi session-mode (port 5432); runtime aplikasi tidak memakai Prisma.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
