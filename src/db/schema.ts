import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
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

export const accountRoleEnum = pgEnum('account_role', ['admin', 'teacher', 'parent']);
export const accountStatusEnum = pgEnum('account_status', ['active', 'suspended']);
export const courseStatusEnum = pgEnum('course_status', ['draft', 'published', 'archived']);
export const courseSeriesStatusEnum = pgEnum('course_series_status', ['active', 'archived']);
export const contentSourceEnum = pgEnum('content_source', [
  'manual',
  'wordpress',
  'notion',
  'wechat',
]);
export const contentStatusEnum = pgEnum('content_status', ['draft', 'published', 'archived']);
export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'trial_booked',
  'trial_attended',
  'paid',
  'follow_up',
  'course_delivery',
  'invalid',
]);
export const trialSessionStatusEnum = pgEnum('trial_session_status', [
  'open',
  'closed',
  'cancelled',
]);
export const seatReservationStatusEnum = pgEnum('seat_reservation_status', [
  'pending_payment',
  'reserved',
  'cancelled',
  'expired',
]);
export const seatReservationPaymentStatusEnum = pgEnum('seat_reservation_payment_status', [
  'unpaid',
  'paid',
  'refunded',
]);
export const seatReservationCheckInStatusEnum = pgEnum('seat_reservation_check_in_status', [
  'pending',
  'checked_in',
  'no_show',
]);
export const studentStatusEnum = pgEnum('student_status', ['active', 'inactive', 'archived']);
export const classStatusEnum = pgEnum('class_status', [
  'recruiting',
  'active',
  'completed',
  'paused',
  'archived',
]);
export const classSessionStatusEnum = pgEnum('class_session_status', [
  'scheduled',
  'completed',
  'cancelled',
]);
export const teachingResourceStatusEnum = pgEnum('teaching_resource_status', [
  'active',
  'archived',
]);
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'late',
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
export const paymentReceiverTypeEnum = pgEnum('payment_receiver_type', [
  'platform',
  'provider',
  'other',
]);
export const orderTypeEnum = pgEnum('order_type', [
  'package_purchase',
  'seat_reservation',
  'manual_package_grant',
]);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'paid', 'refunded', 'cancelled']);
export const orderCancelReasonEnum = pgEnum('order_cancel_reason', [
  'user_cancel',
  'system_cancel',
  'admin_invalid',
  'test_order',
  'duplicate',
  'other',
]);
export const refundRequestStatusEnum = pgEnum('refund_request_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);
export const refundReasonEnum = pgEnum('refund_reason', [
  'schedule_conflict',
  'course_not_fit',
  'duplicate_payment',
  'service_issue',
  'other',
]);
export const settlementBatchStatusEnum = pgEnum('settlement_batch_status', ['settled', 'voided']);
export const courseContractStatusEnum = pgEnum('course_contract_status', [
  'active',
  'completed',
  'cancelled',
]);
export const auditOutcomeEnum = pgEnum('audit_outcome', ['succeeded', 'failed']);

export interface TeacherPermissions {
  createClassSession?: boolean;
  createAdHocSession?: boolean;
  manageSessionRoster?: boolean;
  enrollStudents?: boolean;
  viewAllStudents?: boolean;
  setLessonUnits?: boolean;
  manageClasses?: boolean;
}

// Unified identity: a single account table + role. One login endpoint, the JWT
// carries the role. Replaces the former split `users` (admin) / `parents` tables.
// `guardians` / `students` / `teachers` stay as profile records; a parent account
// links to its guardian record via `guardianId`, a teacher account to `teacherId`.
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    role: accountRoleEnum('role').notNull(),
    // Either email or phone (or both) can identify an account at login; both are
    // optional individually but at least one must be present (enforced in code).
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 40 }),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    status: accountStatusEnum('status').notNull().default('active'),
    // Set when an account is provisioned with a default password (e.g. a parent
    // created on checkout with phone-suffix password); forces a change on first login.
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    guardianId: uuid('guardian_id').references(() => guardians.id, { onDelete: 'set null' }),
    teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Partial unique indexes: email / phone are unique only among rows that have them.
    emailUnique: uniqueIndex('accounts_email_idx')
      .on(table.email)
      .where(sql`${table.email} is not null`),
    phoneUnique: uniqueIndex('accounts_phone_idx')
      .on(table.phone)
      .where(sql`${table.phone} is not null`),
    roleIdx: index('accounts_role_idx').on(table.role),
  }),
);

export const accountRoleAssignments = pgTable(
  'account_role_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    role: accountRoleEnum('role').notNull(),
    guardianId: uuid('guardian_id').references(() => guardians.id, { onDelete: 'set null' }),
    teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    teacherPermissions: jsonb('teacher_permissions')
      .$type<TeacherPermissions>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: accountStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountRoleUnique: uniqueIndex('account_role_assignments_account_role_idx').on(
      table.accountId,
      table.role,
    ),
    accountIdx: index('account_role_assignments_account_idx').on(table.accountId),
    roleIdx: index('account_role_assignments_role_idx').on(table.role),
    guardianIdx: index('account_role_assignments_guardian_idx').on(table.guardianId),
    teacherIdx: index('account_role_assignments_teacher_idx').on(table.teacherId),
  }),
);

// Single-institution deployment: this table holds exactly one row describing the
// organization that owns the deployment (its identity + brand/profile settings).
// There is no multi-tenancy — read it with LIMIT 1.
export const organization = pgTable('organization', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  brandName: varchar('brand_name', { length: 160 }).notNull(),
  phone: varchar('phone', { length: 40 }),
  address: varchar('address', { length: 255 }),
  // publicProfile + branding (VI theme) live here as JSON.
  settings: jsonb('settings')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const campuses = pgTable('campuses', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  address: varchar('address', { length: 255 }),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  environmentImageUrls: jsonb('environment_image_urls')
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contentItems = pgTable(
  'content_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    title: varchar('title', { length: 200 }).notNull(),
    excerpt: text('excerpt'),
    content: text('content').notNull().default(''),
    coverUrl: varchar('cover_url', { length: 500 }),
    coverThumbUrl: varchar('cover_thumb_url', { length: 500 }),
    authorName: varchar('author_name', { length: 120 }),
    sourceType: contentSourceEnum('source_type').notNull().default('manual'),
    sourceId: varchar('source_id', { length: 255 }),
    sourceUrl: varchar('source_url', { length: 2048 }),
    status: contentStatusEnum('status').notNull().default('draft'),
    isPinned: boolean('is_pinned').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceTypeSourceIdIdx: index('content_items_source_type_source_id_idx').on(
      table.sourceType,
      table.sourceId,
    ),
    statusPublishedAtIdx: index('content_items_status_published_at_idx').on(
      table.status,
      table.publishedAt,
    ),
    sourceUrlIdx: index('content_items_source_url_idx').on(table.sourceUrl),
  }),
);

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 80 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex('channels_code_idx').on(table.code),
  }),
);

export const campaignStatusEnum = pgEnum('campaign_status', ['active', 'paused', 'archived']);

// A campaign is a concrete acquisition push under a channel: a poster, a flyer,
// a WeChat-group drop. Each carries a QR code that lands on the public web with
// ?source=<channel.code>&campaign=<campaign.code>&course=<courseSlug>.
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 80 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    courseSlug: varchar('course_slug', { length: 120 }),
    medium: varchar('medium', { length: 40 }).notNull().default('qr_code'),
    status: campaignStatusEnum('status').notNull().default('active'),
    content: text('content').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex('campaigns_code_idx').on(table.code),
    channelIdx: index('campaigns_channel_idx').on(table.channelId),
  }),
);

export const courseSeries = pgTable(
  'course_series',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 120 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description').notNull().default(''),
    status: courseSeriesStatusEnum('status').notNull().default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('course_series_slug_idx').on(table.slug),
    statusIdx: index('course_series_status_idx').on(table.status),
  }),
);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseSeriesId: uuid('course_series_id').references(() => courseSeries.id, {
      onDelete: 'set null',
    }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    slug: varchar('slug', { length: 120 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    category: varchar('category', { length: 80 }).notNull(),
    ageRange: varchar('age_range', { length: 120 }).notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(60),
    providerInstitutionId: uuid('provider_institution_id').references(() => institutions.id, {
      onDelete: 'set null',
    }),
    defaultTeacherId: uuid('default_teacher_id').references(() => teachers.id, {
      onDelete: 'set null',
    }),
    defaultTeacherIds: jsonb('default_teacher_ids').$type<string[]>().notNull().default([]),
    classroomId: uuid('classroom_id').references(() => classrooms.id, { onDelete: 'set null' }),
    classroomIds: jsonb('classroom_ids').$type<string[]>().notNull().default([]),
    teachingLocationLabel: varchar('teaching_location_label', { length: 200 }),
    paymentReceiverType: paymentReceiverTypeEnum('payment_receiver_type')
      .notNull()
      .default('platform'),
    paymentReceiverInstitutionId: uuid('payment_receiver_institution_id').references(
      () => institutions.id,
      { onDelete: 'set null' },
    ),
    paymentReceiverName: varchar('payment_receiver_name', { length: 160 }),
    trialDescription: text('trial_description').notNull().default(''),
    reservationNotice: text('reservation_notice').notNull().default(''),
    coverImageUrl: varchar('cover_image_url', { length: 500 }),
    coverThumbUrl: varchar('cover_thumb_url', { length: 500 }),
    onlineSalesEnabled: boolean('online_sales_enabled').notNull().default(true),
    summary: text('summary').notNull().default(''),
    content: text('content').notNull().default(''),
    status: courseStatusEnum('status').notNull().default('draft'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('courses_slug_idx').on(table.slug),
    statusIdx: index('courses_status_idx').on(table.status),
    providerSortIdx: index('courses_provider_sort_idx').on(
      table.providerInstitutionId,
      table.sortOrder,
    ),
  }),
);

export const trialSessions = pgTable(
  'trial_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => campuses.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    sessionMode: varchar('session_mode', { length: 40 }).notNull().default('public_event'),
    title: varchar('title', { length: 160 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    capacity: integer('capacity').notNull().default(8),
    bookedCount: integer('booked_count').notNull().default(0),
    reservationFeeAmount: integer('reservation_fee_amount').notNull().default(0),
    reservationNotice: text('reservation_notice').notNull().default(''),
    coverImageUrl: varchar('cover_image_url', { length: 500 }),
    coverThumbUrl: varchar('cover_thumb_url', { length: 500 }),
    status: trialSessionStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    startsIdx: index('trial_sessions_starts_idx').on(table.startsAt),
    teacherStartsIdx: index('trial_sessions_teacher_starts_idx').on(
      table.teacherId,
      table.startsAt,
    ),
  }),
);

export const guardians = pgTable(
  'guardians',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 40 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    phoneIdx: index('guardians_phone_idx').on(table.phone),
  }),
);

export const students = pgTable(
  'students',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    guardianId: uuid('guardian_id').references(() => guardians.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 120 }).notNull(),
    grade: varchar('grade', { length: 80 }).notNull(),
    school: varchar('school', { length: 160 }),
    status: studentStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('students_status_idx').on(table.status),
  }),
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    trialSessionId: uuid('trial_session_id').references(() => trialSessions.id, {
      onDelete: 'set null',
    }),
    preferredTeacherId: uuid('preferred_teacher_id').references(() => teachers.id, {
      onDelete: 'set null',
    }),
    guardianName: varchar('guardian_name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 40 }).notNull(),
    studentName: varchar('student_name', { length: 120 }).notNull(),
    grade: varchar('grade', { length: 80 }).notNull(),
    status: leadStatusEnum('status').notNull().default('new'),
    source: varchar('source', { length: 80 }).notNull().default('unknown'),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    medium: varchar('medium', { length: 40 }),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    convertedStudentId: uuid('converted_student_id').references(() => students.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('leads_status_idx').on(table.status),
    sourceIdx: index('leads_source_idx').on(table.source),
    channelIdx: index('leads_channel_idx').on(table.channelId),
  }),
);

export const followUpRecords = pgTable(
  'follow_up_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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

// Teaching institutions a teacher can be affiliated with. Distinct from the
// `organization` singleton (the site owner / brand): this is a list teachers
// are grouped by on the public site (tabs) and in the back office.
export const institutions = pgTable(
  'institutions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 160 }).notNull(),
    logoUrl: varchar('logo_url', { length: 500 }),
    intro: text('intro').notNull().default(''),
    qualificationItems: jsonb('qualification_items')
      .notNull()
      .default(sql`'[]'::jsonb`),
    outcomeItems: jsonb('outcome_items')
      .notNull()
      .default(sql`'[]'::jsonb`),
    contact: varchar('contact', { length: 200 }),
    sortOrder: integer('sort_order').notNull().default(0),
    status: teachingResourceStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('institutions_status_idx').on(table.status),
    sortIdx: index('institutions_sort_idx').on(table.sortOrder),
  }),
);

export const teachers = pgTable(
  'teachers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 40 }),
    title: varchar('title', { length: 120 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    // Affiliated institution (nullable); detaches to null if the institution is
    // deleted so the teacher record survives.
    institutionId: uuid('institution_id').references(() => institutions.id, {
      onDelete: 'set null',
    }),
    tagline: varchar('tagline', { length: 200 }),
    wechatQrUrl: varchar('wechat_qr_url', { length: 500 }),
    education: text('education').notNull().default(''),
    teachingExperience: text('teaching_experience').notNull().default(''),
    teachingStyle: text('teaching_style').notNull().default(''),
    achievements: text('achievements').notNull().default(''),
    teachingYears: varchar('teaching_years', { length: 40 }),
    studentCount: varchar('student_count', { length: 40 }),
    retentionRate: varchar('retention_rate', { length: 40 }),
    teachingPhilosophy: text('teaching_philosophy').notNull().default(''),
    classPhotoUrls: jsonb('class_photo_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    studentWorkUrls: jsonb('student_work_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    parentTestimonials: jsonb('parent_testimonials')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    bio: text('bio').notNull().default(''),
    specialties: jsonb('specialties')
      .notNull()
      .default(sql`'[]'::jsonb`),
    isPinned: boolean('is_pinned').notNull().default(false),
    isTrialConsultant: boolean('is_trial_consultant').notNull().default(false),
    status: teachingResourceStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('teachers_status_idx').on(table.status),
    institutionIdx: index('teachers_institution_idx').on(table.institutionId),
    trialConsultantUnique: uniqueIndex('teachers_trial_consultant_unique_idx')
      .on(table.institutionId)
      .where(sql`${table.isTrialConsultant} = true AND ${table.institutionId} IS NOT NULL`),
  }),
);

export const classrooms = pgTable(
  'classrooms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => campuses.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    capacity: integer('capacity').notNull().default(8),
    status: teachingResourceStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    campusIdx: index('classrooms_campus_idx').on(table.campusId),
    statusIdx: index('classrooms_status_idx').on(table.status),
  }),
);

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
    statusIdx: index('classes_status_idx').on(table.status),
  }),
);

export const classCourseAssociations = pgTable(
  'class_course_associations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    source: varchar('source', { length: 40 }).notNull().default('enrollment'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    classCourseUnique: uniqueIndex('class_course_associations_class_course_idx').on(
      table.classId,
      table.courseId,
    ),
    classIdx: index('class_course_associations_class_idx').on(table.classId),
    courseIdx: index('class_course_associations_course_idx').on(table.courseId),
  }),
);

export const classEnrollments = pgTable(
  'class_enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    billingCourseId: uuid('billing_course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    active: boolean('active').notNull().default(true),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    classStudentUnique: uniqueIndex('class_enrollments_class_student_idx').on(
      table.classId,
      table.studentId,
    ),
    billingCourseIdx: index('class_enrollments_billing_course_idx').on(table.billingCourseId),
    joinedAtIdx: index('class_enrollments_joined_at_idx').on(table.classId, table.joinedAt),
  }),
);

export const classSessions = pgTable(
  'class_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'restrict' }),
    classroomId: uuid('classroom_id')
      .notNull()
      .references(() => classrooms.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    topic: varchar('topic', { length: 200 }).notNull(),
    sessionType: varchar('session_type', { length: 40 }).notNull().default('class'),
    lessonUnits: integer('lesson_units').notNull().default(1),
    status: classSessionStatusEnum('status').notNull().default('scheduled'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    classroomTimeIdx: index('class_sessions_classroom_time_idx').on(
      table.classroomId,
      table.startsAt,
    ),
    teacherTimeIdx: index('class_sessions_teacher_time_idx').on(table.teacherId, table.startsAt),
  }),
);

export const classSessionStudents = pgTable(
  'class_session_students',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classSessionId: uuid('class_session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    billingCourseId: uuid('billing_course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    source: varchar('source', { length: 40 }).notNull().default('session_only'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionStudentUnique: uniqueIndex('class_session_students_session_student_idx').on(
      table.classSessionId,
      table.studentId,
    ),
    sessionIdx: index('class_session_students_session_idx').on(table.classSessionId),
    studentIdx: index('class_session_students_student_idx').on(table.studentId),
  }),
);

export const classSessionTeachers = pgTable(
  'class_session_teachers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classSessionId: uuid('class_session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'restrict' }),
    role: varchar('role', { length: 40 }).notNull().default('assistant'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionTeacherUnique: uniqueIndex('class_session_teachers_session_teacher_idx').on(
      table.classSessionId,
      table.teacherId,
    ),
    sessionIdx: index('class_session_teachers_session_idx').on(table.classSessionId),
    teacherIdx: index('class_session_teachers_teacher_idx').on(table.teacherId),
  }),
);

export const classSessionTemporaryStudents = pgTable(
  'class_session_temporary_students',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classSessionId: uuid('class_session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    billingCourseId: uuid('billing_course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionStudentUnique: uniqueIndex('class_session_temporary_students_session_student_idx').on(
      table.classSessionId,
      table.studentId,
    ),
    sessionIdx: index('class_session_temporary_students_session_idx').on(table.classSessionId),
    studentIdx: index('class_session_temporary_students_student_idx').on(table.studentId),
    billingCourseIdx: index('class_session_temporary_students_billing_course_idx').on(
      table.billingCourseId,
    ),
  }),
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classSessionId: uuid('class_session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    courseContractId: uuid('course_contract_id').references(() => courseContracts.id, {
      onDelete: 'set null',
    }),
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
    courseContractIdx: index('attendance_records_course_contract_idx').on(table.courseContractId),
  }),
);

export const homeworkCheckIns = pgTable(
  'homework_checkins',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    classSessionId: uuid('class_session_id').references(() => classSessions.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 160 }).notNull().default('作业打卡'),
    content: text('content').notNull().default(''),
    imageUrls: jsonb('image_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    reviewStatus: varchar('review_status', { length: 40 }).notNull().default('submitted'),
    teacherFeedback: text('teacher_feedback').notNull().default(''),
    rating: integer('rating').notNull().default(0),
    reviewedByTeacherId: uuid('reviewed_by_teacher_id').references(() => teachers.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    studentIdx: index('homework_checkins_student_idx').on(table.studentId, table.createdAt),
    courseIdx: index('homework_checkins_course_idx').on(table.courseId, table.createdAt),
    sessionIdx: index('homework_checkins_session_idx').on(table.classSessionId),
  }),
);

export const lessonFeedbacks = pgTable(
  'lesson_feedbacks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classSessionId: uuid('class_session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    content: text('content').notNull().default(''),
    rating: integer('rating').notNull().default(0),
    imageUrls: jsonb('image_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionStudentUnique: uniqueIndex('lesson_feedbacks_session_student_idx').on(
      table.classSessionId,
      table.studentId,
    ),
    studentIdx: index('lesson_feedbacks_student_idx').on(table.studentId, table.createdAt),
    teacherIdx: index('lesson_feedbacks_teacher_idx').on(table.teacherId, table.createdAt),
    sessionIdx: index('lesson_feedbacks_session_idx').on(table.classSessionId),
  }),
);

export const homeworkAssignments = pgTable(
  'homework_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classSessionId: uuid('class_session_id')
      .notNull()
      .references(() => classSessions.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    content: text('content').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionStudentUnique: uniqueIndex('homework_assignments_session_student_idx').on(
      table.classSessionId,
      table.studentId,
    ),
    sessionClassUnique: uniqueIndex('homework_assignments_session_class_idx')
      .on(table.classSessionId)
      .where(sql`${table.studentId} is null`),
    studentIdx: index('homework_assignments_student_idx').on(table.studentId, table.createdAt),
    classIdx: index('homework_assignments_class_idx').on(table.classId, table.createdAt),
    sessionIdx: index('homework_assignments_session_idx').on(table.classSessionId),
  }),
);

export const studentWorks = pgTable(
  'student_works',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    classSessionId: uuid('class_session_id').references(() => classSessions.id, {
      onDelete: 'set null',
    }),
    teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 160 }).notNull().default('作品展示'),
    description: text('description').notNull().default(''),
    imageUrls: jsonb('image_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    frameStyle: varchar('frame_style', { length: 40 }).notNull().default('classic'),
    source: varchar('source', { length: 40 }).notNull().default('parent'),
    status: varchar('status', { length: 40 }).notNull().default('published'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    studentIdx: index('student_works_student_idx').on(table.studentId, table.createdAt),
    courseIdx: index('student_works_course_idx').on(table.courseId, table.createdAt),
    classIdx: index('student_works_class_idx').on(table.classId, table.createdAt),
    sessionIdx: index('student_works_session_idx').on(table.classSessionId),
    teacherIdx: index('student_works_teacher_idx').on(table.teacherId, table.createdAt),
  }),
);

export const lessonAccounts = pgTable(
  'lesson_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
    lessonAccountId: uuid('lesson_account_id')
      .notNull()
      .references(() => lessonAccounts.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    courseContractId: uuid('course_contract_id').references(() => courseContracts.id, {
      onDelete: 'set null',
    }),
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
    courseContractIdx: index('lesson_transactions_course_contract_idx').on(table.courseContractId),
  }),
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'restrict' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'restrict' }),
    courseSeriesId: uuid('course_series_id').references(() => courseSeries.id, {
      onDelete: 'set null',
    }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    packageId: uuid('package_id').references(() => coursePackages.id, { onDelete: 'set null' }),
    orderNo: varchar('order_no', { length: 64 }).notNull().unique(),
    orderType: orderTypeEnum('order_type').notNull().default('package_purchase'),
    amount: integer('amount').notNull(),
    paidAmount: integer('paid_amount').notNull().default(0),
    lessonCount: integer('lesson_count').notNull().default(0),
    currency: varchar('currency', { length: 8 }).notNull().default('CNY'),
    paymentProvider: varchar('payment_provider', { length: 40 }),
    providerOrderId: varchar('provider_order_id', { length: 120 }),
    paymentReceiverType: paymentReceiverTypeEnum('payment_receiver_type')
      .notNull()
      .default('platform'),
    paymentReceiverInstitutionId: uuid('payment_receiver_institution_id').references(
      () => institutions.id,
      { onDelete: 'set null' },
    ),
    paymentReceiverName: varchar('payment_receiver_name', { length: 160 }),
    paymentMethod: varchar('payment_method', { length: 40 }),
    offlinePaymentNote: text('offline_payment_note'),
    status: orderStatusEnum('status').notNull().default('pending'),
    cancelReason: orderCancelReasonEnum('cancel_reason'),
    cancelledByAdminId: uuid('cancelled_by_admin_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    source: varchar('source', { length: 80 }).notNull().default('unknown'),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    medium: varchar('medium', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('orders_status_idx').on(table.status),
    accountIdx: index('orders_account_idx').on(table.accountId),
    courseSeriesIdx: index('orders_course_series_idx').on(table.courseSeriesId),
    channelIdx: index('orders_channel_idx').on(table.channelId),
    campaignIdx: index('orders_campaign_idx').on(table.campaignId),
  }),
);

export const courseContracts = pgTable(
  'course_contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    packageId: uuid('package_id').references(() => coursePackages.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    contractNo: varchar('contract_no', { length: 64 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    lessonCount: integer('lesson_count').notNull(),
    remainingLessonCount: integer('remaining_lesson_count').notNull().default(0),
    paidAmount: integer('paid_amount').notNull().default(0),
    paymentMethod: varchar('payment_method', { length: 40 }),
    paymentReceiverType: paymentReceiverTypeEnum('payment_receiver_type')
      .notNull()
      .default('platform'),
    paymentReceiverInstitutionId: uuid('payment_receiver_institution_id').references(
      () => institutions.id,
      { onDelete: 'set null' },
    ),
    paymentReceiverName: varchar('payment_receiver_name', { length: 160 }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    status: courseContractStatusEnum('status').notNull().default('active'),
    note: text('note'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    contractNoUnique: uniqueIndex('course_contracts_contract_no_idx').on(table.contractNo),
    studentIdx: index('course_contracts_student_idx').on(table.studentId),
    courseIdx: index('course_contracts_course_idx').on(table.courseId),
    classIdx: index('course_contracts_class_idx').on(table.classId),
    orderIdx: index('course_contracts_order_idx').on(table.orderId),
    statusIdx: index('course_contracts_status_idx').on(table.status),
  }),
);

export const courseContractPaymentRecords = pgTable(
  'course_contract_payment_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseContractId: uuid('course_contract_id')
      .notNull()
      .references(() => courseContracts.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    paidAmount: integer('paid_amount').notNull(),
    paymentMethod: varchar('payment_method', { length: 40 }),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    note: text('note'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    contractIdx: index('course_contract_payment_records_contract_idx').on(table.courseContractId),
    orderIdx: index('course_contract_payment_records_order_idx').on(table.orderId),
  }),
);

export const courseContractGifts = pgTable(
  'course_contract_gifts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseContractId: uuid('course_contract_id')
      .notNull()
      .references(() => courseContracts.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 200 }).notNull(),
    lessonCount: integer('lesson_count').notNull(),
    reason: varchar('reason', { length: 80 }).notNull().default('other'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    status: courseContractStatusEnum('status').notNull().default('active'),
    note: text('note'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    contractIdx: index('course_contract_gifts_contract_idx').on(table.courseContractId),
    studentCourseIdx: index('course_contract_gifts_student_course_idx').on(
      table.studentId,
      table.courseId,
    ),
    classIdx: index('course_contract_gifts_class_idx').on(table.classId),
    statusIdx: index('course_contract_gifts_status_idx').on(table.status),
  }),
);

export const seatReservations = pgTable(
  'seat_reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    orderNo: varchar('order_no', { length: 64 }).notNull(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    trialSessionId: uuid('trial_session_id').references(() => trialSessions.id, {
      onDelete: 'set null',
    }),
    originalTrialSessionId: uuid('original_trial_session_id').references(() => trialSessions.id, {
      onDelete: 'set null',
    }),
    guardianName: varchar('guardian_name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 40 }).notNull(),
    studentName: varchar('student_name', { length: 120 }).notNull(),
    grade: varchar('grade', { length: 80 }).notNull(),
    reservationFeeAmount: integer('reservation_fee_amount').notNull().default(0),
    reservationStatus: seatReservationStatusEnum('reservation_status')
      .notNull()
      .default('pending_payment'),
    paymentStatus: seatReservationPaymentStatusEnum('payment_status').notNull().default('unpaid'),
    checkInStatus: seatReservationCheckInStatusEnum('check_in_status').notNull().default('pending'),
    rescheduleCount: integer('reschedule_count').notNull().default(0),
    cancelBefore: timestamp('cancel_before', { withTimezone: true }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    rescheduledAt: timestamp('rescheduled_at', { withTimezone: true }),
    source: varchar('source', { length: 80 }).notNull().default('unknown'),
    channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    medium: varchar('medium', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderNoIdx: index('seat_reservations_order_no_idx').on(table.orderNo),
    trialSessionIdx: index('seat_reservations_trial_session_idx').on(table.trialSessionId),
    phoneIdx: index('seat_reservations_phone_idx').on(table.phone),
  }),
);

export const settlementBatches = pgTable(
  'settlement_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentReceiverType: paymentReceiverTypeEnum('payment_receiver_type')
      .notNull()
      .default('platform'),
    paymentReceiverInstitutionId: uuid('payment_receiver_institution_id').references(
      () => institutions.id,
      { onDelete: 'set null' },
    ),
    paymentReceiverName: varchar('payment_receiver_name', { length: 160 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    orderCount: integer('order_count').notNull().default(0),
    totalAmount: integer('total_amount').notNull().default(0),
    status: settlementBatchStatusEnum('status').notNull().default('settled'),
    note: text('note'),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    settledAt: timestamp('settled_at', { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    receiverIdx: index('settlement_batches_receiver_idx').on(
      table.paymentReceiverType,
      table.paymentReceiverInstitutionId,
      table.paymentReceiverName,
    ),
    statusIdx: index('settlement_batches_status_idx').on(table.status),
    settledAtIdx: index('settlement_batches_settled_at_idx').on(table.settledAt),
  }),
);

export const settlementBatchOrders = pgTable(
  'settlement_batch_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    settlementBatchId: uuid('settlement_batch_id')
      .notNull()
      .references(() => settlementBatches.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    amount: integer('amount').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    batchIdx: index('settlement_batch_orders_batch_idx').on(table.settlementBatchId),
    orderIdx: index('settlement_batch_orders_order_idx').on(table.orderId),
  }),
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorAccountId: uuid('actor_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
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
    actionIdx: index('audit_logs_action_idx').on(table.action),
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

export const guardianOnboardingInvitations = pgTable(
  'guardian_onboarding_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').references(() => institutions.id, {
      onDelete: 'set null',
    }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('guardian_onboarding_invitations_token_hash_idx').on(
      table.tokenHash,
    ),
    studentIdx: index('guardian_onboarding_invitations_student_idx').on(
      table.studentId,
      table.createdAt,
    ),
    expiresIdx: index('guardian_onboarding_invitations_expires_idx').on(table.expiresAt),
  }),
);

// --- Infrastructure tables (settings, notifications) ---

export const notificationRecipientEnum = pgEnum('notification_recipient', ['staff', 'parent']);
export const notificationStatusEnum = pgEnum('notification_status', ['unread', 'read', 'archived']);
export const notificationLevelEnum = pgEnum('notification_level', [
  'info',
  'success',
  'warning',
  'error',
]);

export const settings = pgTable('settings', {
  key: varchar('key', { length: 120 }).primaryKey(),
  value: jsonb('value')
    .notNull()
    .default(sql`'{}'::jsonb`),
  isEncrypted: boolean('is_encrypted').notNull().default(false),
  updatedBy: varchar('updated_by', { length: 120 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    recipientType: notificationRecipientEnum('recipient_type').notNull(),
    recipientId: uuid('recipient_id').notNull(),
    category: varchar('category', { length: 80 }).notNull(),
    level: notificationLevelEnum('level').notNull().default('info'),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull().default(''),
    ctaLabel: varchar('cta_label', { length: 120 }),
    ctaUrl: varchar('cta_url', { length: 255 }),
    sourceEventName: varchar('source_event_name', { length: 120 }),
    dedupeKey: varchar('dedupe_key', { length: 200 }).notNull().unique(),
    status: notificationStatusEnum('status').notNull().default('unread'),
    meta: jsonb('meta')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recipientIdx: index('notifications_recipient_idx').on(
      table.recipientType,
      table.recipientId,
      table.status,
    ),
  }),
);

// --- Account security codes (email verify / password reset) ---

export const accountSecurityPurposeEnum = pgEnum('account_security_purpose', [
  'email_verify',
  'password_reset',
]);

export const accountSecurityCodes = pgTable(
  'account_security_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    purpose: accountSecurityPurposeEnum('purpose').notNull(),
    codeHash: varchar('code_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    accountPurposeIdx: index('account_security_codes_account_purpose_idx').on(
      table.accountId,
      table.purpose,
      table.createdAt,
    ),
  }),
);

export const accountWechatIdentities = pgTable(
  'account_wechat_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    appId: varchar('app_id', { length: 80 }).notNull(),
    openid: varchar('openid', { length: 128 }).notNull(),
    unionid: varchar('unionid', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    appOpenidUnique: uniqueIndex('account_wechat_identities_app_openid_idx').on(
      table.appId,
      table.openid,
    ),
    accountAppUnique: uniqueIndex('account_wechat_identities_account_app_idx').on(
      table.accountId,
      table.appId,
    ),
  }),
);

// --- Course packages (课时包) + payments ---

export const coursePackageStatusEnum = pgEnum('course_package_status', ['active', 'archived']);

export const coursePackages = pgTable(
  'course_packages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    courseSeriesId: uuid('course_series_id').references(() => courseSeries.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description').notNull().default(''),
    billingType: varchar('billing_type', { length: 20 }).notNull().default('lesson'),
    periodUnit: varchar('period_unit', { length: 20 }),
    periodCount: integer('period_count').notNull().default(1),
    lessonCount: integer('lesson_count').notNull(),
    giftedLessonCount: integer('gifted_lesson_count').notNull().default(0),
    priceAmount: integer('price_amount').notNull(),
    discountPriceAmount: integer('discount_price_amount'),
    status: coursePackageStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('course_packages_status_idx').on(table.status),
    courseIdx: index('course_packages_course_idx').on(table.courseId),
    courseSeriesIdx: index('course_packages_course_series_idx').on(table.courseSeriesId),
  }),
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderNo: varchar('order_no', { length: 64 }).notNull(),
    provider: varchar('provider', { length: 40 }).notNull(),
    providerOrderId: varchar('provider_order_id', { length: 120 }),
    providerEventId: varchar('provider_event_id', { length: 160 }).notNull().unique(),
    amount: integer('amount').notNull(),
    status: varchar('status', { length: 40 }).notNull(),
    raw: jsonb('raw')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderNoIdx: index('payments_order_no_idx').on(table.orderNo),
  }),
);

export const refundRequests = pgTable(
  'refund_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    orderNo: varchar('order_no', { length: 64 }).notNull(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    amount: integer('amount').notNull(),
    reason: refundReasonEnum('reason').notNull(),
    status: refundRequestStatusEnum('status').notNull().default('pending'),
    buyerNote: text('buyer_note'),
    adminNote: text('admin_note'),
    decidedByAccountId: uuid('decided_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index('refund_requests_order_idx').on(table.orderId),
    orderNoIdx: index('refund_requests_order_no_idx').on(table.orderNo),
    accountIdx: index('refund_requests_account_idx').on(table.accountId),
    statusIdx: index('refund_requests_status_idx').on(table.status),
    openOrderUnique: uniqueIndex('refund_requests_open_order_idx')
      .on(table.orderId)
      .where(sql`${table.status} = 'pending'`),
  }),
);
