import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended']);
export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'trialing']);
export const memberRoleEnum = pgEnum('member_role', [
  'owner',
  'admin',
  'advisor',
  'academic',
  'teacher',
  'finance',
]);
export const courseStatusEnum = pgEnum('course_status', ['draft', 'published', 'archived']);
export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'trial_booked',
  'trial_attended',
  'paid',
  'follow_up',
  'invalid',
]);
export const trialSessionStatusEnum = pgEnum('trial_session_status', [
  'open',
  'closed',
  'cancelled',
]);
export const studentStatusEnum = pgEnum('student_status', ['active', 'inactive']);
export const classStatusEnum = pgEnum('class_status', [
  'recruiting',
  'active',
  'completed',
  'paused',
]);
export const classSessionStatusEnum = pgEnum('class_session_status', [
  'scheduled',
  'completed',
  'cancelled',
]);
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'leave',
  'absent',
  'makeup',
  'trial',
]);
export const lessonTransactionTypeEnum = pgEnum('lesson_transaction_type', [
  'purchase',
  'consume',
  'refund',
  'adjustment',
]);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'paid', 'refunded', 'cancelled']);
export const auditOutcomeEnum = pgEnum('audit_outcome', ['succeeded', 'failed']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 160 }).notNull(),
  brandName: varchar('brand_name', { length: 160 }).notNull(),
  phone: varchar('phone', { length: 40 }),
  address: varchar('address', { length: 255 }),
  status: tenantStatusEnum('status').notNull().default('trialing'),
  settings: jsonb('settings')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const campuses = pgTable(
  'campuses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    address: varchar('address', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('campuses_tenant_idx').on(table.tenantId),
  }),
);

export const tenantMemberships = pgTable(
  'tenant_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUserUnique: uniqueIndex('tenant_memberships_tenant_user_idx').on(
      table.tenantId,
      table.userId,
    ),
  }),
);

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 80 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCodeUnique: uniqueIndex('channels_tenant_code_idx').on(table.tenantId, table.code),
  }),
);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    slug: varchar('slug', { length: 120 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    category: varchar('category', { length: 80 }).notNull(),
    ageRange: varchar('age_range', { length: 120 }).notNull(),
    lessonCount: integer('lesson_count').notNull().default(0),
    durationMinutes: integer('duration_minutes').notNull().default(60),
    priceAmount: integer('price_amount').notNull().default(0),
    summary: text('summary').notNull().default(''),
    content: text('content').notNull().default(''),
    status: courseStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantSlugUnique: uniqueIndex('courses_tenant_slug_idx').on(table.tenantId, table.slug),
    statusIdx: index('courses_tenant_status_idx').on(table.tenantId, table.status),
  }),
);

export const trialSessions = pgTable(
  'trial_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => campuses.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    capacity: integer('capacity').notNull().default(8),
    bookedCount: integer('booked_count').notNull().default(0),
    status: trialSessionStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantStartsIdx: index('trial_sessions_tenant_starts_idx').on(table.tenantId, table.startsAt),
  }),
);

export const guardians = pgTable(
  'guardians',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 40 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantPhoneIdx: index('guardians_tenant_phone_idx').on(table.tenantId, table.phone),
  }),
);

export const students = pgTable(
  'students',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id').references(() => guardians.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 120 }).notNull(),
    grade: varchar('grade', { length: 80 }).notNull(),
    school: varchar('school', { length: 160 }),
    status: studentStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIdx: index('students_tenant_status_idx').on(table.tenantId, table.status),
  }),
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    trialSessionId: uuid('trial_session_id').references(() => trialSessions.id, {
      onDelete: 'set null',
    }),
    guardianName: varchar('guardian_name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 40 }).notNull(),
    studentName: varchar('student_name', { length: 120 }).notNull(),
    grade: varchar('grade', { length: 80 }).notNull(),
    status: leadStatusEnum('status').notNull().default('new'),
    source: varchar('source', { length: 80 }).notNull().default('unknown'),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    convertedStudentId: uuid('converted_student_id').references(() => students.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIdx: index('leads_tenant_status_idx').on(table.tenantId, table.status),
    tenantSourceIdx: index('leads_tenant_source_idx').on(table.tenantId, table.source),
  }),
);

export const followUpRecords = pgTable(
  'follow_up_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    leadCreatedIdx: index('follow_up_records_lead_created_idx').on(table.leadId, table.createdAt),
  }),
);

export const teachers = pgTable(
  'teachers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 40 }),
    specialties: jsonb('specialties')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('teachers_tenant_idx').on(table.tenantId),
  }),
);

export const classrooms = pgTable(
  'classrooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => campuses.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    capacity: integer('capacity').notNull().default(8),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCampusIdx: index('classrooms_tenant_campus_idx').on(table.tenantId, table.campusId),
  }),
);

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => campuses.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'restrict' }),
    classroomId: uuid('classroom_id')
      .notNull()
      .references(() => classrooms.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    capacity: integer('capacity').notNull().default(8),
    status: classStatusEnum('status').notNull().default('recruiting'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIdx: index('classes_tenant_status_idx').on(table.tenantId, table.status),
  }),
);

export const classEnrollments = pgTable(
  'class_enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    classStudentUnique: uniqueIndex('class_enrollments_class_student_idx').on(
      table.classId,
      table.studentId,
    ),
  }),
);

export const classSessions = pgTable(
  'class_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'restrict' }),
    classroomId: uuid('classroom_id')
      .notNull()
      .references(() => classrooms.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    topic: varchar('topic', { length: 200 }).notNull(),
    status: classSessionStatusEnum('status').notNull().default('scheduled'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    classroomTimeIdx: index('class_sessions_classroom_time_idx').on(
      table.tenantId,
      table.classroomId,
      table.startsAt,
    ),
    teacherTimeIdx: index('class_sessions_teacher_time_idx').on(
      table.tenantId,
      table.teacherId,
      table.startsAt,
    ),
  }),
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    classSessionId: uuid('class_session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    status: attendanceStatusEnum('status').notNull(),
    lessonDelta: integer('lesson_delta').notNull().default(0),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionStudentUnique: uniqueIndex('attendance_records_session_student_idx').on(
      table.classSessionId,
      table.studentId,
    ),
  }),
);

export const lessonAccounts = pgTable(
  'lesson_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    balance: integer('balance').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    studentCourseUnique: uniqueIndex('lesson_accounts_student_course_idx').on(
      table.studentId,
      table.courseId,
    ),
  }),
);

export const lessonTransactions = pgTable(
  'lesson_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    lessonAccountId: uuid('lesson_account_id')
      .notNull()
      .references(() => lessonAccounts.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    type: lessonTransactionTypeEnum('type').notNull(),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    relatedEntityType: varchar('related_entity_type', { length: 80 }),
    relatedEntityId: varchar('related_entity_id', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountCreatedIdx: index('lesson_transactions_account_created_idx').on(
      table.lessonAccountId,
      table.createdAt,
    ),
  }),
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    orderNo: varchar('order_no', { length: 64 }).notNull().unique(),
    amount: integer('amount').notNull(),
    paidAmount: integer('paid_amount').notNull().default(0),
    lessonCount: integer('lesson_count').notNull().default(0),
    status: orderStatusEnum('status').notNull().default('pending'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIdx: index('orders_tenant_status_idx').on(table.tenantId, table.status),
  }),
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 160 }).notNull(),
    resourceType: varchar('resource_type', { length: 80 }).notNull(),
    resourceId: varchar('resource_id', { length: 120 }),
    outcome: auditOutcomeEnum('outcome').notNull().default('succeeded'),
    summary: varchar('summary', { length: 255 }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantActionIdx: index('audit_logs_tenant_action_idx').on(table.tenantId, table.action),
  }),
);

export const studentGuardians = pgTable(
  'student_guardians',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => guardians.id, { onDelete: 'cascade' }),
    relation: varchar('relation', { length: 40 }).notNull().default('guardian'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.studentId, table.guardianId] }),
  }),
);
