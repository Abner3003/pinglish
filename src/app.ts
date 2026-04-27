import Fastify from "fastify";
import { env } from "./config/env.js";
import { corsPlugin } from "./plugins/cors.js";
import { swaggerPlugin } from "./plugins/swagger.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { professionalRoutes } from "./modules/professionals/professionals.routes.js";
import { planRoutes } from "./modules/plans/plans.routes.js";
import { couponRoutes } from "./modules/coupons/coupons.routes.js";
import { kycUserRoutes } from "./modules/kyc-users/kyc-users.routes.js";
import { kycProfessionalRoutes } from "./modules/kyc-professionals/kyc-professionals.routes.js";
import { userChannelRoutes } from "./modules/user-channels/user-channels.routes.js";
import { onboardingRoutes } from "./modules/onboarding/onboarding.routes.js";
import { metaWhatsAppRoutes } from "./modules/meta-whatsapp/meta-whatsapp.routes.js";
import { leagueRoutes } from "./modules/leagues/leagues.routes.js";
import { userJourneyRoutes } from "./modules/user-journeys/user-journeys.routes.js";
import { tenantRoutes } from "./modules/tenants/tenants.routes.js";
import { learningProfileRoutes } from "./modules/learning-profiles/learning-profiles.routes.js";
import { learningItemsRoutes } from "./modules/learning-items/learning-items.routes.js";
import { userLearningStateRoutes } from "./modules/user-learning-states/user-learning-states.routes.js";
import { dailyStudyPackRoutes } from "./modules/daily-study-packs/daily-study-packs.routes.js";
import { studyEventRoutes } from "./modules/study-events/study-events.routes.js";
import { learningResponseRoutes } from "./modules/learning-response/learning-response.routes.js";
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
  app.register(professionalRoutes, {prefix:"/professionals"});
  app.register(planRoutes, {prefix:"/plans"});
  app.register(couponRoutes, {prefix:"/coupons"});
  app.register(kycUserRoutes, {prefix:"/kyc-users"});
  app.register(kycProfessionalRoutes, {prefix:"/kyc-professionals"});
  app.register(userChannelRoutes, {prefix:"/user-channels"});
  app.register(onboardingRoutes);
  app.register(metaWhatsAppRoutes);
  app.register(leagueRoutes, {prefix:"/leagues"});
  app.register(userJourneyRoutes, {prefix:"/user-journeys"});
  app.register(tenantRoutes, {prefix:"/tenants"});
  app.register(learningProfileRoutes, {prefix:"/learning-profiles"});
  app.register(learningItemsRoutes, {prefix:"/learning-items"});
  app.register(userLearningStateRoutes, {prefix:"/user-learning-states"});
  app.register(dailyStudyPackRoutes, {prefix:"/daily-study-packs"});
  app.register(studyEventRoutes, {prefix:"/study-events"});
  app.register(learningResponseRoutes, {prefix:"/learning-response"});

  return app;
}
