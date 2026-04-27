import { env } from "./config/env.js";
import { buildApp } from "./app.js";
import { startJobScheduler } from "./jobs/job-scheduler.js";
import { logWhatsAppRuntimeConfig } from "./lib/runtime-diagnostics.js";

const app = buildApp();

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`Listening on ${address}`);
    logWhatsAppRuntimeConfig(app.log, "api");
    startJobScheduler();
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
