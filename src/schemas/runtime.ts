import { z } from "zod";
import { ActionEnvelopeSchema } from "../protocol/actions.js";

export const RuntimeRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chat"),
    text: z.string().min(1),
  }),
  z.object({
    kind: z.literal("slash_command"),
    text: z.string().min(1),
  }),
  z.object({
    kind: z.literal("action_envelope"),
    envelope: ActionEnvelopeSchema,
  }),
]);

export type RuntimeRequest = z.infer<typeof RuntimeRequestSchema>;
