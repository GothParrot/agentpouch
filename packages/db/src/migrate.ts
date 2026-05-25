import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as drizzleMigrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate(connectionString: string): Promise<void> {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  try {
    await drizzleMigrate(db, {
      migrationsFolder: join(__dirname, "migrations"),
    });
  } finally {
    await client.end();
  }
}
