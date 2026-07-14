import { existsSync, readdirSync } from 'node:fs';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

function hasSqlMigration(dir) {
  if (!existsSync(dir)) {
    return false;
  }

  return readdirSync(dir, { withFileTypes: true }).some(
    (entry) => entry.isFile() && entry.name.endsWith('.sql'),
  );
}

if (!hasSqlMigration('./drizzle')) {
  console.log('No drizzle migrations found; skipping migration for current MVP build.');
  process.exit(0);
}

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://fd_edu:fd_edu@localhost:5434/fd_edu';
const pool = new pg.Pool({ connectionString });

try {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Drizzle migrations applied successfully.');
} finally {
  await pool.end();
}
