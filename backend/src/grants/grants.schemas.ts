import { z } from "zod";
import { GRANT_TYPES, GRANTS_MESSAGES } from "./grants.constants";

export const grantSchema = z
  .object({
    role: z.string().min(1),
    grantType: z.enum(GRANT_TYPES, { message: GRANTS_MESSAGES.invalidGrantType }),
    grantId: z.string().min(1),
  })
  .strict();
