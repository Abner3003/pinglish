import { LeadsRepository } from "./leads.repository.js";
import { LeadsService } from "./leads.service.js";

// leads.module.ts
const leadsRepository = new LeadsRepository();
export const leadsService = new LeadsService(leadsRepository);