import { env } from "./config/env.js";
import { buildApp } from "./app.js";
import { startJobScheduler } from "./jobs/job-scheduler.js";
import { prisma } from "./lib/prisma.js";
import { logWhatsAppRuntimeConfig } from "./lib/runtime-diagnostics.js";
import { backfillSeedItemsForAllTenants } from "./modules/tenants/tenant-seed-items.js";
import { resolveDefaultTenantId } from "./modules/tenants/default-tenant.service.js";

const app = buildApp();

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then(async (address) => {
    app.log.info(`Listening on ${address}`);
    logWhatsAppRuntimeConfig(app.log, "api");
    const defaultTenantId = await resolveDefaultTenantId();
    const backfill = await backfillSeedItemsForAllTenants(prisma);

    app.log.info(
      {
        scope: "tenant-seed-backfill",
        defaultTenantId,
        checked: backfill.checked,
        seeded: backfill.seeded,
      },
      "[startup] tenant seed backfill completed",
    );

    startJobScheduler();
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
