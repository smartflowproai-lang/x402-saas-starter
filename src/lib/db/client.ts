/**
 * Drizzle ORM client singleton. Lazy-initialised so smoke tests can run
 * without a real Postgres instance.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let _db: PostgresJsDatabase<typeof schema> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set — copy .env.example to .env first");
  }
  const sql = postgres(url, { max: 5 });
  _db = drizzle(sql, { schema });
  return _db;
}

export { schema };
