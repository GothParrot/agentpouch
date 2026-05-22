import { z } from "zod";

// ---------------------------------------------------------------------------
// Expiry presets
// ---------------------------------------------------------------------------

const ExpiryPresets = ["10m", "1d", "3d", "7d", "30d"] as const;

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

const configSchema = z.object({
  // --- server ---
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // --- database ---
  DATABASE_URL: z.string().min(1),
  AUTO_MIGRATE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // --- auth ---
  API_TOKEN: z.string().min(1),
  PUBLIC_BASE_URL: z.string().url().optional(),

  // --- storage ---
  STORAGE: z.enum(["local", "s3"]).default("local"),
  STORAGE_PATH: z.string().default("/data"),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // --- adapters ---
  QUEUE: z.enum(["inline", "pgboss"]).default("inline"),
  KV: z.enum(["memory", "redis"]).default("memory"),
  REDIS_URL: z.string().optional(),
  ROLE: z.enum(["server", "worker"]).default("server"),

  // --- hosted / guest mode ---
  ENABLE_GUEST_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  GUEST_MAX_FILE_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024), // 10 MB
  GUEST_MAX_TTL: z.enum(ExpiryPresets).default("1d"),

  // --- limits ---
  MAX_FILE_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * 1024 * 1024 * 1024), // 100 GB
  DEFAULT_TTL: z.enum(ExpiryPresets).default("7d"),
  ALLOWED_EXPIRY_PRESETS: z
    .string()
    .default("10m,1d,3d,7d,30d")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is (typeof ExpiryPresets)[number] =>
          (ExpiryPresets as readonly string[]).includes(s),
        ),
    ),

  // --- short links ---
  SHORTLINK_DOMAIN: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

let _config: Config | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (_config) return _config;

  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  _config = result.data;
  return _config;
}

export function resetConfig(): void {
  _config = undefined;
}
