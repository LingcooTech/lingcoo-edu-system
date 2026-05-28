import { loadEnv } from './lib/env.js';

const env = loadEnv();

console.log(
  JSON.stringify({
    level: env.LOG_LEVEL,
    msg: 'fd-edu worker started',
    app: env.APP_NAME,
  }),
);

setInterval(() => {
  console.log(
    JSON.stringify({
      level: env.LOG_LEVEL,
      msg: 'fd-edu worker heartbeat',
      time: new Date().toISOString(),
    }),
  );
}, 60_000);
