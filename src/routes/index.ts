import type { FastifyPluginAsync } from "fastify";
import { healthRoutes } from "../modules/health/health.routes.js";
import { userRoutes } from "../modules/users/user.routes.js";

export const registerRoutes: FastifyPluginAsync = async (app)=> {
    app.register(healthRoutes);
    app.register(userRoutes);
}