import Fastify from "fastify";
import { env } from "./config/env.js";
import { corsPlugin } from "./plugins/cors.js";
import { swaggerPlugin } from "./plugins/swagger.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { leadsRoutes } from "./modules/leads/leads.router.js";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

export function buildApp(){
    const app = Fastify({
        logger: env.NODE_ENV !== "test",
    })

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);


  // plugins (infra)
  app.register(corsPlugin);
  app.register(swaggerPlugin);
  app.register(errorHandlerPlugin);

  // routes (módulos)
  app.register(healthRoutes);
  app.register(userRoutes, {prefix:"/users"});
  app.register(leadsRoutes, {prefix:"/leads"});

  return app;
}