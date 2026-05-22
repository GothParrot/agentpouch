import { createRoute, z } from "@hono/zod-openapi";

const HealthSchema = z
  .object({
    status: z.literal("ok"),
    db: z.boolean(),
    storage: z.boolean(),
    uptime_seconds: z.number(),
  })
  .openapi("Health");

export const healthzRoute = createRoute({
  method: "get",
  path: "/healthz",
  tags: ["ops"],
  summary: "Liveness and readiness check",
  responses: {
    200: {
      content: { "application/json": { schema: HealthSchema } },
      description: "Service is healthy",
    },
    503: {
      content: {
        "application/json": {
          schema: z
            .object({ status: z.literal("degraded"), error: z.string() })
            .openapi("HealthDegraded"),
        },
      },
      description: "Service is degraded",
    },
  },
});
