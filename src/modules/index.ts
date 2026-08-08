import { attendanceModule } from './attendance/index.js';
import { auditModule } from './audit/index.js';
import { adminMiniModule } from './admin-mini/index.js';
import { authModule } from './auth/index.js';
import { catalogModule } from './catalog/index.js';
import { contentModule } from './content/index.js';
import { courseContractsModule } from './course-contracts/index.js';
import { crmModule } from './crm/index.js';
import { financeModule } from './finance/index.js';
import { lessonModule } from './lesson/index.js';
import { notificationsModule } from './notifications/index.js';
import { parentCenterModule } from './parent-center/index.js';
import { paymentModule } from './payment/index.js';
import { peopleModule } from './people/index.js';
import { refundModule } from './refund/index.js';
import { reportModule } from './report/index.js';
import { schedulingModule } from './scheduling/index.js';
import { systemModule } from './system/index.js';
import { teachingModule } from './teaching/index.js';
import { organizationModule } from './organization/index.js';
import { trialModule } from './trial/index.js';
import type { AppModule } from './types.js';

export const appModules: AppModule[] = [
  systemModule,
  authModule,
  organizationModule,
  contentModule,
  catalogModule,
  trialModule,
  crmModule,
  peopleModule,
  teachingModule,
  schedulingModule,
  courseContractsModule,
  attendanceModule,
  auditModule,
  adminMiniModule,
  lessonModule,
  financeModule,
  reportModule,
  notificationsModule,
  parentCenterModule,
  paymentModule,
  refundModule,
];

export function getModuleNames(): string[] {
  return appModules.map((module) => module.name);
}
