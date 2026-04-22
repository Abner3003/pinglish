import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "../generated/prisma/index.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const buildPoolConfig = (databaseUrl: string): PoolConfig => {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("sslmode");
  const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

  if (sslMode === "disable" || (!sslMode && isLocalhost)) {
    return { connectionString: databaseUrl, ssl: false };
  }

  if (sslMode === "no-verify") {
    return {
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    };
  }

  return { connectionString: databaseUrl };
};

const adapter = new PrismaPg(buildPoolConfig(connectionString));

export const prisma = new PrismaClient({ adapter });
