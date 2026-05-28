import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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

const result = spawnSync('npx', ['drizzle-kit', 'migrate'], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
