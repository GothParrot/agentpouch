import { createRoute, z } from "@hono/zod-openapi";
import { ErrorSchema } from "../schemas/error.js";
import { ReferenceSchema } from "../schemas/reference.js";

export const RunManifestSchema = z
  .object({
    run_id: z.string(),
    files: z.array(ReferenceSchema),
    total: z.number().int().nonnegative(),
  })
  .openapi("RunManifest");

export type RunManifest = z.infer<typeof RunManifestSchema>;

export const listRunArtifactsRoute = createRoute({
  method: "get",
  path: "/v1/runs/{run_id}",
  tags: ["runs"],
  summary: "List all artifacts for a run",
  description: "Returns all references associated with a run_id, across any scope or step.",
  request: {
    params: z.object({ run_id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: RunManifestSchema } },
      description: "Run artifact manifest",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
  },
});
