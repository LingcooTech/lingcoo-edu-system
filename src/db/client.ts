import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema.js';
import { loadEnv } from '../lib/env.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
}

/**
 * Creates an isolated pool + drizzle client. Each Fastify app instance owns its
 * own handle so that closing one app does not end a pool another instance (or a
 * later test) still uses.
 */
export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/**
 * Shared default handle for standalone scripts (e.g. seed) that are not driven
 * by a Fastify app lifecycle.
 */
const defaultHandle = createDb(loadEnv().DATABASE_URL);
export const db = defaultHandle.db;
export const pool = defaultHandle.pool;
