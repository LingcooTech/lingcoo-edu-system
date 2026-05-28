import { buildApp } from './app.js';
import { loadEnv } from './lib/env.js';

const env = loadEnv();
const app = await buildApp(env);

await app.listen({
  host: env.API_HOST,
  port: env.API_PORT,
});
