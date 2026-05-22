import { z } from "@hono/zod-openapi";

export const ErrorSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
  })
  .openapi("Error");

export type ApiError = z.infer<typeof ErrorSchema>;
