import { db, pool } from './db/client.js';
import { loadEnv } from './lib/env.js';
import { LessonNotificationService } from './modules/notifications/lesson-notification-service.js';

const env = loadEnv();
const lessonNotifications = new LessonNotificationService({
  db,
  env,
  log: {
    info: (payload, message) => writeLog('info', message, payload),
    warn: (payload, message) => writeLog('warn', message, payload),
    error: (payload, message) => writeLog('error', message, payload),
  },
});

const LESSON_REMINDER_INTERVAL_MS = 5 * 60 * 1000;

let lessonReminderRunning = false;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function writeLog(
  level: 'info' | 'warn' | 'error',
  msg: string,
  payload: Record<string, unknown> = {},
) {
  if (env.LOG_LEVEL === 'silent') {
    return;
  }
  console.log(
    JSON.stringify({
      level,
      msg,
      app: env.APP_NAME,
      time: new Date().toISOString(),
      ...payload,
    }),
  );
}

async function runLessonReminderTick() {
  if (lessonReminderRunning) {
    return;
  }
  lessonReminderRunning = true;
  try {
    const result = await lessonNotifications.runUpcomingLessonReminders();
    writeLog('info', 'lesson reminder job completed', { ...result });
  } catch (error) {
    writeLog('error', 'lesson reminder job failed', { err: serializeError(error) });
  } finally {
    lessonReminderRunning = false;
  }
}

writeLog('info', 'fd-edu worker started');

void runLessonReminderTick();

const lessonReminderInterval = setInterval(() => {
  void runLessonReminderTick();
}, LESSON_REMINDER_INTERVAL_MS);

const heartbeatInterval = setInterval(() => {
  writeLog('info', 'fd-edu worker heartbeat');
}, 60_000);

async function shutdown(signal: string) {
  writeLog('info', 'fd-edu worker shutting down', { signal });
  clearInterval(lessonReminderInterval);
  clearInterval(heartbeatInterval);
  await pool.end();
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
