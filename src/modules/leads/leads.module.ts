import { buildLeadsEventsPublisher } from "../../lib/leads-events.publisher.js";
import { LeadsRepository } from "./leads.repository.js";
import { LeadsService } from "./leads.service.js";

const leadsRepository = new LeadsRepository();
const leadsEventsPublisher = buildLeadsEventsPublisher();

export const leadsService = new LeadsService(
  leadsRepository,
  leadsEventsPublisher,
);
