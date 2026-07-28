import { db, pool } from './db/client.js';
import * as courseContractsRepo from './db/repositories/course-contracts.js';
import * as trialRepo from './db/repositories/trial.js';
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
const EXPIRED_TRIAL_CLOSE_INTERVAL_MS = 10 * 60 * 1000;
const PERIOD_PACKAGE_EXPIRY_INTERVAL_MS = 10 * 60 * 1000;

let lessonReminderRunning = false;
let expiredTrialCloseRunning = false;
let periodPackageExpiryRunning = false;

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

async function runExpiredTrialCloseTick() {
  if (expiredTrialCloseRunning) {
    return;
  }
  expiredTrialCloseRunning = true;
  try {
    const closedSessions = await trialRepo.closeExpiredTrialSessions(db);
    if (closedSessions.length > 0) {
      writeLog('info', 'expired trial sessions closed', { count: closedSessions.length });
    }
  } catch (error) {
    writeLog('error', 'expired trial close job failed', { err: serializeError(error) });
  } finally {
    expiredTrialCloseRunning = false;
  }
}

async function runPeriodPackageExpiryTick() {
  if (periodPackageExpiryRunning) return;
  periodPackageExpiryRunning = true;
  try {
    const count = await courseContractsRepo.expirePeriodPackageContracts(db);
    if (count > 0) {
      writeLog('info', 'expired period packages completed', { count });
    }
  } catch (error) {
    writeLog('error', 'period package expiry job failed', { err: serializeError(error) });
  } finally {
    periodPackageExpiryRunning = false;
  }
}

writeLog('info', 'fd-edu worker started');

void runLessonReminderTick();
void runExpiredTrialCloseTick();
void runPeriodPackageExpiryTick();

const lessonReminderInterval = setInterval(() => {
  void runLessonReminderTick();
}, LESSON_REMINDER_INTERVAL_MS);

const expiredTrialCloseInterval = setInterval(() => {
  void runExpiredTrialCloseTick();
}, EXPIRED_TRIAL_CLOSE_INTERVAL_MS);

const periodPackageExpiryInterval = setInterval(() => {
  void runPeriodPackageExpiryTick();
}, PERIOD_PACKAGE_EXPIRY_INTERVAL_MS);

const heartbeatInterval = setInterval(() => {
  writeLog('info', 'fd-edu worker heartbeat');
}, 60_000);

async function shutdown(signal: string) {
  writeLog('info', 'fd-edu worker shutting down', { signal });
  clearInterval(lessonReminderInterval);
  clearInterval(expiredTrialCloseInterval);
  clearInterval(periodPackageExpiryInterval);
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
