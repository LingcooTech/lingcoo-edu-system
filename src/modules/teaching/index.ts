import { z } from 'zod';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import * as accountsRepo from '../../db/repositories/accounts.js';
import * as attendanceRepo from '../../db/repositories/attendance.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as courseContractsRepo from '../../db/repositories/course-contracts.js';
import * as crmRepo from '../../db/repositories/crm.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as trialRepo from '../../db/repositories/trial.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as schema from '../../db/schema.js';
import { readBusinessModel } from '../../lib/business-model.js';
import { hashPassword, defaultPasswordFromPhone } from '../../lib/password.js';
import { resolvePaymentReceiverName } from '../../lib/payment-receiver.js';
import { QiniuSettingsService } from '../../lib/qiniu-settings.js';
import { requireTeacherPermission, resolveTeacherAccess } from '../../lib/teacher-permissions.js';
import { LearningNotificationService } from '../notifications/learning-notification-service.js';
import { LessonNotificationService } from '../notifications/lesson-notification-service.js';
import { NotificationsService } from '../notifications/service.js';
import type { AppModule } from '../types.js';

const teacherSchema = z.object({
  name: z.string().min(1),
  phone: z.string().default(''),
  title: z.string().max(120).optional(),
  avatarUrl: z.string().max(500).optional(),
  institutionId: z.string().uuid().nullable().optional(),
  tagline: z.string().max(200).optional(),
  wechatQrUrl: z.string().max(500).optional(),
  education: z.string().default(''),
  teachingExperience: z.string().default(''),
  teachingStyle: z.string().default(''),
  achievements: z.string().default(''),
  teachingYears: z.string().max(40).optional(),
  studentCount: z.string().max(40).optional(),
  retentionRate: z.string().max(40).optional(),
  practiceDuration: z.string().max(40).optional(),
  teachingPhilosophy: z.string().default(''),
  classPhotoUrls: z.array(z.string().min(1).max(500)).max(24).default([]),
  studentWorkUrls: z.array(z.string().min(1).max(500)).max(24).default([]),
  parentTestimonials: z.array(z.string().min(1).max(240)).max(12).default([]),
  bio: z.string().default(''),
  specialties: z.array(z.string()).default([]),
  isPinned: z.boolean().default(false),
  status: z.enum(['active', 'archived']).default('active'),
});

const teacherUpdateSchema = teacherSchema.partial();

const teacherSelfProfileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    title: z.string().trim().max(120).optional(),
    avatarUrl: z.string().trim().max(500).optional(),
    tagline: z.string().trim().max(200).optional(),
    education: z.string().trim().max(2000).optional(),
    teachingExperience: z.string().trim().max(4000).optional(),
    teachingStyle: z.string().trim().max(4000).optional(),
    achievements: z.string().trim().max(4000).optional(),
    teachingYears: z.string().trim().max(40).optional(),
    studentCount: z.string().trim().max(40).optional(),
    practiceDuration: z.string().trim().max(40).optional(),
    teachingPhilosophy: z.string().trim().max(4000).optional(),
    bio: z.string().trim().max(4000).optional(),
    specialties: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied' });

type TeacherRow = typeof schema.teachers.$inferSelect;

function normalizeTeacherBody<T extends { practiceDuration?: string; retentionRate?: string }>(
  body: T,
): Omit<T, 'practiceDuration'> {
  const { practiceDuration, ...rest } = body;
  return {
    ...rest,
    retentionRate: practiceDuration ?? body.retentionRate,
  } as Omit<T, 'practiceDuration'>;
}

function toTeacherDto<T extends TeacherRow>(teacher: T) {
  return {
    ...teacher,
    practiceDuration: teacher.retentionRate,
  };
}

const institutionImageCaptionSchema = z.object({
  imageUrl: z.string().trim().max(500).default(''),
  caption: z.string().trim().max(200).default(''),
});

const institutionSchema = z.object({
  name: z.string().min(1).max(160),
  logoUrl: z.string().max(500).optional(),
  intro: z.string().default(''),
  qualificationItems: z.array(institutionImageCaptionSchema).max(20).default([]),
  outcomeItems: z.array(institutionImageCaptionSchema).max(20).default([]),
  contact: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  status: z.enum(['active', 'archived']).default('active'),
});

const institutionUpdateSchema = institutionSchema.partial();

const institutionOrderSchema = z.object({
  ids: z.array(z.string().uuid()).default([]),
});

const classroomSchema = z.object({
  campusId: z.string(),
  name: z.string().min(1),
  capacity: z.number().int().positive().default(8),
  status: z.enum(['active', 'archived']).default('active'),
});

const classroomUpdateSchema = classroomSchema.partial();

const teacherAttendanceSchema = z.object({
  records: z.array(
    z.object({
      studentId: z.string(),
      status: z.enum(['present', 'late', 'leave', 'absent', 'makeup', 'trial']),
      note: z.string().optional(),
      deductLesson: z.boolean().optional(),
    }),
  ),
});
const teacherCalendarQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const teacherTrialSessionSchema = z.object({
  campusId: z.string().uuid(),
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

const teacherTrialLeadScheduleSchema = teacherTrialSessionSchema;

const teacherNotificationQuerySchema = z.object({
  status: z.enum(['unread', 'read', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const teacherClassOptionsQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
});

const teacherEnrollmentSchema = z.object({
  classId: z.string().uuid(),
  billingCourseId: z.string().uuid().optional(),
  notificationId: z.string().uuid().optional(),
});

const teacherStudentSearchSchema = z.object({
  search: z.string().trim().max(80).default(''),
  courseId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const teacherStudentCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  grade: z.string().trim().min(1).max(80),
  school: z.string().trim().max(160).optional(),
  guardianName: z.string().trim().max(120).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
});

const teacherCourseContractCreateSchema = z.object({
  studentId: z.string().uuid(),
  courseId: z.string().uuid(),
  classId: z.string().uuid().nullable().optional(),
  packageId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  lessonCount: z.number().int().positive(),
  paidAmount: z.number().int().nonnegative().default(0),
  paymentMethod: z
    .enum(['cash', 'bank_transfer', 'wechat_offline', 'alipay_offline', 'offline_other'])
    .default('wechat_offline'),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

const teacherSessionStudentSchema = z.object({
  studentId: z.string().uuid(),
  enrollmentMode: z.enum(['class', 'session_only']).default('session_only'),
  billingCourseId: z.string().uuid().optional(),
});

const teacherSessionCreateSchema = z.object({
  classId: z.string().uuid().nullable().optional(),
  courseId: z.string().uuid(),
  classroomId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  topic: z.string().trim().min(1).max(200),
  lessonUnits: z.number().int().min(0).max(10).default(1),
  students: z.array(teacherSessionStudentSchema).min(1).max(100),
});

const teacherSessionUpdateSchema = z.object({
  classroomId: z.string().uuid().optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  topic: z.string().trim().min(1).max(200).optional(),
  lessonUnits: z.number().int().min(0).max(10).optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
});

const teacherClassCreateSchema = z.object({
  courseId: z.string().uuid(),
  classroomId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  capacity: z.number().int().min(1).max(100).default(8),
  status: z.enum(['recruiting', 'active']).default('recruiting'),
  studentIds: z.array(z.string().uuid()).max(100).default([]),
});

const teacherClassUpdateSchema = z
  .object({
    classroomId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(160).optional(),
    capacity: z.number().int().min(1).max(100).optional(),
    status: z.enum(['recruiting', 'active', 'paused', 'completed']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied' });

const teacherClassStudentSchema = z.object({
  studentId: z.string().uuid(),
  billingCourseId: z.string().uuid().optional(),
  joinedAt: z.string().datetime({ offset: true }).optional(),
});

const teacherClassStudentEffectiveTimeSchema = z.object({
  joinedAt: z.string().datetime({ offset: true }),
});

function overlapsRange(session: { startsAt: Date; endsAt: Date }, from?: Date, to?: Date) {
  if (from && session.endsAt < from) return false;
  if (to && session.startsAt > to) return false;
  return true;
}

function summarizeAttendance(records: Array<{ status: string }>) {
  return records.reduce(
    (summary, record) => ({
      ...summary,
      [record.status]: (summary[record.status as keyof typeof summary] ?? 0) + 1,
    }),
    { present: 0, late: 0, leave: 0, absent: 0, makeup: 0, trial: 0 },
  );
}

const teacherHomeworkReviewSchema = z.object({
  reviewStatus: z.enum(['reviewed', 'needs_revision']).default('reviewed'),
  teacherFeedback: z.string().trim().max(2000).default(''),
  rating: z.number().int().min(0).max(5).default(0),
});

const teacherUploadTokenSchema = z.object({
  filename: z.string().trim().min(1).max(200),
});

const teacherStudentWorkSchema = z
  .object({
    studentId: z.string().uuid(),
    courseId: z.string().uuid().optional().nullable(),
    classId: z.string().uuid().optional().nullable(),
    classSessionId: z.string().uuid().optional().nullable(),
    title: z.string().trim().max(160).default('作品展示'),
    description: z.string().trim().max(2000).default(''),
    imageUrls: z.array(z.string().trim().url().max(500)).min(1).max(9),
    frameStyle: z.enum(['classic', 'gallery', 'paper']).default('classic'),
  })
  .refine((value) => value.title || value.description || value.imageUrls.length > 0, {
    message: '请上传作品图片',
  });

const teacherLessonFeedbackSchema = z.object({
  classAssignmentContent: z.string().trim().max(2000).default(''),
  studentAssignments: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        content: z.string().trim().max(2000).default(''),
      }),
    )
    .default([]),
  items: z
    .array(
      z
        .object({
          studentId: z.string().uuid(),
          content: z.string().trim().max(2000).default(''),
          rating: z.number().int().min(0).max(5).default(0),
          imageUrls: z.array(z.string().trim().url().max(500)).max(9).default([]),
        })
        .refine((value) => value.rating > 0 || value.content || value.imageUrls.length > 0, {
          message: '请选择星星或填写点评内容',
        }),
    )
    .default([]),
});

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function compactText(value: string | null | undefined, fallback: string, maxLength = 80) {
  const normalized = value?.trim() || fallback;
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

export const teachingModule: AppModule = {
  name: 'teaching',
  async register(app) {
    const lessonNotifications = new LessonNotificationService({
      db: app.db,
      env: app.appEnv,
      log: app.log,
    });
    const learningNotifications = new LearningNotificationService({
      db: app.db,
      env: app.appEnv,
      log: app.log,
    });

    function billingCourseByStudentId(
      roster: Array<Pick<schedulingRepo.SessionRosterEntry, 'studentId' | 'billingCourseId'>>,
    ) {
      return new Map(roster.map((entry) => [entry.studentId, entry.billingCourseId]));
    }

    async function listAssignedSessionIdsForTeacher(teacherId: string) {
      const assignments = await schedulingRepo.listClassSessionTeachersForTeacher(
        app.db,
        teacherId,
      );
      return new Set(assignments.map((assignment) => assignment.classSessionId));
    }

    function isTeacherAssignedToSession(
      session: typeof schema.classSessions.$inferSelect,
      teacherId: string,
      assignedSessionIds: Set<string>,
    ) {
      return session.teacherId === teacherId || assignedSessionIds.has(session.id);
    }

    async function requireTeacherAccessForAccount(accountId: string) {
      const access = await resolveTeacherAccess(app.db, accountId);
      if (!access) {
        throw Object.assign(new Error('Teacher profile is not linked'), { statusCode: 422 });
      }
      return access;
    }

    async function resolveTeacherDataScope(
      access: Awaited<ReturnType<typeof requireTeacherAccessForAccount>>,
    ) {
      const teachers = await teachingRepo.listTeachers(app.db);
      const currentTeacher = teachers.find((teacher) => teacher.id === access.teacherId);
      if (!currentTeacher) {
        throw Object.assign(new Error('Teacher profile is not linked'), { statusCode: 422 });
      }
      const institution = await teachingRepo.findInstitution(app.db, currentTeacher.institutionId);
      const visibleTeacherIds = new Set(
        access.isAdminTeacher
          ? teachers
              .filter(
                (teacher) =>
                  teacher.id === access.teacherId ||
                  Boolean(
                    currentTeacher.institutionId &&
                    teacher.institutionId === currentTeacher.institutionId,
                  ),
              )
              .map((teacher) => teacher.id)
          : [access.teacherId],
      );
      return {
        currentTeacher,
        teachers,
        teacherById: new Map(teachers.map((teacher) => [teacher.id, teacher])),
        visibleTeacherIds,
        institutionId: currentTeacher.institutionId,
        institution,
      };
    }

    function courseBelongsToTeacherInstitution(
      course: typeof schema.courses.$inferSelect,
      institutionId: string | null,
    ) {
      return institutionId
        ? course.providerInstitutionId === institutionId
        : course.providerInstitutionId === null;
    }

    function requireCourseInTeacherInstitution(
      course: typeof schema.courses.$inferSelect,
      institutionId: string | null,
    ) {
      if (!courseBelongsToTeacherInstitution(course, institutionId)) {
        throw Object.assign(new Error('无权查看或操作其他机构的课程'), { statusCode: 403 });
      }
      return course;
    }

    function requireAdminTeacherAccess(
      access: Awaited<ReturnType<typeof requireTeacherAccessForAccount>>,
    ) {
      if (!access.isAdminTeacher) {
        throw Object.assign(new Error('仅管理老师可新增学员和正式档案'), { statusCode: 403 });
      }
    }

    function normalizeDate(value?: string | null) {
      return value ? new Date(value) : null;
    }

    async function resolveGuardianForTeacherStudent(input: {
      guardianName?: string;
      guardianPhone?: string;
    }) {
      const guardianName = input.guardianName?.trim();
      const guardianPhone = input.guardianPhone?.trim();
      if (!guardianName && !guardianPhone) return null;
      if (!guardianName || !guardianPhone) {
        throw Object.assign(new Error('家长姓名和手机号需同时填写'), { statusCode: 422 });
      }

      const existingByPhone = await peopleRepo.findGuardianByPhone(app.db, guardianPhone);
      if (existingByPhone) {
        if (existingByPhone.name !== guardianName) {
          return peopleRepo.updateGuardian(app.db, existingByPhone.id, { name: guardianName });
        }
        return existingByPhone;
      }

      return peopleRepo.createGuardian(app.db, {
        name: guardianName,
        phone: guardianPhone,
      });
    }

    async function resolveTeacherContractDefaults(
      body: Pick<z.infer<typeof teacherCourseContractCreateSchema>, 'courseId'>,
    ) {
      const [organization, course] = await Promise.all([
        organizationRepo.requireOrganization(app.db),
        catalogRepo.requireCourse(app.db, body.courseId),
      ]);
      const businessModel = readBusinessModel(organization.settings);
      if (!businessModel.manualPackageGrantEnabled) {
        throw Object.assign(new Error('当前业务开关未开启后台手动添加课时包'), {
          statusCode: 403,
        });
      }

      const paymentReceiverInstitutionId = course.paymentReceiverInstitutionId ?? null;
      const paymentReceiverType = course.paymentReceiverType;
      const [paymentReceiverInstitution, providerInstitution] = await Promise.all([
        teachingRepo.findInstitution(app.db, paymentReceiverInstitutionId),
        teachingRepo.findInstitution(app.db, course.providerInstitutionId),
      ]);

      return {
        course,
        paymentReceiverType,
        paymentReceiverInstitutionId,
        paymentReceiverName: resolvePaymentReceiverName({
          paymentReceiverType,
          receiverInstitutionName: paymentReceiverInstitution?.name,
          providerInstitutionName: providerInstitution?.name,
          legacyDisplayName: course.paymentReceiverName,
          organizationBrandName: organization.brandName,
          organizationName: organization.name,
        }),
      };
    }

    function consumedLessonsByAccountId(
      transactions: (typeof schema.lessonTransactions.$inferSelect)[],
    ) {
      const consumed = new Map<string, number>();
      for (const transaction of transactions) {
        if (transaction.type !== 'consume') continue;
        consumed.set(
          transaction.lessonAccountId,
          (consumed.get(transaction.lessonAccountId) ?? 0) - transaction.amount,
        );
      }
      return consumed;
    }

    function totalLessonsForAccount(
      account: typeof schema.lessonAccounts.$inferSelect,
      consumedByAccountId: Map<string, number>,
    ) {
      return account.balance + Math.max(0, consumedByAccountId.get(account.id) ?? 0);
    }

    async function ensureSessionRosterSnapshot(sessionId: string) {
      const rows = await schedulingRepo.listSessionStudentRows(app.db, sessionId);
      if (rows.length > 0) return;
      const legacyRoster = await schedulingRepo.listSessionRoster(app.db, sessionId);
      if (legacyRoster.length === 0) return;
      await schedulingRepo.replaceSessionRoster(
        app.db,
        sessionId,
        legacyRoster.map((entry) => ({
          studentId: entry.studentId,
          billingCourseId: entry.billingCourseId,
          source: entry.source === 'enrollment' ? 'enrollment' : 'session_only',
        })),
      );
    }

    async function reconcileEnrollmentSessions(input: {
      classId: string;
      studentId: string;
      billingCourseId: string;
      joinedAt: Date;
    }) {
      const sessions = await schedulingRepo.listClassSessionsForClass(app.db, input.classId);
      let syncedCount = 0;
      for (const session of sessions) {
        await ensureSessionRosterSnapshot(session.id);
        if (session.status === 'scheduled' && session.startsAt >= input.joinedAt) {
          await schedulingRepo.upsertSessionStudent(app.db, {
            classSessionId: session.id,
            studentId: input.studentId,
            billingCourseId: input.billingCourseId,
            source: 'enrollment',
            active: true,
          });
          syncedCount += 1;
          continue;
        }
        if (session.startsAt >= input.joinedAt) continue;
        const attendance = await attendanceRepo.listAttendanceForSession(app.db, session.id);
        if (!attendance.some((record) => record.studentId === input.studentId)) {
          const removed = await schedulingRepo.removeSessionStudent(app.db, {
            sessionId: session.id,
            studentId: input.studentId,
          });
          if (removed) syncedCount += 1;
        }
      }
      return syncedCount;
    }

    async function removeEnrollmentFromFutureSessions(input: {
      classId: string;
      studentId: string;
      leftAt: Date;
    }) {
      const sessions = (
        await schedulingRepo.listClassSessionsForClass(app.db, input.classId)
      ).filter((session) => session.status === 'scheduled' && session.startsAt >= input.leftAt);
      for (const session of sessions) {
        await ensureSessionRosterSnapshot(session.id);
        const attendance = await attendanceRepo.listAttendanceForSession(app.db, session.id);
        if (attendance.some((record) => record.studentId === input.studentId)) {
          continue;
        }
        await schedulingRepo.removeSessionStudent(app.db, {
          sessionId: session.id,
          studentId: input.studentId,
        });
      }
      return sessions.length;
    }

    app.get(
      '/public/teacher/capabilities',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        return {
          teacherId: access.teacherId,
          isAdminTeacher: access.isAdminTeacher,
          permissions: access.permissions,
        };
      },
    );

    app.get(
      '/public/teacher/profile',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const teacher = await teachingRepo.findTeacher(app.db, access.teacherId);
        if (!teacher) throw notFound('Teacher not found');
        const institution = await teachingRepo.findInstitution(app.db, teacher.institutionId);
        return {
          account: {
            id: access.account.id,
            displayName: access.account.displayName,
            phone: access.account.phone,
            email: access.account.email,
            status: access.account.status,
          },
          teacher: toTeacherDto(teacher),
          institution: institution
            ? {
                id: institution.id,
                name: institution.name,
                logoUrl: institution.logoUrl,
              }
            : null,
        };
      },
    );

    function normalizeTrialStatus(status: string, endsAt?: Date) {
      if (status === 'cancelled') return 'cancelled';
      if (status === 'closed' || (endsAt && endsAt <= new Date())) return 'completed';
      return 'scheduled';
    }

    async function resolveTeacherTrialInput(
      access: Awaited<ReturnType<typeof requireTeacherAccessForAccount>>,
      body: z.infer<typeof teacherTrialSessionSchema>,
      ignoreTrialSessionId?: string,
    ) {
      requireAdminTeacherAccess(access);
      const dataScope = await resolveTeacherDataScope(access);
      const [course, campuses, teacher, classSessions, trialSessions] = await Promise.all([
        catalogRepo.requireCourse(app.db, body.courseId),
        organizationRepo.listCampuses(app.db),
        teachingRepo.findTeacher(app.db, body.teacherId),
        schedulingRepo.listClassSessions(app.db),
        trialRepo.listTrialSessions(app.db),
      ]);
      requireCourseInTeacherInstitution(course, dataScope.institutionId);
      const campus = campuses.find((item) => item.id === body.campusId);
      if (!campus) throw notFound('Campus not found');
      if (!teacher || !dataScope.visibleTeacherIds.has(teacher.id) || teacher.status !== 'active') {
        throw Object.assign(new Error('授课老师不属于当前机构或已停用'), { statusCode: 422 });
      }
      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      if (startsAt <= new Date()) {
        throw Object.assign(new Error('试听时间必须晚于当前时间'), { statusCode: 422 });
      }
      if (endsAt <= startsAt) {
        throw Object.assign(new Error('结束时间必须晚于开始时间'), { statusCode: 422 });
      }
      const classConflict = classSessions.find(
        (session) =>
          session.status !== 'cancelled' &&
          session.teacherId === teacher.id &&
          startsAt < session.endsAt &&
          session.startsAt < endsAt,
      );
      const trialConflict = trialSessions.find(
        (session) =>
          session.id !== ignoreTrialSessionId &&
          session.status !== 'cancelled' &&
          session.teacherId === teacher.id &&
          startsAt < session.endsAt &&
          session.startsAt < endsAt,
      );
      if (classConflict || trialConflict) {
        throw Object.assign(new Error('该老师在所选时间已有课程或试听安排'), {
          statusCode: 409,
        });
      }
      return { course, campus, teacher, startsAt, endsAt, dataScope };
    }

    app.get(
      '/public/teacher/trials',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        const [trialSessions, courses, campuses, leads] = await Promise.all([
          trialRepo.listTrialSessions(app.db),
          catalogRepo.listCourses(app.db),
          organizationRepo.listCampuses(app.db),
          access.isAdminTeacher ? crmRepo.listLeads(app.db) : Promise.resolve([]),
        ]);
        const institutionCourses = courses.filter((course) =>
          courseBelongsToTeacherInstitution(course, dataScope.institutionId),
        );
        const courseById = new Map(institutionCourses.map((course) => [course.id, course]));
        const campusById = new Map(campuses.map((campus) => [campus.id, campus]));
        const now = Date.now();
        const visibleSessions = trialSessions
          .filter(
            (session) =>
              courseById.has(session.courseId) &&
              (access.isAdminTeacher
                ? !session.teacherId || dataScope.visibleTeacherIds.has(session.teacherId)
                : session.teacherId === access.teacherId),
          )
          .sort((left, right) => {
            const leftUpcoming = left.status === 'open' && left.endsAt.getTime() > now;
            const rightUpcoming = right.status === 'open' && right.endsAt.getTime() > now;
            if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
            return leftUpcoming
              ? left.startsAt.getTime() - right.startsAt.getTime()
              : right.startsAt.getTime() - left.startsAt.getTime();
          })
          .map((session) => {
            const teacher = session.teacherId ? dataScope.teacherById.get(session.teacherId) : null;
            return {
              ...session,
              status: normalizeTrialStatus(session.status, session.endsAt),
              teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
              course: courseById.get(session.courseId)
                ? {
                    id: session.courseId,
                    name: courseById.get(session.courseId)!.name,
                  }
                : null,
              campus: campusById.get(session.campusId)
                ? {
                    id: session.campusId,
                    name: campusById.get(session.campusId)!.name,
                  }
                : null,
            };
          });
        const visibleCourseIds = new Set(institutionCourses.map((course) => course.id));
        return {
          isAdminTeacher: access.isAdminTeacher,
          teacherId: access.teacherId,
          sessions: visibleSessions,
          leads: access.isAdminTeacher
            ? leads
                .filter((lead) => !lead.courseId || visibleCourseIds.has(lead.courseId))
                .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
            : [],
          courses: institutionCourses.filter((course) => course.status === 'published'),
          campuses,
          teachers: access.isAdminTeacher
            ? dataScope.teachers
                .filter(
                  (teacher) =>
                    teacher.status === 'active' && dataScope.visibleTeacherIds.has(teacher.id),
                )
                .map((teacher) => ({
                  id: teacher.id,
                  name: teacher.name,
                  title: teacher.title,
                }))
            : [],
        };
      },
    );

    app.post(
      '/public/teacher/trial-leads/:leadId/schedule',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const { leadId } = request.params as { leadId: string };
        const body = teacherTrialLeadScheduleSchema.parse(request.body);
        const lead = await crmRepo.requireLead(app.db, leadId);
        const existingTrial = lead.trialSessionId
          ? await trialRepo.requireTrialSession(app.db, lead.trialSessionId).catch(() => null)
          : null;
        const editableTrial =
          existingTrial && existingTrial.sessionMode !== 'public_event' ? existingTrial : null;
        const resolved = await resolveTeacherTrialInput(access, body, editableTrial?.id);
        if (lead.courseId && lead.courseId !== resolved.course.id) {
          throw Object.assign(new Error('试听课程与线索意向课程不一致'), { statusCode: 422 });
        }
        const trialSession = editableTrial
          ? await trialRepo.updateTrialSession(app.db, editableTrial.id, {
              campusId: resolved.campus.id,
              courseId: resolved.course.id,
              teacherId: resolved.teacher.id,
              sessionMode: 'lead_scheduled',
              title: body.title,
              startsAt: resolved.startsAt,
              endsAt: resolved.endsAt,
              capacity: Math.max(editableTrial.capacity, 1),
              bookedCount: Math.max(editableTrial.bookedCount, 1),
              reservationFeeAmount: 0,
              status: 'open',
            })
          : await trialRepo.createTrialSession(app.db, {
              campusId: resolved.campus.id,
              courseId: resolved.course.id,
              teacherId: resolved.teacher.id,
              sessionMode: 'lead_scheduled',
              title: body.title,
              startsAt: resolved.startsAt,
              endsAt: resolved.endsAt,
              capacity: 1,
              bookedCount: 1,
              reservationFeeAmount: 0,
              reservationNotice: '',
              status: 'open',
            });
        if (!trialSession) throw notFound('Trial session not found');
        if (existingTrial?.sessionMode === 'public_event') {
          await trialRepo.decrementBookedCount(app.db, existingTrial.id);
        }
        const updatedLead = await crmRepo.updateLead(app.db, lead.id, {
          campusId: resolved.campus.id,
          courseId: resolved.course.id,
          trialSessionId: trialSession.id,
          preferredTeacherId: resolved.teacher.id,
          status: 'trial_booked',
        });
        return { lead: updatedLead, trialSession };
      },
    );

    app.post(
      '/public/teacher/trial-invitations',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const body = teacherTrialSessionSchema.parse(request.body);
        const resolved = await resolveTeacherTrialInput(access, body);
        const trialSession = await trialRepo.createTrialSession(app.db, {
          campusId: resolved.campus.id,
          courseId: resolved.course.id,
          teacherId: resolved.teacher.id,
          sessionMode: 'private_invite',
          title: body.title,
          startsAt: resolved.startsAt,
          endsAt: resolved.endsAt,
          capacity: 1,
          bookedCount: 0,
          reservationFeeAmount: 0,
          reservationNotice: '本试听时间已与老师确认，请填写孩子资料完成登记。',
          status: 'open',
        });
        return {
          trialSession,
          sharePath: `/pages/trial-detail/index?id=${encodeURIComponent(trialSession.id)}&invite=1`,
        };
      },
    );

    app.patch(
      '/public/teacher/profile',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const body = teacherSelfProfileUpdateSchema.parse(request.body);
        const teacher = await teachingRepo.updateTeacher(
          app.db,
          access.teacherId,
          normalizeTeacherBody(body),
        );
        if (!teacher) throw notFound('Teacher not found');
        return { teacher: toTeacherDto(teacher) };
      },
    );

    app.get(
      '/public/teacher/scheduling-options',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        const [classes, courses, classrooms, campuses, coursePackages] = await Promise.all([
          schedulingRepo.listClasses(app.db),
          catalogRepo.listCourses(app.db),
          teachingRepo.listClassrooms(app.db),
          organizationRepo.listCampuses(app.db),
          packagesRepo.listActivePackages(app.db),
        ]);
        const institutionCourses = courses.filter((course) =>
          courseBelongsToTeacherInstitution(course, dataScope.institutionId),
        );
        const institutionCourseIds = new Set(institutionCourses.map((course) => course.id));
        const courseById = new Map(institutionCourses.map((course) => [course.id, course]));
        const campusById = new Map(campuses.map((campus) => [campus.id, campus]));
        const manageableClasses = classes.filter(
          (classGroup) =>
            institutionCourseIds.has(classGroup.courseId) &&
            (classGroup.teacherId === access.teacherId ||
              (access.isAdminTeacher && dataScope.visibleTeacherIds.has(classGroup.teacherId))) &&
            ['recruiting', 'active'].includes(classGroup.status),
        );
        const allowedCourseIds = new Set(
          manageableClasses.map((classGroup) => classGroup.courseId),
        );
        const selectableCourses =
          access.permissions.createAdHocSession || access.permissions.manageClasses
            ? institutionCourses.filter((course) => course.status === 'published')
            : institutionCourses.filter((course) => allowedCourseIds.has(course.id));
        const allowedCampusIds = new Set(
          institutionCourses.flatMap((course) => (course.campusId ? [course.campusId] : [])),
        );
        const allowedClassroomIds = new Set(
          institutionCourses.flatMap((course) => [
            ...(course.classroomId ? [course.classroomId] : []),
            ...(course.classroomIds ?? []),
          ]),
        );
        for (const classGroup of classes) {
          if (!institutionCourseIds.has(classGroup.courseId)) continue;
          allowedCampusIds.add(classGroup.campusId);
          allowedClassroomIds.add(classGroup.classroomId);
        }
        return {
          permissions: access.permissions,
          classes: manageableClasses.map((classGroup) => ({
            ...classGroup,
            course: courseById.get(classGroup.courseId) ?? null,
          })),
          courses: selectableCourses,
          coursePackages: coursePackages.filter(
            (coursePackage) =>
              (coursePackage.courseId && institutionCourseIds.has(coursePackage.courseId)) ||
              (coursePackage.courseSeriesId &&
                institutionCourses.some(
                  (course) => course.courseSeriesId === coursePackage.courseSeriesId,
                )),
          ),
          classrooms: classrooms
            .filter(
              (classroom) =>
                classroom.status === 'active' &&
                (allowedClassroomIds.has(classroom.id) || allowedCampusIds.has(classroom.campusId)),
            )
            .map((classroom) => ({
              ...classroom,
              campus: campusById.get(classroom.campusId) ?? null,
            })),
        };
      },
    );

    app.post(
      '/public/teacher/classes',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        requireTeacherPermission(access.permissions, 'manageClasses');
        const body = teacherClassCreateSchema.parse(request.body);
        const studentIds = Array.from(new Set(body.studentIds));
        if (studentIds.length > 0) {
          requireTeacherPermission(access.permissions, 'viewAllStudents');
          requireTeacherPermission(access.permissions, 'enrollStudents');
        }

        const [course, classroom, students, lessonAccounts, allClasses] = await Promise.all([
          catalogRepo.requireCourse(app.db, body.courseId),
          teachingRepo.findClassroom(app.db, body.classroomId),
          peopleRepo.listStudents(app.db, { scope: 'all' }),
          app.db
            .select()
            .from(schema.lessonAccounts)
            .where(eq(schema.lessonAccounts.courseId, body.courseId)),
          schedulingRepo.listClasses(app.db),
        ]);
        if (course.status !== 'published') {
          throw Object.assign(new Error('只能为已发布课程新建班级'), { statusCode: 422 });
        }
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        if (!classroom || classroom.status !== 'active') {
          throw Object.assign(new Error('请选择可用教室'), { statusCode: 422 });
        }
        const classroomAllowed =
          course.classroomId === classroom.id ||
          (course.classroomIds ?? []).includes(classroom.id) ||
          course.campusId === classroom.campusId ||
          allClasses.some(
            (classGroup) =>
              classGroup.courseId === course.id && classGroup.classroomId === classroom.id,
          );
        if (!classroomAllowed) {
          throw Object.assign(new Error('无权选择其他机构课程使用的教室'), { statusCode: 403 });
        }
        if (studentIds.length > body.capacity) {
          throw Object.assign(new Error('初始学员人数不能超过班级容量'), { statusCode: 422 });
        }

        const studentById = new Map(students.map((student) => [student.id, student]));
        const accountStudentIds = new Set(lessonAccounts.map((account) => account.studentId));
        for (const studentId of studentIds) {
          const student = studentById.get(studentId);
          if (!student || student.status !== 'active') {
            throw Object.assign(new Error('所选学员不存在或已停用'), { statusCode: 422 });
          }
          if (!accountStudentIds.has(studentId)) {
            throw Object.assign(new Error(`${student.name} 暂无该课程的正式课时档案`), {
              statusCode: 422,
            });
          }
        }

        const sameCourseClasses = allClasses.filter(
          (classGroup) => classGroup.courseId === body.courseId,
        );
        const sameCourseEnrollments = (
          await Promise.all(
            sameCourseClasses.map((classGroup) =>
              schedulingRepo.listEnrollments(app.db, classGroup.id),
            ),
          )
        ).flat();
        const conflictingEnrollment = sameCourseEnrollments.find((enrollment) =>
          studentIds.includes(enrollment.studentId),
        );
        if (conflictingEnrollment) {
          const student = studentById.get(conflictingEnrollment.studentId);
          throw Object.assign(new Error(`${student?.name ?? '学员'} 已在该课程的其他班级`), {
            statusCode: 409,
          });
        }

        const classGroup = await app.db.transaction(async (tx) => {
          const txDb = tx as unknown as typeof app.db;
          const created = await schedulingRepo.createClass(txDb, {
            campusId: classroom.campusId,
            courseId: body.courseId,
            teacherId: access.teacherId,
            classroomId: classroom.id,
            name: body.name,
            capacity: body.capacity,
            status: body.status,
          });
          for (const studentId of studentIds) {
            await schedulingRepo.createEnrollment(txDb, {
              classId: created.id,
              studentId,
              billingCourseId: body.courseId,
              active: true,
            });
          }
          return created;
        });

        return {
          class: {
            ...classGroup,
            course,
            classroom,
            enrolledCount: studentIds.length,
          },
        };
      },
    );

    app.get(
      '/public/teacher/classes/:classId',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { classId } = request.params as { classId: string };
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup) throw notFound('Class not found');
        const [assignedSessionIds, classSessions] = await Promise.all([
          listAssignedSessionIdsForTeacher(access.teacherId),
          schedulingRepo.listClassSessions(app.db),
        ]);
        const assignedToClass = classSessions.some(
          (session) =>
            session.classId === classGroup.id &&
            isTeacherAssignedToSession(session, access.teacherId, assignedSessionIds),
        );
        if (!dataScope.visibleTeacherIds.has(classGroup.teacherId) && !assignedToClass) {
          throw Object.assign(new Error('无权查看该班级'), { statusCode: 403 });
        }
        const [course, classroom, campus, enrollments, students, lessonAccounts] =
          await Promise.all([
            catalogRepo.requireCourse(app.db, classGroup.courseId),
            teachingRepo.findClassroom(app.db, classGroup.classroomId),
            organizationRepo.findCampus(app.db, classGroup.campusId),
            schedulingRepo.listEnrollments(app.db, classGroup.id),
            peopleRepo.listStudents(app.db, { scope: 'all' }),
            app.db.select().from(schema.lessonAccounts),
          ]);
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        const teacher = dataScope.teacherById.get(classGroup.teacherId);
        const studentById = new Map(students.map((student) => [student.id, student]));
        const lessonAccountByStudentCourse = new Map(
          lessonAccounts.map((account) => [`${account.studentId}:${account.courseId}`, account]),
        );
        const courses = await catalogRepo.listCourses(app.db);
        const courseById = new Map(courses.map((item) => [item.id, item]));
        return {
          class: {
            ...classGroup,
            course,
            classroom,
            campus,
            teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
            students: enrollments.flatMap((enrollment) => {
              const student = studentById.get(enrollment.studentId);
              return student
                ? [
                    {
                      id: student.id,
                      enrollmentId: enrollment.id,
                      name: student.name,
                      grade: student.grade,
                      school: student.school,
                      billingCourseId: enrollment.billingCourseId,
                      billingCourseName:
                        courseById.get(enrollment.billingCourseId)?.name ?? '课时档案',
                      joinedAt: enrollment.joinedAt,
                      lessonBalance:
                        lessonAccountByStudentCourse.get(
                          `${student.id}:${enrollment.billingCourseId}`,
                        )?.balance ?? null,
                    },
                  ]
                : [];
            }),
          },
        };
      },
    );

    app.patch(
      '/public/teacher/classes/:classId',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { classId } = request.params as { classId: string };
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        requireTeacherPermission(access.permissions, 'manageClasses');
        const body = teacherClassUpdateSchema.parse(request.body);
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup) throw notFound('Class not found');
        if (
          classGroup.teacherId !== access.teacherId &&
          !(access.isAdminTeacher && dataScope.visibleTeacherIds.has(classGroup.teacherId))
        ) {
          throw Object.assign(new Error('无权修改该班级'), { statusCode: 403 });
        }
        const course = await catalogRepo.requireCourse(app.db, classGroup.courseId);
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        if (body.capacity !== undefined) {
          const enrolledCount = await schedulingRepo.countActiveEnrollments(app.db, classId);
          if (body.capacity < enrolledCount) {
            throw Object.assign(new Error(`班级当前有 ${enrolledCount} 名学员，容量不能更小`), {
              statusCode: 422,
            });
          }
        }
        const classroomId = body.classroomId;
        let campusId: string | undefined;
        if (classroomId) {
          const classroom = await teachingRepo.findClassroom(app.db, classroomId);
          if (!classroom || classroom.status !== 'active') {
            throw Object.assign(new Error('请选择可用教室'), { statusCode: 422 });
          }
          const classroomAllowed =
            course.classroomId === classroom.id ||
            (course.classroomIds ?? []).includes(classroom.id) ||
            course.campusId === classroom.campusId ||
            classGroup.classroomId === classroom.id ||
            classGroup.campusId === classroom.campusId;
          if (!classroomAllowed) {
            throw Object.assign(new Error('无权选择其他机构课程使用的教室'), {
              statusCode: 403,
            });
          }
          campusId = classroom.campusId;
        }
        const updated = await schedulingRepo.updateClass(app.db, classId, {
          ...body,
          classroomId,
          campusId,
        });
        return { class: updated };
      },
    );

    app.post(
      '/public/teacher/classes/:classId/students',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { classId } = request.params as { classId: string };
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        requireTeacherPermission(access.permissions, 'manageClasses');
        requireTeacherPermission(access.permissions, 'viewAllStudents');
        requireTeacherPermission(access.permissions, 'enrollStudents');
        const body = teacherClassStudentSchema.parse(request.body);
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup) throw notFound('Class not found');
        if (
          classGroup.teacherId !== access.teacherId &&
          !(access.isAdminTeacher && dataScope.visibleTeacherIds.has(classGroup.teacherId))
        ) {
          throw Object.assign(new Error('无权操作该班级'), { statusCode: 403 });
        }
        const course = await catalogRepo.requireCourse(app.db, classGroup.courseId);
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        if (!['recruiting', 'active'].includes(classGroup.status)) {
          throw Object.assign(new Error('只能向招生中或开课中的班级添加学员'), {
            statusCode: 422,
          });
        }
        const student = await peopleRepo.requireStudent(app.db, body.studentId);
        if (student.status !== 'active') {
          throw Object.assign(new Error('该学员当前不可用'), { statusCode: 422 });
        }
        const billingCourseId = body.billingCourseId ?? classGroup.courseId;
        const billingCourse = await catalogRepo.requireCourse(app.db, billingCourseId);
        requireCourseInTeacherInstitution(billingCourse, dataScope.institutionId);
        const [lessonAccount] = await app.db
          .select()
          .from(schema.lessonAccounts)
          .where(
            and(
              eq(schema.lessonAccounts.studentId, body.studentId),
              eq(schema.lessonAccounts.courseId, billingCourseId),
            ),
          )
          .limit(1);
        if (!lessonAccount) {
          throw Object.assign(new Error('该学员暂无所选扣课档案'), { statusCode: 422 });
        }
        const allClasses = await schedulingRepo.listClasses(app.db);
        const sameCourseEnrollments = (
          await Promise.all(
            allClasses
              .filter((item) => item.courseId === classGroup.courseId)
              .map((item) => schedulingRepo.listEnrollments(app.db, item.id)),
          )
        ).flat();
        const existing = sameCourseEnrollments.find(
          (enrollment) => enrollment.studentId === body.studentId,
        );
        if (existing) {
          throw Object.assign(
            new Error(existing.classId === classId ? '该学员已在此班' : '该学员已在同课程其他班级'),
            { statusCode: 409 },
          );
        }
        const enrolledCount = await schedulingRepo.countActiveEnrollments(app.db, classId);
        if (enrolledCount >= classGroup.capacity) {
          throw Object.assign(new Error('班级已满'), { statusCode: 409 });
        }
        const joinedAt = body.joinedAt ? new Date(body.joinedAt) : new Date();
        const enrollment = await schedulingRepo.createEnrollment(app.db, {
          classId,
          studentId: body.studentId,
          billingCourseId,
          active: true,
          joinedAt,
          leftAt: null,
        });
        const syncedSessionCount = await reconcileEnrollmentSessions({
          classId,
          studentId: body.studentId,
          billingCourseId,
          joinedAt,
        });
        return { enrollment, syncedSessionCount };
      },
    );

    app.patch(
      '/public/teacher/classes/:classId/students/:studentId',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { classId, studentId } = request.params as {
          classId: string;
          studentId: string;
        };
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        requireTeacherPermission(access.permissions, 'manageClasses');
        requireTeacherPermission(access.permissions, 'enrollStudents');
        const body = teacherClassStudentEffectiveTimeSchema.parse(request.body);
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup) throw notFound('Class not found');
        if (
          classGroup.teacherId !== access.teacherId &&
          !(access.isAdminTeacher && dataScope.visibleTeacherIds.has(classGroup.teacherId))
        ) {
          throw Object.assign(new Error('无权操作该班级'), { statusCode: 403 });
        }
        const course = await catalogRepo.requireCourse(app.db, classGroup.courseId);
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        const enrollment = (await schedulingRepo.listEnrollments(app.db, classId)).find(
          (item) => item.studentId === studentId,
        );
        if (!enrollment) throw notFound('Enrollment not found');
        const joinedAt = new Date(body.joinedAt);
        const updated = await schedulingRepo.updateEnrollmentJoinedAt(app.db, {
          classId,
          enrollmentId: enrollment.id,
          joinedAt,
        });
        const syncedSessionCount = await reconcileEnrollmentSessions({
          classId,
          studentId,
          billingCourseId: enrollment.billingCourseId,
          joinedAt,
        });
        return { enrollment: updated, syncedSessionCount };
      },
    );

    app.delete(
      '/public/teacher/classes/:classId/students/:studentId',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { classId, studentId } = request.params as {
          classId: string;
          studentId: string;
        };
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        requireTeacherPermission(access.permissions, 'manageClasses');
        requireTeacherPermission(access.permissions, 'enrollStudents');
        const classGroup = await schedulingRepo.findClass(app.db, classId);
        if (!classGroup) throw notFound('Class not found');
        if (
          classGroup.teacherId !== access.teacherId &&
          !(access.isAdminTeacher && dataScope.visibleTeacherIds.has(classGroup.teacherId))
        ) {
          throw Object.assign(new Error('无权操作该班级'), { statusCode: 403 });
        }
        const course = await catalogRepo.requireCourse(app.db, classGroup.courseId);
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        const enrollments = await schedulingRepo.listEnrollments(app.db, classId);
        const enrollment = enrollments.find((item) => item.studentId === studentId);
        if (!enrollment) throw notFound('Enrollment not found');
        const leftAt = new Date();
        const syncedSessionCount = await removeEnrollmentFromFutureSessions({
          classId,
          studentId,
          leftAt,
        });
        const removed = await schedulingRepo.removeEnrollment(
          app.db,
          classId,
          enrollment.id,
          leftAt,
        );
        return { enrollment: removed, syncedSessionCount };
      },
    );

    app.post(
      '/public/teacher/students',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        requireAdminTeacherAccess(access);
        const body = teacherStudentCreateSchema.parse(request.body);
        const guardian = await resolveGuardianForTeacherStudent({
          guardianName: body.guardianName,
          guardianPhone: body.guardianPhone,
        });
        const student = await peopleRepo.createStudent(app.db, {
          guardianId: guardian?.id ?? null,
          name: body.name,
          grade: body.grade,
          school: body.school || null,
          status: 'active',
        });
        return {
          student: {
            ...student,
            guardian: guardian ?? undefined,
            lessonAccounts: [],
          },
        };
      },
    );

    app.get(
      '/public/teacher/students',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        requireTeacherPermission(access.permissions, 'viewAllStudents');
        const dataScope = await resolveTeacherDataScope(access);
        const query = teacherStudentSearchSchema.parse(request.query);
        const [students, lessonAccounts, courses, classes] = await Promise.all([
          peopleRepo.listStudents(app.db, { scope: 'all' }),
          app.db.select().from(schema.lessonAccounts),
          catalogRepo.listCourses(app.db),
          schedulingRepo.listClasses(app.db),
        ]);
        const institutionTeacherIds = new Set(
          dataScope.teachers
            .filter(
              (teacher) =>
                teacher.id === access.teacherId ||
                Boolean(
                  dataScope.institutionId && teacher.institutionId === dataScope.institutionId,
                ),
            )
            .map((teacher) => teacher.id),
        );
        const institutionCourseIds = new Set(
          courses
            .filter((course) => courseBelongsToTeacherInstitution(course, dataScope.institutionId))
            .map((course) => course.id),
        );
        const institutionLessonAccountIds = lessonAccounts
          .filter((lessonAccount) => institutionCourseIds.has(lessonAccount.courseId))
          .map((lessonAccount) => lessonAccount.id);
        const lessonTransactions =
          institutionLessonAccountIds.length > 0
            ? await app.db
                .select()
                .from(schema.lessonTransactions)
                .where(
                  and(
                    eq(schema.lessonTransactions.type, 'consume'),
                    inArray(schema.lessonTransactions.lessonAccountId, institutionLessonAccountIds),
                  ),
                )
            : [];
        const consumedByLessonAccountId = consumedLessonsByAccountId(lessonTransactions);
        const institutionClasses = classes.filter(
          (classGroup) =>
            institutionTeacherIds.has(classGroup.teacherId) &&
            institutionCourseIds.has(classGroup.courseId),
        );
        const institutionEnrollments = (
          await Promise.all(
            institutionClasses.map((classGroup) =>
              schedulingRepo.listEnrollments(app.db, classGroup.id),
            ),
          )
        ).flat();
        const institutionStudentIds = new Set(
          institutionEnrollments.map((enrollment) => enrollment.studentId),
        );
        for (const lessonAccount of lessonAccounts) {
          if (institutionCourseIds.has(lessonAccount.courseId)) {
            institutionStudentIds.add(lessonAccount.studentId);
          }
        }
        const search = query.search.toLocaleLowerCase('zh-CN');
        const eligibleStudentIds =
          query.courseId && institutionCourseIds.has(query.courseId)
            ? new Set(
                lessonAccounts
                  .filter((account) => account.courseId === query.courseId)
                  .map((account) => account.studentId),
              )
            : query.courseId
              ? new Set<string>()
              : null;
        const filtered = students.filter((student) => {
          if (student.status !== 'active') return false;
          if (!institutionStudentIds.has(student.id)) return false;
          if (eligibleStudentIds && !eligibleStudentIds.has(student.id)) return false;
          if (!search) return true;
          return [student.name, student.grade, student.school]
            .filter(Boolean)
            .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(search));
        });
        const start = (query.page - 1) * query.pageSize;
        const courseById = new Map(courses.map((course) => [course.id, course]));
        return {
          students: filtered.slice(start, start + query.pageSize).map((student) => ({
            id: student.id,
            name: student.name,
            grade: student.grade,
            school: student.school,
            lessonAccounts: lessonAccounts
              .filter(
                (account) =>
                  account.studentId === student.id &&
                  institutionCourseIds.has(account.courseId) &&
                  (!query.courseId || account.courseId === query.courseId),
              )
              .map((account) => ({
                id: account.id,
                courseId: account.courseId,
                balance: account.balance,
                totalLessons: totalLessonsForAccount(account, consumedByLessonAccountId),
                courseName: courseById.get(account.courseId)?.name ?? '课程',
              })),
          })),
          page: query.page,
          pageSize: query.pageSize,
          total: filtered.length,
        };
      },
    );

    app.post(
      '/public/teacher/course-contracts',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        requireAdminTeacherAccess(access);
        const dataScope = await resolveTeacherDataScope(access);
        const body = teacherCourseContractCreateSchema.parse(request.body);
        const defaults = await resolveTeacherContractDefaults(body);
        requireCourseInTeacherInstitution(defaults.course, dataScope.institutionId);

        if (body.classId) {
          const classGroup = await schedulingRepo.findClass(app.db, body.classId);
          if (!classGroup) throw notFound('Class not found');
          if (classGroup.courseId !== body.courseId) {
            throw Object.assign(new Error('班级与课程不匹配'), { statusCode: 422 });
          }
          if (
            classGroup.teacherId !== access.teacherId &&
            !(access.isAdminTeacher && dataScope.visibleTeacherIds.has(classGroup.teacherId))
          ) {
            throw Object.assign(new Error('无权操作该班级'), { statusCode: 403 });
          }
        }

        return courseContractsRepo.createCourseContract(app.db, {
          studentId: body.studentId,
          courseId: body.courseId,
          classId: body.classId ?? null,
          packageId: body.packageId ?? null,
          title: body.title ?? null,
          lessonCount: body.lessonCount,
          paidAmount: body.paidAmount,
          paymentMethod: body.paymentMethod,
          paymentReceiverType: defaults.paymentReceiverType,
          paymentReceiverInstitutionId: defaults.paymentReceiverInstitutionId,
          paymentReceiverName: defaults.paymentReceiverName,
          startsAt: normalizeDate(body.startsAt),
          endsAt: normalizeDate(body.endsAt),
          note: body.note ?? null,
          createdByAccountId: request.account!.id,
        });
      },
    );

    app.post(
      '/public/teacher/class-sessions',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        const body = teacherSessionCreateSchema.parse(request.body);
        requireTeacherPermission(access.permissions, 'viewAllStudents');
        const classGroup = body.classId
          ? await schedulingRepo.findClass(app.db, body.classId)
          : null;
        if (body.classId && !classGroup) throw notFound('Class not found');
        if (classGroup) {
          requireTeacherPermission(access.permissions, 'createClassSession');
          if (
            classGroup.teacherId !== access.teacherId &&
            !(access.isAdminTeacher && dataScope.visibleTeacherIds.has(classGroup.teacherId))
          ) {
            throw Object.assign(new Error('只能为自己负责的班级排课'), { statusCode: 403 });
          }
          if (!['recruiting', 'active'].includes(classGroup.status)) {
            throw Object.assign(new Error('该班级当前不能排课'), { statusCode: 422 });
          }
          if (classGroup.courseId !== body.courseId) {
            throw Object.assign(new Error('课次课程必须与班级课程一致'), { statusCode: 422 });
          }
        } else {
          requireTeacherPermission(access.permissions, 'createAdHocSession');
        }
        if (body.lessonUnits !== 1) {
          requireTeacherPermission(access.permissions, 'setLessonUnits');
        }

        const startsAt = new Date(body.startsAt);
        const endsAt = new Date(body.endsAt);
        if (endsAt <= startsAt) {
          throw Object.assign(new Error('下课时间必须晚于上课时间'), { statusCode: 422 });
        }
        const [course, classroom, students, lessonAccounts, courses] = await Promise.all([
          catalogRepo.requireCourse(app.db, body.courseId),
          teachingRepo.findClassroom(app.db, body.classroomId),
          peopleRepo.listStudents(app.db, { scope: 'all' }),
          app.db.select().from(schema.lessonAccounts),
          catalogRepo.listCourses(app.db),
        ]);
        if (course.status === 'archived' || (!classGroup && course.status !== 'published')) {
          throw Object.assign(new Error('不能选择已归档课程'), { statusCode: 422 });
        }
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        if (!classroom || classroom.status !== 'active') {
          throw notFound('Classroom not found');
        }
        const classroomAllowed =
          course.classroomId === classroom.id ||
          (course.classroomIds ?? []).includes(classroom.id) ||
          course.campusId === classroom.campusId ||
          classGroup?.classroomId === classroom.id ||
          classGroup?.campusId === classroom.campusId;
        if (!classroomAllowed) {
          throw Object.assign(new Error('无权选择其他机构课程使用的教室'), { statusCode: 403 });
        }
        const uniqueStudentInputs = Array.from(
          new Map(
            body.students.map((student) => [
              student.studentId,
              {
                ...student,
                billingCourseId: student.billingCourseId ?? body.courseId,
              },
            ]),
          ).values(),
        );
        if (uniqueStudentInputs.length !== body.students.length) {
          throw Object.assign(new Error('学员名单存在重复项'), { statusCode: 422 });
        }
        if (uniqueStudentInputs.length > classroom.capacity) {
          throw Object.assign(new Error('课次人数超过教室容量'), { statusCode: 409 });
        }
        const studentById = new Map(students.map((student) => [student.id, student]));
        const billingCourseById = new Map(courses.map((item) => [item.id, item]));
        const lessonAccountKeys = new Set(
          lessonAccounts.map((account) => `${account.studentId}:${account.courseId}`),
        );
        for (const item of uniqueStudentInputs) {
          const student = studentById.get(item.studentId);
          if (!student || student.status !== 'active') {
            throw Object.assign(new Error('学员不存在或已停用'), { statusCode: 422 });
          }
          const billingCourse = billingCourseById.get(item.billingCourseId);
          if (
            !billingCourse ||
            !courseBelongsToTeacherInstitution(billingCourse, dataScope.institutionId)
          ) {
            throw Object.assign(new Error(`${student.name} 的扣课档案不属于当前机构`), {
              statusCode: 403,
            });
          }
          if (!lessonAccountKeys.has(`${item.studentId}:${item.billingCourseId}`)) {
            throw Object.assign(new Error(`${student.name} 暂无所选扣课档案`), {
              statusCode: 422,
            });
          }
          if (item.enrollmentMode === 'class' && !classGroup) {
            throw Object.assign(new Error('临时课次不能将学员正式加入班级'), { statusCode: 422 });
          }
        }

        const currentEnrollments = classGroup
          ? await schedulingRepo.listEnrollments(app.db, classGroup.id)
          : [];
        const enrolledStudentIds = new Set(
          currentEnrollments.map((enrollment) => enrollment.studentId),
        );
        const newEnrollments = uniqueStudentInputs.filter(
          (item) => item.enrollmentMode === 'class' && !enrolledStudentIds.has(item.studentId),
        );
        if (newEnrollments.length > 0) {
          requireTeacherPermission(access.permissions, 'enrollStudents');
          if (
            classGroup &&
            currentEnrollments.length + newEnrollments.length > classGroup.capacity
          ) {
            throw Object.assign(new Error('正式入班后将超过班级容量'), { statusCode: 409 });
          }
          const sameCourseClasses = (await schedulingRepo.listClasses(app.db)).filter(
            (item) => item.courseId === body.courseId,
          );
          const sameCourseEnrollments = (
            await Promise.all(
              sameCourseClasses.map((item) => schedulingRepo.listEnrollments(app.db, item.id)),
            )
          ).flat();
          const conflictingEnrollment = newEnrollments.find((item) =>
            sameCourseEnrollments.some(
              (enrollment) =>
                enrollment.studentId === item.studentId && enrollment.classId !== classGroup?.id,
            ),
          );
          if (conflictingEnrollment) {
            const student = studentById.get(conflictingEnrollment.studentId);
            throw Object.assign(new Error(`${student?.name ?? '学员'} 已在同课程的其他班级`), {
              statusCode: 409,
            });
          }
        }

        const sessionTeacherId = classGroup?.teacherId ?? access.teacherId;
        const overlap = await schedulingRepo.findScheduleConflict(app.db, {
          startsAt,
          endsAt,
          classroomId: classroom.id,
          teacherId: sessionTeacherId,
          teacherIds: [sessionTeacherId],
        });
        if (overlap) {
          throw Object.assign(new Error('老师或教室在该时间段已有安排'), { statusCode: 409 });
        }

        const classSession = await app.db.transaction(async (tx) => {
          const txDb = tx as unknown as typeof app.db;
          for (const item of newEnrollments) {
            await schedulingRepo.createEnrollment(txDb, {
              classId: classGroup!.id,
              studentId: item.studentId,
              billingCourseId: item.billingCourseId,
              active: true,
            });
            enrolledStudentIds.add(item.studentId);
          }
          const created = await schedulingRepo.createClassSession(txDb, {
            classId: classGroup?.id ?? null,
            courseId: body.courseId,
            teacherId: sessionTeacherId,
            classroomId: classroom.id,
            startsAt,
            endsAt,
            topic: body.topic,
            sessionType: classGroup ? 'class' : 'ad_hoc',
            lessonUnits: body.lessonUnits,
            status: 'scheduled',
            createdByAccountId: request.account!.id,
          });
          await schedulingRepo.replaceClassSessionTeachers(txDb, created.id, sessionTeacherId, [
            sessionTeacherId,
          ]);
          await schedulingRepo.replaceSessionRoster(
            txDb,
            created.id,
            uniqueStudentInputs.map((item) => ({
              studentId: item.studentId,
              billingCourseId: item.billingCourseId,
              source: enrolledStudentIds.has(item.studentId) ? 'enrollment' : 'session_only',
            })),
          );
          for (const item of uniqueStudentInputs) {
            if (!enrolledStudentIds.has(item.studentId)) {
              await schedulingRepo.createTemporaryStudent(txDb, {
                classSessionId: created.id,
                studentId: item.studentId,
                billingCourseId: item.billingCourseId,
                note: '老师排课添加',
              });
            }
          }
          return created;
        });

        return {
          classSession: {
            ...classSession,
            class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
            course: { id: course.id, name: course.name },
            classroom: { id: classroom.id, name: classroom.name },
            rosterCount: uniqueStudentInputs.length,
          },
        };
      },
    );

    app.get(
      '/public/teacher/class-sessions/:sessionId',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        const owned = await requireOwnedSession(request.account!.id, sessionId);
        const [
          classGroup,
          course,
          classroom,
          teacher,
          roster,
          students,
          courses,
          lessonAccounts,
          attendance,
        ] = await Promise.all([
          owned.session.classId
            ? schedulingRepo.findClass(app.db, owned.session.classId)
            : Promise.resolve(null),
          catalogRepo.requireCourse(app.db, owned.session.courseId),
          teachingRepo.findClassroom(app.db, owned.session.classroomId),
          teachingRepo.findTeacher(app.db, owned.session.teacherId),
          schedulingRepo.listSessionRoster(app.db, sessionId),
          peopleRepo.listStudents(app.db, { scope: 'all' }),
          catalogRepo.listCourses(app.db),
          app.db.select().from(schema.lessonAccounts),
          attendanceRepo.listAttendanceForSession(app.db, sessionId),
        ]);
        const visibleCourses = courses.filter((item) =>
          courseBelongsToTeacherInstitution(item, dataScope.institutionId),
        );
        const visibleCourseIds = new Set(visibleCourses.map((item) => item.id));
        const courseById = new Map(visibleCourses.map((item) => [item.id, item]));
        const studentById = new Map(students.map((item) => [item.id, item]));
        const attendedStudentIds = new Set(attendance.map((item) => item.studentId));
        return {
          session: {
            ...owned.session,
            teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
          },
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          course: { id: course.id, name: course.name },
          classroom: classroom ? { id: classroom.id, name: classroom.name } : null,
          canEdit:
            owned.session.status === 'scheduled' &&
            attendance.length === 0 &&
            (owned.isMine || access.isAdminTeacher),
          canEditStatus: owned.isMine || access.isAdminTeacher,
          roster: roster.flatMap((entry) => {
            const student = studentById.get(entry.studentId);
            if (!student) return [];
            return [
              {
                id: student.id,
                name: student.name,
                grade: student.grade,
                school: student.school,
                source: entry.source,
                billingCourseId: entry.billingCourseId,
                billingCourseName: courseById.get(entry.billingCourseId)?.name ?? '课时档案',
                canRemove: !attendedStudentIds.has(student.id),
                lessonAccounts: lessonAccounts
                  .filter(
                    (account) =>
                      account.studentId === student.id && visibleCourseIds.has(account.courseId),
                  )
                  .map((account) => ({
                    id: account.id,
                    courseId: account.courseId,
                    courseName: courseById.get(account.courseId)?.name ?? '课程',
                    balance: account.balance,
                  })),
              },
            ];
          }),
        };
      },
    );

    app.patch(
      '/public/teacher/class-sessions/:sessionId',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        const owned = await requireOwnedSession(request.account!.id, sessionId);
        const session = owned.session;
        if (!owned.isMine && !access.isAdminTeacher) {
          throw Object.assign(new Error('只能修改自己负责的课次'), { statusCode: 403 });
        }
        const course = await catalogRepo.requireCourse(app.db, session.courseId);
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        requireTeacherPermission(
          access.permissions,
          session.sessionType === 'ad_hoc' ? 'createAdHocSession' : 'createClassSession',
        );
        const body = teacherSessionUpdateSchema.parse(request.body);
        const existingAttendance = await attendanceRepo.listAttendanceForSession(
          app.db,
          session.id,
        );
        const hasScheduleChanges =
          body.classroomId !== undefined ||
          body.startsAt !== undefined ||
          body.endsAt !== undefined ||
          body.topic !== undefined ||
          body.lessonUnits !== undefined;
        if (hasScheduleChanges && session.status !== 'scheduled') {
          throw Object.assign(new Error('已完成或已取消课次只能修改状态'), { statusCode: 422 });
        }
        if (hasScheduleChanges && existingAttendance.length > 0) {
          throw Object.assign(new Error('已开始点名的课次不能修改'), { statusCode: 422 });
        }
        if (body.lessonUnits !== undefined && body.lessonUnits !== session.lessonUnits) {
          requireTeacherPermission(access.permissions, 'setLessonUnits');
        }
        if (!hasScheduleChanges && body.status && body.status !== 'scheduled') {
          const updated = await schedulingRepo.updateClassSession(app.db, session.id, {
            status: body.status,
          });
          return { classSession: updated };
        }
        const startsAt = body.startsAt ? new Date(body.startsAt) : session.startsAt;
        const endsAt = body.endsAt ? new Date(body.endsAt) : session.endsAt;
        if (endsAt <= startsAt) {
          throw Object.assign(new Error('下课时间必须晚于上课时间'), { statusCode: 422 });
        }
        const classroomId = body.classroomId ?? session.classroomId;
        const classroom = await teachingRepo.findClassroom(app.db, classroomId);
        if (!classroom || classroom.status !== 'active') {
          throw Object.assign(new Error('请选择可用教室'), { statusCode: 422 });
        }
        const classGroup = session.classId
          ? await schedulingRepo.findClass(app.db, session.classId)
          : null;
        const classroomAllowed =
          course.classroomId === classroom.id ||
          (course.classroomIds ?? []).includes(classroom.id) ||
          course.campusId === classroom.campusId ||
          classGroup?.classroomId === classroom.id ||
          classGroup?.campusId === classroom.campusId;
        if (!classroomAllowed) {
          throw Object.assign(new Error('无权选择其他机构课程使用的教室'), { statusCode: 403 });
        }
        if (hasScheduleChanges || body.status === 'scheduled') {
          const overlap = await schedulingRepo.findScheduleConflict(app.db, {
            startsAt,
            endsAt,
            classroomId,
            teacherId: session.teacherId,
            teacherIds: [session.teacherId],
            ignoreSessionId: session.id,
          });
          if (overlap) {
            throw Object.assign(new Error('老师或教室在该时间段已有安排'), {
              statusCode: 409,
            });
          }
        }
        const updated = await schedulingRepo.updateClassSession(app.db, session.id, {
          ...body,
          startsAt,
          endsAt,
          classroomId,
        });
        return { classSession: updated };
      },
    );

    app.post(
      '/public/teacher/class-sessions/:sessionId/students',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const body = teacherSessionStudentSchema.parse(request.body);
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        requireTeacherPermission(access.permissions, 'manageSessionRoster');
        requireTeacherPermission(access.permissions, 'viewAllStudents');
        const owned = await requireOwnedSession(request.account!.id, sessionId);
        const session = owned.session;
        if ((!owned.isMine && !access.isAdminTeacher) || session.status !== 'scheduled') {
          throw Object.assign(new Error('只能调整自己尚未完成的课次'), { statusCode: 403 });
        }
        const [currentRoster, attendance] = await Promise.all([
          schedulingRepo.listSessionRoster(app.db, session.id),
          attendanceRepo.listAttendanceForSession(app.db, session.id),
        ]);
        const currentRosterEntry = currentRoster.find(
          (entry) => entry.studentId === body.studentId,
        );
        const course = await catalogRepo.requireCourse(app.db, session.courseId);
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        const billingCourseId = body.billingCourseId ?? session.courseId;
        if (
          attendance.some((record) => record.studentId === body.studentId) &&
          currentRosterEntry &&
          currentRosterEntry.billingCourseId !== billingCourseId
        ) {
          throw Object.assign(new Error('该学员已点名，不能修改扣课档案'), {
            statusCode: 422,
          });
        }
        const [student, billingCourse, lessonAccount] = await Promise.all([
          peopleRepo.requireStudent(app.db, body.studentId),
          catalogRepo.requireCourse(app.db, billingCourseId),
          app.db
            .select()
            .from(schema.lessonAccounts)
            .where(
              and(
                eq(schema.lessonAccounts.studentId, body.studentId),
                eq(schema.lessonAccounts.courseId, billingCourseId),
              ),
            )
            .limit(1),
        ]);
        requireCourseInTeacherInstitution(billingCourse, dataScope.institutionId);
        if (student.status !== 'active' || lessonAccount.length === 0) {
          throw Object.assign(new Error('该学员没有所选扣课档案'), { statusCode: 422 });
        }
        let source: 'enrollment' | 'session_only' = 'session_only';
        if (body.enrollmentMode === 'class') {
          if (!session.classId) {
            throw Object.assign(new Error('临时课次不能将学员正式加入班级'), {
              statusCode: 422,
            });
          }
          const classGroup = await schedulingRepo.findClass(app.db, session.classId);
          if (!classGroup) throw notFound('Class not found');
          const enrollments = await schedulingRepo.listEnrollments(app.db, classGroup.id);
          const existingEnrollment = enrollments.find((item) => item.studentId === student.id);
          if (!existingEnrollment) {
            requireTeacherPermission(access.permissions, 'enrollStudents');
            if (classGroup.teacherId !== access.teacherId && !access.isAdminTeacher) {
              throw Object.assign(new Error('无权操作该班级'), { statusCode: 403 });
            }
            if (enrollments.length >= classGroup.capacity) {
              throw Object.assign(new Error('班级已满'), { statusCode: 409 });
            }
            await schedulingRepo.createEnrollment(app.db, {
              classId: classGroup.id,
              studentId: student.id,
              billingCourseId,
              active: true,
            });
          }
          source = 'enrollment';
        }
        await ensureSessionRosterSnapshot(session.id);
        const rosterStudent = await schedulingRepo.upsertSessionStudent(app.db, {
          classSessionId: session.id,
          studentId: student.id,
          billingCourseId,
          source,
          active: true,
        });
        const temporaryStudent = await schedulingRepo.findTemporaryStudent(app.db, {
          sessionId: session.id,
          studentId: student.id,
        });
        if (source === 'session_only' && !temporaryStudent) {
          await schedulingRepo.createTemporaryStudent(app.db, {
            classSessionId: session.id,
            studentId: student.id,
            billingCourseId,
            note: '老师临时添加',
          });
        }
        return { rosterStudent };
      },
    );

    app.delete(
      '/public/teacher/class-sessions/:sessionId/students/:studentId',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId, studentId } = request.params as {
          sessionId: string;
          studentId: string;
        };
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        requireTeacherPermission(access.permissions, 'manageSessionRoster');
        const owned = await requireOwnedSession(request.account!.id, sessionId);
        const session = owned.session;
        if ((!owned.isMine && !access.isAdminTeacher) || session.status !== 'scheduled') {
          throw Object.assign(new Error('只能调整自己尚未完成的课次'), { statusCode: 403 });
        }
        const course = await catalogRepo.requireCourse(app.db, session.courseId);
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        const attendance = await attendanceRepo.listAttendanceForSession(app.db, session.id);
        if (attendance.some((record) => record.studentId === studentId)) {
          throw Object.assign(new Error('该学员已经点名，不能移出课次'), { statusCode: 422 });
        }
        await ensureSessionRosterSnapshot(session.id);
        const rosterStudent = await schedulingRepo.removeSessionStudent(app.db, {
          sessionId: session.id,
          studentId,
        });
        if (!rosterStudent) throw notFound('Session student not found');
        const temporaryStudent = await schedulingRepo.findTemporaryStudent(app.db, {
          sessionId: session.id,
          studentId,
        });
        if (temporaryStudent) {
          await schedulingRepo.removeTemporaryStudent(app.db, {
            sessionId: session.id,
            temporaryStudentId: temporaryStudent.id,
          });
        }
        return { rosterStudent };
      },
    );

    app.get(
      '/public/teacher/dashboard',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const account = { ...access.account, teacherId: access.teacherId };
        const dataScope = await resolveTeacherDataScope(access);

        const [
          sessions,
          classes,
          courses,
          classrooms,
          campuses,
          students,
          attendanceRecords,
          lessonAccounts,
        ] = await Promise.all([
          schedulingRepo.listClassSessions(app.db),
          schedulingRepo.listClasses(app.db),
          catalogRepo.listCourses(app.db),
          teachingRepo.listClassrooms(app.db),
          organizationRepo.listCampuses(app.db),
          peopleRepo.listStudents(app.db),
          app.db.select().from(schema.attendanceRecords),
          app.db.select().from(schema.lessonAccounts),
        ]);
        const classById = new Map(classes.map((item) => [item.id, item]));
        const courseById = new Map(courses.map((item) => [item.id, item]));
        const classroomById = new Map(classrooms.map((item) => [item.id, item]));
        const campusById = new Map(campuses.map((item) => [item.id, item]));
        const studentById = new Map(students.map((item) => [item.id, item]));
        const lessonAccountByStudentCourse = new Map(
          lessonAccounts.map((item) => [`${item.studentId}:${item.courseId}`, item]),
        );
        const institutionCourseIds = new Set(
          courses
            .filter((course) => courseBelongsToTeacherInstitution(course, dataScope.institutionId))
            .map((course) => course.id),
        );
        const institutionLessonAccountIds = lessonAccounts
          .filter((lessonAccount) => institutionCourseIds.has(lessonAccount.courseId))
          .map((lessonAccount) => lessonAccount.id);
        const lessonTransactions =
          institutionLessonAccountIds.length > 0
            ? await app.db
                .select()
                .from(schema.lessonTransactions)
                .where(
                  and(
                    eq(schema.lessonTransactions.type, 'consume'),
                    inArray(schema.lessonTransactions.lessonAccountId, institutionLessonAccountIds),
                  ),
                )
            : [];
        const consumedByLessonAccountId = consumedLessonsByAccountId(lessonTransactions);
        const assignedSessionIds = await listAssignedSessionIdsForTeacher(account.teacherId);
        const assignedClassIds = new Set(
          sessions
            .filter(
              (session) =>
                session.classId &&
                isTeacherAssignedToSession(session, account.teacherId, assignedSessionIds),
            )
            .map((session) => session.classId!),
        );
        const visibleClasses = classes.filter(
          (classGroup) =>
            institutionCourseIds.has(classGroup.courseId) &&
            (dataScope.visibleTeacherIds.has(classGroup.teacherId) ||
              assignedClassIds.has(classGroup.id)),
        );
        const visibleClassIds = new Set(visibleClasses.map((classGroup) => classGroup.id));
        const visibleSessions = sessions.filter(
          (session) =>
            institutionCourseIds.has(session.courseId) &&
            (isTeacherAssignedToSession(session, account.teacherId!, assignedSessionIds) ||
              dataScope.visibleTeacherIds.has(session.teacherId) ||
              Boolean(session.classId && visibleClassIds.has(session.classId))),
        );
        const enrollmentsByClassId = new Map<
          string,
          Awaited<ReturnType<typeof schedulingRepo.listEnrollments>>
        >();

        const classCards = await Promise.all(
          visibleClasses.map(async (classGroup) => {
            const enrollments = await schedulingRepo.listEnrollments(app.db, classGroup.id);
            enrollmentsByClassId.set(classGroup.id, enrollments);
            const teacher = dataScope.teacherById.get(classGroup.teacherId);
            return {
              ...classGroup,
              isMine: classGroup.teacherId === access.teacherId,
              teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
              course: courseById.get(classGroup.courseId),
              classroom: classroomById.get(classGroup.classroomId),
              campus: campusById.get(classGroup.campusId) ?? null,
              students: enrollments.flatMap((enrollment) => {
                const student = studentById.get(enrollment.studentId);
                if (!student) return [];
                return [
                  {
                    id: student.id,
                    name: student.name,
                    grade: student.grade,
                    school: student.school,
                    status: student.status,
                    billingCourseId: enrollment.billingCourseId,
                    billingCourseName:
                      courseById.get(enrollment.billingCourseId)?.name ?? '课时档案',
                    lessonBalance:
                      lessonAccountByStudentCourse.get(
                        `${student.id}:${enrollment.billingCourseId}`,
                      )?.balance ?? null,
                  },
                ];
              }),
            };
          }),
        );
        const visibleSessionClassIds = new Set(visibleSessions.map((session) => session.classId));
        for (const classId of visibleSessionClassIds) {
          if (!classId) continue;
          if (!enrollmentsByClassId.has(classId)) {
            enrollmentsByClassId.set(
              classId,
              await schedulingRepo.listEnrollments(app.db, classId),
            );
          }
        }
        const visibleSessionIds = visibleSessions.map((session) => session.id);
        const sessionRosters = await Promise.all(
          visibleSessionIds.map(async (sessionId) => ({
            sessionId,
            roster: await schedulingRepo.listSessionRoster(app.db, sessionId),
          })),
        );
        const rosterCountBySessionId = new Map(
          sessionRosters.map((item) => [item.sessionId, item.roster.length]),
        );

        const ownClassIds = new Set(
          visibleClasses
            .filter((classGroup) => classGroup.teacherId === access.teacherId)
            .map((classGroup) => classGroup.id),
        );
        const ownStudentIds = new Set<string>();
        for (const [classId, enrollments] of enrollmentsByClassId) {
          if (!ownClassIds.has(classId)) continue;
          for (const enrollment of enrollments) ownStudentIds.add(enrollment.studentId);
        }
        for (const item of sessionRosters) {
          const session = visibleSessions.find((candidate) => candidate.id === item.sessionId);
          if (
            session &&
            isTeacherAssignedToSession(session, access.teacherId, assignedSessionIds)
          ) {
            for (const rosterEntry of item.roster) ownStudentIds.add(rosterEntry.studentId);
          }
        }

        const visibleCourseIds = new Set(institutionCourseIds);
        const visibleStudentIds = new Set(
          Array.from(enrollmentsByClassId.values())
            .flat()
            .map((enrollment) => enrollment.studentId),
        );
        if (access.isAdminTeacher) {
          for (const student of students) {
            if (student.status !== 'archived') {
              visibleStudentIds.add(student.id);
            }
          }
          for (const lessonAccount of lessonAccounts) {
            if (visibleCourseIds.has(lessonAccount.courseId)) {
              visibleStudentIds.add(lessonAccount.studentId);
            }
          }
        }
        const studentClasses = new Map<
          string,
          Array<{
            id: string;
            name: string;
            isMine: boolean;
            teacher: { id: string; name: string } | null;
            campus: { id: string; name: string } | null;
          }>
        >();
        for (const classGroup of visibleClasses) {
          const teacher = dataScope.teacherById.get(classGroup.teacherId);
          for (const enrollment of enrollmentsByClassId.get(classGroup.id) ?? []) {
            studentClasses.set(enrollment.studentId, [
              ...(studentClasses.get(enrollment.studentId) ?? []),
              {
                id: classGroup.id,
                name: classGroup.name,
                isMine: classGroup.teacherId === access.teacherId,
                teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
                campus: campusById.has(classGroup.campusId)
                  ? {
                      id: classGroup.campusId,
                      name: campusById.get(classGroup.campusId)!.name,
                    }
                  : null,
              },
            ]);
          }
        }
        const dashboardStudents = students
          .filter((student) => visibleStudentIds.has(student.id) && student.status !== 'archived')
          .map((student) => ({
            id: student.id,
            name: student.name,
            grade: student.grade,
            school: student.school,
            status: student.status,
            institution: dataScope.institutionId
              ? {
                  id: dataScope.institutionId,
                  name: dataScope.institution?.name ?? '所属机构',
                }
              : null,
            isMyStudent: ownStudentIds.has(student.id),
            classes: studentClasses.get(student.id) ?? [],
            lessonAccounts: lessonAccounts
              .filter(
                (lessonAccount) =>
                  lessonAccount.studentId === student.id &&
                  visibleCourseIds.has(lessonAccount.courseId),
              )
              .map((lessonAccount) => ({
                id: lessonAccount.id,
                courseId: lessonAccount.courseId,
                courseName: courseById.get(lessonAccount.courseId)?.name ?? '课程',
                balance: lessonAccount.balance,
                totalLessons: totalLessonsForAccount(lessonAccount, consumedByLessonAccountId),
              })),
          }))
          .sort(
            (a, b) =>
              Number(b.isMyStudent) - Number(a.isMyStudent) ||
              a.name.localeCompare(b.name, 'zh-CN'),
          );

        return {
          students: dashboardStudents,
          sessions: visibleSessions.map((session) => {
            const classGroup = session.classId ? classById.get(session.classId) : null;
            const teacher = dataScope.teacherById.get(session.teacherId);
            const sessionAttendance = attendanceRecords.filter(
              (record) => record.classSessionId === session.id,
            );
            return {
              ...session,
              isMine: isTeacherAssignedToSession(session, access.teacherId, assignedSessionIds),
              teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
              class: classGroup ? { name: classGroup.name } : undefined,
              course: courseById.get(session.courseId),
              classroom: classroomById.get(session.classroomId),
              rosterCount: rosterCountBySessionId.get(session.id) ?? 0,
              attendanceCount: sessionAttendance.length,
              attendanceSummary: summarizeAttendance(sessionAttendance),
            };
          }),
          classes: classCards,
          scope: {
            isInstitutionWide: access.isAdminTeacher,
            institutionId: dataScope.institutionId,
          },
        };
      },
    );

    app.get(
      '/public/teacher/notifications',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        const query = teacherNotificationQuerySchema.parse(request.query);
        const service = new NotificationsService(app.db);
        const [items, courses, classes] = await Promise.all([
          service.listForRecipient({
            recipientType: 'staff',
            recipientId: request.account!.id,
            status: query.status,
            limit: query.limit ?? 50,
          }),
          catalogRepo.listCourses(app.db),
          schedulingRepo.listClasses(app.db),
        ]);
        const institutionCourseIds = new Set(
          courses
            .filter((course) => courseBelongsToTeacherInstitution(course, dataScope.institutionId))
            .map((course) => course.id),
        );
        const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
        return {
          notifications: items.filter((item) => {
            if (!item.category.startsWith('teacher.')) return false;
            const meta = (item.meta ?? {}) as Record<string, unknown>;
            const courseId = typeof meta.courseId === 'string' ? meta.courseId : '';
            const classId = typeof meta.classId === 'string' ? meta.classId : '';
            if (courseId && !institutionCourseIds.has(courseId)) return false;
            if (classId) {
              const classGroup = classById.get(classId);
              if (!classGroup || !institutionCourseIds.has(classGroup.courseId)) return false;
            }
            return true;
          }),
        };
      },
    );

    app.post(
      '/public/teacher/notifications/:notificationId/read',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { notificationId } = request.params as { notificationId: string };
        const service = new NotificationsService(app.db);
        const item = await service.markAsRead(notificationId, request.account!.id);
        if (!item || !item.category.startsWith('teacher.')) {
          throw notFound('Notification not found');
        }
        return { notification: item };
      },
    );

    app.get(
      '/public/teacher/students/:studentId/class-options',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { studentId } = request.params as { studentId: string };
        const access = await requireTeacherAccessForAccount(request.account!.id);
        requireTeacherPermission(access.permissions, 'enrollStudents');
        const query = teacherClassOptionsQuerySchema.parse(request.query);
        const options = await loadTeacherClassOptions({
          accountId: request.account!.id,
          studentId,
          courseId: query.courseId,
        });
        return {
          student: options.student,
          lessonAccounts: options.lessonAccounts,
          classes: options.classes,
        };
      },
    );

    app.post(
      '/public/teacher/students/:studentId/enrollments',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { studentId } = request.params as { studentId: string };
        const body = teacherEnrollmentSchema.parse(request.body);
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const dataScope = await resolveTeacherDataScope(access);
        requireTeacherPermission(access.permissions, 'enrollStudents');
        const account = { ...access.account, teacherId: access.teacherId };
        const classGroup = await schedulingRepo.findClass(app.db, body.classId);
        if (!classGroup) throw notFound('Class not found');
        if (classGroup.teacherId !== account.teacherId) {
          throw Object.assign(new Error('无权操作该班级'), { statusCode: 403 });
        }
        const course = await catalogRepo.requireCourse(app.db, classGroup.courseId);
        requireCourseInTeacherInstitution(course, dataScope.institutionId);
        if (!['recruiting', 'active'].includes(classGroup.status)) {
          throw Object.assign(new Error('只能分入招生中或开课中班级'), { statusCode: 422 });
        }

        await peopleRepo.requireStudent(app.db, studentId);
        const billingCourseId = body.billingCourseId ?? classGroup.courseId;
        const billingCourse = await catalogRepo.requireCourse(app.db, billingCourseId);
        requireCourseInTeacherInstitution(billingCourse, dataScope.institutionId);
        const [lessonAccount] = await app.db
          .select()
          .from(schema.lessonAccounts)
          .where(
            and(
              eq(schema.lessonAccounts.studentId, studentId),
              eq(schema.lessonAccounts.courseId, billingCourseId),
            ),
          )
          .limit(1);
        if (!lessonAccount) {
          throw Object.assign(new Error('该学员暂无所选扣课档案'), { statusCode: 422 });
        }

        const allClasses = await schedulingRepo.listClasses(app.db);
        const sameCourseClasses = allClasses.filter(
          (item) => item.courseId === classGroup.courseId,
        );
        const sameCourseEnrollments = (
          await Promise.all(
            sameCourseClasses.map((item) => schedulingRepo.listEnrollments(app.db, item.id)),
          )
        ).flat();
        const existingSameCourseEnrollment = sameCourseEnrollments.find(
          (enrollment) => enrollment.studentId === studentId,
        );
        if (existingSameCourseEnrollment) {
          throw Object.assign(
            new Error(
              existingSameCourseEnrollment.classId === classGroup.id
                ? '该学员已在此班'
                : '该学员已在同课程其他班级，需管理员调整',
            ),
            { statusCode: 409 },
          );
        }

        const enrolledCount = await schedulingRepo.countActiveEnrollments(app.db, classGroup.id);
        if (enrolledCount >= classGroup.capacity) {
          throw Object.assign(new Error('班级已满'), { statusCode: 409 });
        }

        const enrollment = await schedulingRepo.createEnrollment(app.db, {
          classId: classGroup.id,
          studentId,
          billingCourseId,
          active: true,
        });

        if (body.notificationId) {
          await new NotificationsService(app.db).markAsRead(
            body.notificationId,
            request.account!.id,
          );
        }

        return { enrollment };
      },
    );

    app.get(
      '/public/teacher/calendar',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const access = await requireTeacherAccessForAccount(request.account!.id);
        const account = { ...access.account, teacherId: access.teacherId };
        const dataScope = await resolveTeacherDataScope(access);
        const query = teacherCalendarQuerySchema.parse(request.query);
        const from = query.from ? new Date(query.from) : undefined;
        const to = query.to ? new Date(query.to) : undefined;

        const [sessions, trialSessions, classes, courses, classrooms, campuses, attendanceRecords] =
          await Promise.all([
            schedulingRepo.listClassSessions(app.db),
            trialRepo.listTrialSessions(app.db),
            schedulingRepo.listClasses(app.db),
            catalogRepo.listCourses(app.db),
            teachingRepo.listClassrooms(app.db),
            organizationRepo.listCampuses(app.db),
            app.db.select().from(schema.attendanceRecords),
          ]);
        const classById = new Map(classes.map((item) => [item.id, item]));
        const courseById = new Map(courses.map((item) => [item.id, item]));
        const classroomById = new Map(classrooms.map((item) => [item.id, item]));
        const campusById = new Map(campuses.map((item) => [item.id, item]));
        const assignedSessionIds = await listAssignedSessionIdsForTeacher(account.teacherId);
        const institutionCourseIds = new Set(
          courses
            .filter((course) => courseBelongsToTeacherInstitution(course, dataScope.institutionId))
            .map((course) => course.id),
        );
        const visibleClassIds = new Set(
          classes
            .filter(
              (classGroup) =>
                institutionCourseIds.has(classGroup.courseId) &&
                dataScope.visibleTeacherIds.has(classGroup.teacherId),
            )
            .map((classGroup) => classGroup.id),
        );
        const visibleSessions = sessions.filter(
          (session) =>
            institutionCourseIds.has(session.courseId) &&
            (isTeacherAssignedToSession(session, account.teacherId!, assignedSessionIds) ||
              dataScope.visibleTeacherIds.has(session.teacherId) ||
              Boolean(session.classId && visibleClassIds.has(session.classId))),
        );
        const mySessionIds = visibleSessions.map((session) => session.id);
        const rosterCounts = await Promise.all(
          mySessionIds.map(async (sessionId) => ({
            sessionId,
            count: (await schedulingRepo.listSessionRoster(app.db, sessionId)).length,
          })),
        );
        const rosterCountBySessionId = new Map(
          rosterCounts.map((item) => [item.sessionId, item.count]),
        );
        const visibleTrialSessions = trialSessions.filter(
          (session) =>
            institutionCourseIds.has(session.courseId) &&
            Boolean(session.teacherId) &&
            (session.teacherId === access.teacherId ||
              (access.isAdminTeacher && dataScope.visibleTeacherIds.has(session.teacherId!))),
        );

        return {
          events: [
            ...visibleSessions
              .filter((session) => overlapsRange(session, from, to))
              .map((session) => {
                const classGroup = session.classId ? classById.get(session.classId) : null;
                const course = courseById.get(session.courseId);
                const classroom = classroomById.get(session.classroomId);
                const teacher = dataScope.teacherById.get(session.teacherId);
                const sessionAttendance = attendanceRecords.filter(
                  (record) => record.classSessionId === session.id,
                );
                return {
                  id: session.id,
                  type: 'class_session',
                  title: session.topic,
                  startsAt: session.startsAt,
                  endsAt: session.endsAt,
                  status: session.status,
                  isMine: isTeacherAssignedToSession(session, access.teacherId, assignedSessionIds),
                  teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
                  class: classGroup
                    ? {
                        id: classGroup.id,
                        name: classGroup.name,
                        isMine: classGroup.teacherId === access.teacherId,
                      }
                    : null,
                  course: course ? { id: course.id, name: course.name } : null,
                  classroom: classroom ? { id: classroom.id, name: classroom.name } : null,
                  lessonUnits: session.lessonUnits,
                  sessionType: session.sessionType,
                  rosterCount: rosterCountBySessionId.get(session.id) ?? 0,
                  attendanceCount: sessionAttendance.length,
                  attendanceSummary: summarizeAttendance(sessionAttendance),
                };
              }),
            ...visibleTrialSessions
              .filter((session) => overlapsRange(session, from, to))
              .map((session) => {
                const course = courseById.get(session.courseId);
                const campus = campusById.get(session.campusId);
                const teacher = session.teacherId
                  ? dataScope.teacherById.get(session.teacherId)
                  : null;
                return {
                  id: session.id,
                  type: 'trial_session',
                  title: session.title,
                  startsAt: session.startsAt,
                  endsAt: session.endsAt,
                  status: normalizeTrialStatus(session.status, session.endsAt),
                  isMine: session.teacherId === access.teacherId,
                  teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
                  class: null,
                  course: course ? { id: course.id, name: course.name } : null,
                  classroom: campus ? { id: campus.id, name: campus.name } : null,
                  lessonUnits: 0,
                  sessionType: 'trial',
                  rosterCount: session.bookedCount,
                  attendanceCount: 0,
                  attendanceSummary: summarizeAttendance([]),
                };
              }),
          ].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime()),
        };
      },
    );

    // Ordinary teachers can only operate their own sessions. A teacher who also
    // has the administrator role can operate institution sessions while staying
    // in the teacher workbench.
    async function requireOwnedSession(accountId: string, sessionId: string) {
      const access = await requireTeacherAccessForAccount(accountId);
      const account = { ...access.account, teacherId: access.teacherId };
      const dataScope = await resolveTeacherDataScope(access);
      const session = await schedulingRepo.findSession(app.db, sessionId);
      if (!session) {
        throw notFound('Class session not found');
      }
      const course = await catalogRepo.requireCourse(app.db, session.courseId);
      requireCourseInTeacherInstitution(course, dataScope.institutionId);
      const assignments = await schedulingRepo.listClassSessionTeachers(app.db, [sessionId]);
      const assigned = assignments.some((assignment) => assignment.teacherId === account.teacherId);
      const classGroup = session.classId
        ? await schedulingRepo.findClass(app.db, session.classId)
        : null;
      const institutionVisible =
        access.isAdminTeacher &&
        (dataScope.visibleTeacherIds.has(session.teacherId) ||
          Boolean(classGroup && dataScope.visibleTeacherIds.has(classGroup.teacherId)));
      if (session.teacherId !== account.teacherId && !assigned && !institutionVisible) {
        throw Object.assign(new Error('无权操作该课次'), { statusCode: 403 });
      }
      return {
        account,
        session,
        isMine: session.teacherId === account.teacherId || assigned,
      };
    }

    async function loadTeacherClassOptions(input: {
      accountId: string;
      studentId: string;
      courseId?: string;
    }) {
      const access = await requireTeacherAccessForAccount(input.accountId);
      const account = { ...access.account, teacherId: access.teacherId };
      const dataScope = await resolveTeacherDataScope(access);
      const [student, allClasses, courses, classrooms, lessonAccounts] = await Promise.all([
        peopleRepo.requireStudent(app.db, input.studentId),
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        teachingRepo.listClassrooms(app.db),
        app.db
          .select()
          .from(schema.lessonAccounts)
          .where(eq(schema.lessonAccounts.studentId, input.studentId)),
      ]);

      const institutionCourseIds = new Set(
        courses
          .filter((course) => courseBelongsToTeacherInstitution(course, dataScope.institutionId))
          .map((course) => course.id),
      );
      if (input.courseId && !institutionCourseIds.has(input.courseId)) {
        throw Object.assign(new Error('无权查看其他机构的课程'), { statusCode: 403 });
      }
      const institutionLessonAccounts = lessonAccounts.filter((item) =>
        institutionCourseIds.has(item.courseId),
      );
      if (institutionLessonAccounts.length === 0) {
        throw Object.assign(new Error('无权查看其他机构的学员'), { statusCode: 403 });
      }
      const lessonCourseIds = new Set(institutionLessonAccounts.map((item) => item.courseId));
      const targetCourseIds = input.courseId ? new Set([input.courseId]) : lessonCourseIds;
      if (input.courseId && !lessonCourseIds.has(input.courseId)) {
        throw Object.assign(new Error('该学员暂无此课程的正式课时档案'), { statusCode: 422 });
      }

      const myClasses = allClasses.filter(
        (classGroup) =>
          classGroup.teacherId === account.teacherId &&
          institutionCourseIds.has(classGroup.courseId) &&
          targetCourseIds.has(classGroup.courseId) &&
          ['recruiting', 'active'].includes(classGroup.status),
      );
      const enrollmentsByClassId = new Map<
        string,
        Awaited<ReturnType<typeof schedulingRepo.listEnrollments>>
      >();
      for (const classGroup of myClasses) {
        enrollmentsByClassId.set(
          classGroup.id,
          await schedulingRepo.listEnrollments(app.db, classGroup.id),
        );
      }
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]));
      return {
        account,
        student,
        lessonAccounts: institutionLessonAccounts.map((item) => ({
          ...item,
          course: courseById.get(item.courseId) ?? null,
        })),
        classes: myClasses.map((classGroup) => {
          const enrollments = enrollmentsByClassId.get(classGroup.id) ?? [];
          const enrolledCount = enrollments.length;
          const alreadyEnrolled = enrollments.some(
            (enrollment) => enrollment.studentId === input.studentId,
          );
          const capacityReached = enrolledCount >= classGroup.capacity;
          return {
            ...classGroup,
            course: courseById.get(classGroup.courseId) ?? null,
            classroom: classroomById.get(classGroup.classroomId) ?? null,
            enrolledCount,
            remainingSeats: Math.max(classGroup.capacity - enrolledCount, 0),
            alreadyEnrolled,
            canEnroll: !alreadyEnrolled && !capacityReached,
            disabledReason: alreadyEnrolled ? '已在班' : capacityReached ? '已满' : '',
          };
        }),
      };
    }

    async function loadTeacherHomeworkScope(accountId: string) {
      const access = await requireTeacherAccessForAccount(accountId);
      const account = { ...access.account, teacherId: access.teacherId };
      const dataScope = await resolveTeacherDataScope(access);

      const [classes, courses, students, sessions, teachers] = await Promise.all([
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        peopleRepo.listStudents(app.db),
        schedulingRepo.listClassSessions(app.db),
        teachingRepo.listTeachers(app.db),
      ]);
      const assignedSessionIds = await listAssignedSessionIdsForTeacher(account.teacherId);
      const institutionCourseIds = new Set(
        courses
          .filter((course) => courseBelongsToTeacherInstitution(course, dataScope.institutionId))
          .map((course) => course.id),
      );
      const assignedClassIds = new Set(
        sessions
          .filter(
            (session) =>
              session.classId &&
              isTeacherAssignedToSession(session, access.teacherId, assignedSessionIds),
          )
          .map((session) => session.classId!),
      );
      const scopedClasses = classes.filter(
        (classGroup) =>
          institutionCourseIds.has(classGroup.courseId) &&
          (dataScope.visibleTeacherIds.has(classGroup.teacherId) ||
            assignedClassIds.has(classGroup.id)),
      );
      const scopedClassIds = new Set(scopedClasses.map((classGroup) => classGroup.id));
      const mySessionIds = sessions
        .filter(
          (session) =>
            institutionCourseIds.has(session.courseId) &&
            Boolean(session.classId && scopedClassIds.has(session.classId)),
        )
        .map((session) => session.id);
      const temporaryStudents = await schedulingRepo.listTemporaryStudentsForSessions(
        app.db,
        mySessionIds,
      );
      const enrollments = (
        await Promise.all(
          scopedClasses.map((classGroup) => schedulingRepo.listEnrollments(app.db, classGroup.id)),
        )
      ).flat();
      const studentIds = new Set(enrollments.map((enrollment) => enrollment.studentId));
      for (const temporaryStudent of temporaryStudents) {
        studentIds.add(temporaryStudent.studentId);
      }
      const courseIds = new Set(scopedClasses.map((classGroup) => classGroup.courseId));
      const classIds = new Set(scopedClasses.map((classGroup) => classGroup.id));
      const ownClassIds = new Set(
        scopedClasses
          .filter((classGroup) => classGroup.teacherId === access.teacherId)
          .map((classGroup) => classGroup.id),
      );
      const classByStudentCourse = new Map<string, typeof schema.classes.$inferSelect>();

      for (const classGroup of scopedClasses) {
        const classEnrollments = enrollments.filter(
          (enrollment) => enrollment.classId === classGroup.id,
        );
        for (const enrollment of classEnrollments) {
          classByStudentCourse.set(`${enrollment.studentId}:${classGroup.courseId}`, classGroup);
        }
      }
      const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
      const sessionById = new Map(sessions.map((session) => [session.id, session]));
      for (const temporaryStudent of temporaryStudents) {
        const session = sessionById.get(temporaryStudent.classSessionId);
        const classGroup = session?.classId ? classById.get(session.classId) : null;
        if (classGroup) {
          classByStudentCourse.set(
            `${temporaryStudent.studentId}:${classGroup.courseId}`,
            classGroup,
          );
        }
      }

      return {
        account,
        teacherId: account.teacherId,
        ownClassIds,
        studentIds,
        courseIds,
        classIds,
        classByStudentCourse,
        classById,
        courseById: new Map(courses.map((course) => [course.id, course])),
        studentById: new Map(students.map((student) => [student.id, student])),
        sessionById,
        teacherById: new Map(teachers.map((teacher) => [teacher.id, teacher])),
      };
    }

    type TeacherHomeworkScope = Awaited<ReturnType<typeof loadTeacherHomeworkScope>>;

    async function notifyLearningSafely(
      input: Parameters<LearningNotificationService['notifyStudent']>[0],
    ) {
      try {
        await learningNotifications.notifyStudent(input);
      } catch (error) {
        app.log.warn(
          { err: error, sourceEventName: input.sourceEventName },
          'learning notification failed',
        );
      }
    }

    function studentName(scope: TeacherHomeworkScope, studentId: string) {
      return scope.studentById.get(studentId)?.name || '孩子';
    }

    function classCourseLabel(
      scope: TeacherHomeworkScope,
      classId?: string | null,
      courseId?: string | null,
    ) {
      const className = classId ? scope.classById.get(classId)?.name : '';
      const courseName = courseId ? scope.courseById.get(courseId)?.name : '';
      return [courseName, className].filter(Boolean).join(' · ') || '活动';
    }

    function canAccessHomework(
      scope: TeacherHomeworkScope,
      item: typeof schema.homeworkCheckIns.$inferSelect,
    ) {
      if (!scope.studentIds.has(item.studentId)) {
        return false;
      }
      if (item.classSessionId) {
        const session = scope.sessionById.get(item.classSessionId);
        if (!session || !session.classId || !scope.classIds.has(session.classId)) {
          return false;
        }
      }
      return Boolean(item.courseId && scope.courseIds.has(item.courseId));
    }

    function enrichTeacherHomework(
      scope: TeacherHomeworkScope,
      items: (typeof schema.homeworkCheckIns.$inferSelect)[],
    ) {
      return items.map((item) => {
        const session = item.classSessionId
          ? (scope.sessionById.get(item.classSessionId) ?? null)
          : null;
        const classGroup = session?.classId
          ? (scope.classById.get(session.classId) ?? null)
          : item.courseId
            ? (scope.classByStudentCourse.get(`${item.studentId}:${item.courseId}`) ?? null)
            : null;
        const reviewer = item.reviewedByTeacherId
          ? (scope.teacherById.get(item.reviewedByTeacherId) ?? null)
          : null;
        return {
          ...item,
          student: scope.studentById.get(item.studentId)
            ? {
                id: item.studentId,
                name: scope.studentById.get(item.studentId)!.name,
                grade: scope.studentById.get(item.studentId)!.grade,
              }
            : null,
          course: item.courseId ? (scope.courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          reviewer: reviewer ? { id: reviewer.id, name: reviewer.name } : null,
          isMine: Boolean(classGroup && scope.ownClassIds.has(classGroup.id)),
        };
      });
    }

    function canAccessLessonFeedback(
      scope: TeacherHomeworkScope,
      item: typeof schema.lessonFeedbacks.$inferSelect,
    ) {
      if (!scope.studentIds.has(item.studentId)) {
        return false;
      }
      const session = scope.sessionById.get(item.classSessionId);
      return Boolean(session?.classId && scope.classIds.has(session.classId));
    }

    function enrichTeacherLessonFeedbacks(
      scope: TeacherHomeworkScope,
      items: (typeof schema.lessonFeedbacks.$inferSelect)[],
    ) {
      return items.map((item) => {
        const session = scope.sessionById.get(item.classSessionId) ?? null;
        const classGroup = session?.classId ? (scope.classById.get(session.classId) ?? null) : null;
        const teacher = item.teacherId ? (scope.teacherById.get(item.teacherId) ?? null) : null;
        return {
          ...item,
          student: scope.studentById.get(item.studentId)
            ? {
                id: item.studentId,
                name: scope.studentById.get(item.studentId)!.name,
                grade: scope.studentById.get(item.studentId)!.grade,
              }
            : null,
          course: item.courseId ? (scope.courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
          isMine: Boolean(classGroup && scope.ownClassIds.has(classGroup.id)),
        };
      });
    }

    function enrichTeacherHomeworkAssignments(
      scope: TeacherHomeworkScope,
      items: (typeof schema.homeworkAssignments.$inferSelect)[],
    ) {
      return items.map((item) => {
        const session = scope.sessionById.get(item.classSessionId) ?? null;
        const classGroup = scope.classById.get(item.classId) ?? null;
        const teacher = item.teacherId ? (scope.teacherById.get(item.teacherId) ?? null) : null;
        return {
          ...item,
          student: item.studentId
            ? scope.studentById.get(item.studentId)
              ? {
                  id: item.studentId,
                  name: scope.studentById.get(item.studentId)!.name,
                  grade: scope.studentById.get(item.studentId)!.grade,
                }
              : null
            : null,
          course: item.courseId ? (scope.courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
          isMine: Boolean(classGroup && scope.ownClassIds.has(classGroup.id)),
        };
      });
    }

    function canAccessStudentWork(
      scope: TeacherHomeworkScope,
      item: typeof schema.studentWorks.$inferSelect,
    ) {
      if (!item.studentId) {
        return false;
      }
      if (!scope.studentIds.has(item.studentId)) {
        return false;
      }
      if (item.classSessionId) {
        const session = scope.sessionById.get(item.classSessionId);
        return Boolean(session?.classId && scope.classIds.has(session.classId));
      }
      if (item.classId) {
        return scope.classIds.has(item.classId);
      }
      return Boolean(item.courseId && scope.courseIds.has(item.courseId));
    }

    function enrichTeacherStudentWorks(
      scope: TeacherHomeworkScope,
      items: (typeof schema.studentWorks.$inferSelect)[],
    ) {
      return items.map((item) => {
        const session = item.classSessionId
          ? (scope.sessionById.get(item.classSessionId) ?? null)
          : null;
        const classGroup =
          (item.classId ? (scope.classById.get(item.classId) ?? null) : null) ??
          (session?.classId ? (scope.classById.get(session.classId) ?? null) : null) ??
          (item.studentId && item.courseId
            ? (scope.classByStudentCourse.get(`${item.studentId}:${item.courseId}`) ?? null)
            : null);
        const teacher =
          (item.teacherId ? (scope.teacherById.get(item.teacherId) ?? null) : null) ??
          (classGroup?.teacherId ? (scope.teacherById.get(classGroup.teacherId) ?? null) : null);
        return {
          ...item,
          student:
            item.studentId && scope.studentById.get(item.studentId)
              ? {
                  id: item.studentId,
                  name: scope.studentById.get(item.studentId)!.name,
                  grade: scope.studentById.get(item.studentId)!.grade,
                }
              : null,
          course: item.courseId ? (scope.courseById.get(item.courseId) ?? null) : null,
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
          isMine: Boolean(classGroup && scope.ownClassIds.has(classGroup.id)),
        };
      });
    }

    app.get(
      '/public/teacher/sessions/:sessionId/attendance',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const { session } = await requireOwnedSession(request.account!.id, sessionId);
        const [classGroup, attendanceRecords, allStudents, rosterEntries] = await Promise.all([
          session.classId
            ? schedulingRepo.findClass(app.db, session.classId)
            : Promise.resolve(null),
          attendanceRepo.listAttendanceForSession(app.db, sessionId),
          peopleRepo.listStudents(app.db),
          schedulingRepo.listSessionRoster(app.db, sessionId),
        ]);
        const studentById = new Map(allStudents.map((s) => [s.id, s]));
        const roster = rosterEntries
          .map((entry) => studentById.get(entry.studentId))
          .filter(Boolean)
          .map((student) => ({
            id: student!.id,
            name: student!.name,
            grade: student!.grade,
          }));
        return {
          session,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          roster,
          attendanceRecords,
        };
      },
    );

    app.post(
      '/public/teacher/sessions/:sessionId/attendance',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const { session } = await requireOwnedSession(request.account!.id, sessionId);
        if (session.status === 'cancelled') {
          throw Object.assign(new Error('已取消课次不能点名'), { statusCode: 422 });
        }
        const body = teacherAttendanceSchema.parse(request.body);
        const rosterEntries = await schedulingRepo.listSessionRoster(app.db, sessionId);
        const billingCourseMap = billingCourseByStudentId(rosterEntries);
        const rosterStudentIds = new Set(rosterEntries.map((entry) => entry.studentId));
        const invalidRecord = body.records.find(
          (record) => !rosterStudentIds.has(record.studentId),
        );
        if (invalidRecord) {
          throw Object.assign(new Error('只能为本班学员点名'), { statusCode: 400 });
        }
        const existingRecords = await attendanceRepo.listAttendanceForSession(app.db, sessionId);
        const existingByStudentId = new Map(
          existingRecords.map((record) => [record.studentId, record]),
        );
        const newRecords = body.records.filter(
          (record) => !existingByStudentId.has(record.studentId),
        );
        const correctionRecords = body.records.filter((record) =>
          existingByStudentId.has(record.studentId),
        );
        const createdRecords =
          newRecords.length > 0
            ? await attendanceRepo.recordAttendance(app.db, {
                sessionId,
                courseId: session.courseId,
                records: newRecords.map((record) => ({
                  ...record,
                  courseId: billingCourseMap.get(record.studentId),
                  lessonUnits: session.lessonUnits,
                })),
                completeSession: false,
              })
            : [];
        const correctedResults: NonNullable<
          Awaited<ReturnType<typeof attendanceRepo.updateAttendanceRecord>>
        >[] = [];
        for (const record of correctionRecords) {
          const billingCourseId = billingCourseMap.get(record.studentId);
          if (!billingCourseId) continue;
          const result = await attendanceRepo.updateAttendanceRecord(app.db, {
            sessionId,
            studentId: record.studentId,
            status: record.status,
            note: record.note?.trim() || null,
            deductLesson: record.deductLesson,
            lessonUnits: session.lessonUnits,
            courseId: billingCourseId,
          });
          if (result) correctedResults.push(result);
        }
        const correctedRecords = correctedResults.map((result) => result.attendanceRecord);
        const attendanceRecords = [...createdRecords, ...correctedRecords];
        await lessonNotifications.notifyLessonConsumedForAttendance({
          sessionId,
          records: [
            ...createdRecords,
            ...correctedResults
              .filter((result) => result.lessonDeltaAdjustment < 0)
              .map((result) => result.attendanceRecord),
          ],
          billingCourseIdByStudentId: billingCourseMap,
        });
        const latestAttendanceRecords = await attendanceRepo.listAttendanceForSession(
          app.db,
          sessionId,
        );
        const checkedStudentIds = new Set(
          latestAttendanceRecords.map((record) => record.studentId),
        );
        if (
          rosterStudentIds.size > 0 &&
          Array.from(rosterStudentIds).every((studentId) => checkedStudentIds.has(studentId))
        ) {
          await schedulingRepo.markSessionCompleted(app.db, sessionId);
        }
        return { attendanceRecords };
      },
    );

    app.get(
      '/public/teacher/lesson-feedbacks',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        const studentIds = Array.from(scope.studentIds);
        if (studentIds.length === 0) {
          return { lessonFeedbacks: [] };
        }

        const items = await app.db
          .select()
          .from(schema.lessonFeedbacks)
          .where(inArray(schema.lessonFeedbacks.studentId, studentIds))
          .orderBy(desc(schema.lessonFeedbacks.createdAt));

        return {
          lessonFeedbacks: enrichTeacherLessonFeedbacks(
            scope,
            items.filter((item) => canAccessLessonFeedback(scope, item)),
          ),
        };
      },
    );

    app.post(
      '/public/teacher/sessions/:sessionId/feedbacks',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { sessionId } = request.params as { sessionId: string };
        const { account, session } = await requireOwnedSession(request.account!.id, sessionId);
        const classGroup = session.classId
          ? await schedulingRepo.findClass(app.db, session.classId)
          : null;
        if (!classGroup) {
          throw notFound('Class not found');
        }

        const body = teacherLessonFeedbackSchema.parse(request.body);
        const rosterEntries = await schedulingRepo.listSessionRoster(app.db, sessionId);
        const rosterStudentIds = new Set(rosterEntries.map((entry) => entry.studentId));
        const invalidItem = [...body.items, ...body.studentAssignments].find(
          (item) => !rosterStudentIds.has(item.studentId),
        );
        if (invalidItem) {
          throw Object.assign(new Error('只能操作本班正式学员'), { statusCode: 400 });
        }

        const updatedItems = [];
        for (const item of body.items) {
          const [updated] = await app.db
            .insert(schema.lessonFeedbacks)
            .values({
              classSessionId: sessionId,
              studentId: item.studentId,
              teacherId: account.teacherId,
              courseId: classGroup.courseId,
              classId: classGroup.id,
              content: item.content,
              rating: item.rating,
              imageUrls: item.imageUrls,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [schema.lessonFeedbacks.classSessionId, schema.lessonFeedbacks.studentId],
              set: {
                teacherId: account.teacherId,
                courseId: classGroup.courseId,
                classId: classGroup.id,
                content: item.content,
                rating: item.rating,
                imageUrls: item.imageUrls,
                updatedAt: new Date(),
              },
            })
            .returning();
          updatedItems.push(updated);
        }

        if (body.classAssignmentContent) {
          await app.db
            .insert(schema.homeworkAssignments)
            .values({
              classSessionId: sessionId,
              classId: classGroup.id,
              courseId: classGroup.courseId,
              teacherId: account.teacherId,
              studentId: null,
              content: body.classAssignmentContent,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [schema.homeworkAssignments.classSessionId],
              targetWhere: isNull(schema.homeworkAssignments.studentId),
              set: {
                courseId: classGroup.courseId,
                classId: classGroup.id,
                teacherId: account.teacherId,
                content: body.classAssignmentContent,
                updatedAt: new Date(),
              },
            });
        } else {
          await app.db
            .delete(schema.homeworkAssignments)
            .where(
              and(
                eq(schema.homeworkAssignments.classSessionId, sessionId),
                isNull(schema.homeworkAssignments.studentId),
              ),
            );
        }

        for (const assignment of body.studentAssignments) {
          if (assignment.content) {
            await app.db
              .insert(schema.homeworkAssignments)
              .values({
                classSessionId: sessionId,
                classId: classGroup.id,
                courseId: classGroup.courseId,
                teacherId: account.teacherId,
                studentId: assignment.studentId,
                content: assignment.content,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [
                  schema.homeworkAssignments.classSessionId,
                  schema.homeworkAssignments.studentId,
                ],
                set: {
                  courseId: classGroup.courseId,
                  classId: classGroup.id,
                  teacherId: account.teacherId,
                  content: assignment.content,
                  updatedAt: new Date(),
                },
              });
          } else {
            await app.db
              .delete(schema.homeworkAssignments)
              .where(
                and(
                  eq(schema.homeworkAssignments.classSessionId, sessionId),
                  eq(schema.homeworkAssignments.studentId, assignment.studentId),
                ),
              );
          }
        }

        const scope = await loadTeacherHomeworkScope(request.account!.id);
        const assignments = await app.db
          .select()
          .from(schema.homeworkAssignments)
          .where(eq(schema.homeworkAssignments.classSessionId, sessionId))
          .orderBy(desc(schema.homeworkAssignments.updatedAt));
        const notificationStamp = Date.now();
        const lessonLabel = classCourseLabel(scope, classGroup.id, classGroup.courseId);
        await Promise.all([
          ...updatedItems.map((item) => {
            const ratingText = item.rating > 0 ? `，获得 ${item.rating} 星` : '';
            return notifyLearningSafely({
              studentId: item.studentId,
              studentName: studentName(scope, item.studentId),
              title: '课堂互动已更新',
              body: compactText(
                item.content ||
                  `${studentName(scope, item.studentId)} 的课堂表现已更新${ratingText}`,
                '课堂表现已更新',
              ),
              updateType: '课堂互动',
              page: '/pages/account-interactions/index',
              sourceEventName: 'learning.feedback',
              dedupeKey: `learning.feedback:${sessionId}:${item.studentId}:${notificationStamp}`,
              meta: {
                sessionId,
                studentId: item.studentId,
                courseId: classGroup.courseId,
                classId: classGroup.id,
              },
            });
          }),
          ...(body.classAssignmentContent
            ? rosterEntries.map((entry) =>
                notifyLearningSafely({
                  studentId: entry.studentId,
                  studentName: studentName(scope, entry.studentId),
                  title: '活动任务已布置',
                  body: compactText(body.classAssignmentContent, '有新的活动任务'),
                  updateType: '任务布置',
                  page: '/pages/account-homework/index',
                  sourceEventName: 'homework.assignment',
                  dedupeKey:
                    `homework.assignment:${sessionId}:class:` +
                    `${entry.studentId}:${notificationStamp}`,
                  meta: {
                    sessionId,
                    studentId: entry.studentId,
                    courseId: classGroup.courseId,
                    classId: classGroup.id,
                    scope: 'class',
                  },
                }),
              )
            : []),
          ...body.studentAssignments
            .filter((assignment) => assignment.content)
            .map((assignment) =>
              notifyLearningSafely({
                studentId: assignment.studentId,
                studentName: studentName(scope, assignment.studentId),
                title: '个人任务已布置',
                body: compactText(assignment.content, `${lessonLabel} 有新的个人任务`),
                updateType: '任务布置',
                page: '/pages/account-homework/index',
                sourceEventName: 'homework.assignment',
                dedupeKey: `homework.assignment:${sessionId}:${assignment.studentId}:${notificationStamp}`,
                meta: {
                  sessionId,
                  studentId: assignment.studentId,
                  courseId: classGroup.courseId,
                  classId: classGroup.id,
                  scope: 'student',
                },
              }),
            ),
        ]);
        return {
          lessonFeedbacks: enrichTeacherLessonFeedbacks(scope, updatedItems),
          homeworkAssignments: enrichTeacherHomeworkAssignments(scope, assignments),
        };
      },
    );

    app.get(
      '/public/teacher/homework-assignments',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        if (scope.classIds.size === 0) {
          return { homeworkAssignments: [] };
        }
        const items = await app.db
          .select()
          .from(schema.homeworkAssignments)
          .where(inArray(schema.homeworkAssignments.classId, Array.from(scope.classIds)))
          .orderBy(desc(schema.homeworkAssignments.createdAt));
        return { homeworkAssignments: enrichTeacherHomeworkAssignments(scope, items) };
      },
    );

    app.get(
      '/public/teacher/student-works',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        const studentIds = Array.from(scope.studentIds);
        if (studentIds.length === 0) {
          return { studentWorks: [] };
        }
        const items = await app.db
          .select()
          .from(schema.studentWorks)
          .where(inArray(schema.studentWorks.studentId, studentIds))
          .orderBy(desc(schema.studentWorks.createdAt));
        return {
          studentWorks: enrichTeacherStudentWorks(
            scope,
            items.filter((item) => canAccessStudentWork(scope, item)),
          ),
        };
      },
    );

    app.post(
      '/public/teacher/student-works',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const body = teacherStudentWorkSchema.parse(request.body);
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        if (!scope.studentIds.has(body.studentId)) {
          throw Object.assign(new Error('无权操作该成员'), { statusCode: 403 });
        }

        let courseId = body.courseId ?? null;
        let classId = body.classId ?? null;
        let teacherId = scope.teacherId ?? null;

        if (body.classSessionId) {
          const session = scope.sessionById.get(body.classSessionId);
          if (!session || !session.classId || !scope.classIds.has(session.classId)) {
            throw Object.assign(new Error('无权操作该安排'), { statusCode: 403 });
          }
          const classGroup = session.classId ? scope.classById.get(session.classId) : null;
          if (!classGroup) {
            throw notFound('Class not found');
          }
          classId = classGroup.id;
          courseId = classGroup.courseId;
          teacherId = session.teacherId ?? classGroup.teacherId ?? teacherId;
        } else if (classId) {
          const classGroup = scope.classById.get(classId);
          if (!classGroup || !scope.classIds.has(classId)) {
            throw Object.assign(new Error('无权操作该活动组'), { statusCode: 403 });
          }
          courseId = classGroup.courseId;
          teacherId = classGroup.teacherId ?? teacherId;
        } else if (courseId && !scope.courseIds.has(courseId)) {
          throw Object.assign(new Error('无权操作该活动'), { statusCode: 403 });
        } else if (!courseId) {
          const firstClass = Array.from(scope.classByStudentCourse.entries()).find(([key]) =>
            key.startsWith(`${body.studentId}:`),
          )?.[1];
          courseId = firstClass?.courseId ?? null;
          classId = firstClass?.id ?? null;
        }

        const candidate = {
          id: '',
          accountId: request.account!.id,
          studentId: body.studentId,
          courseId,
          classId,
          classSessionId: body.classSessionId ?? null,
          teacherId,
          title: body.title || '作品展示',
          description: body.description,
          imageUrls: body.imageUrls,
          frameStyle: body.frameStyle,
          source: 'teacher',
          status: 'published',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        if (!canAccessStudentWork(scope, candidate)) {
          throw Object.assign(new Error('无权发布该作品'), { statusCode: 403 });
        }

        const [item] = await app.db
          .insert(schema.studentWorks)
          .values({
            accountId: request.account!.id,
            studentId: body.studentId,
            courseId,
            classId,
            classSessionId: body.classSessionId ?? null,
            teacherId,
            title: body.title || '作品展示',
            description: body.description,
            imageUrls: body.imageUrls,
            frameStyle: body.frameStyle,
            source: 'teacher',
          })
          .returning();

        await notifyLearningSafely({
          studentId: item.studentId!,
          studentName: studentName(scope, item.studentId!),
          title: '作品已发布',
          body: compactText(
            `${studentName(scope, item.studentId!)} 的作品「${item.title || '作品展示'}」已发布`,
            '作品已发布',
          ),
          updateType: '作品展示',
          page: '/pages/account-gallery/index',
          level: 'success',
          sourceEventName: 'student.work.published',
          dedupeKey: `student.work.published:${item.id}`,
          meta: {
            studentWorkId: item.id,
            studentId: item.studentId,
            courseId: item.courseId,
            classId: item.classId,
          },
        });

        return {
          studentWork: enrichTeacherStudentWorks(scope, [item])[0],
          message: '作品已发布',
        };
      },
    );

    app.post(
      '/public/teacher/upload-token',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const body = teacherUploadTokenSchema.parse(request.body);
        const qiniu = new QiniuSettingsService(app.db, app.appEnv);
        return qiniu.createUploadToken({ filename: body.filename, prefix: 'teacher-works' });
      },
    );

    app.get(
      '/public/teacher/homework-check-ins',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        const studentIds = Array.from(scope.studentIds);
        if (studentIds.length === 0) {
          return { homeworkCheckIns: [] };
        }

        const items = await app.db
          .select()
          .from(schema.homeworkCheckIns)
          .where(inArray(schema.homeworkCheckIns.studentId, studentIds))
          .orderBy(desc(schema.homeworkCheckIns.createdAt));

        return {
          homeworkCheckIns: enrichTeacherHomework(
            scope,
            items.filter((item) => canAccessHomework(scope, item)),
          ),
        };
      },
    );

    app.post(
      '/public/teacher/homework-check-ins/:homeworkCheckInId/review',
      { preHandler: app.requireRole('teacher') },
      async (request) => {
        const { homeworkCheckInId } = request.params as { homeworkCheckInId: string };
        const body = teacherHomeworkReviewSchema.parse(request.body);
        const scope = await loadTeacherHomeworkScope(request.account!.id);
        const [item] = await app.db
          .select()
          .from(schema.homeworkCheckIns)
          .where(eq(schema.homeworkCheckIns.id, homeworkCheckInId))
          .limit(1);
        if (!item) {
          throw notFound('Homework check-in not found');
        }
        if (!canAccessHomework(scope, item)) {
          throw Object.assign(new Error('无权批阅该作业打卡'), { statusCode: 403 });
        }

        const [updated] = await app.db
          .update(schema.homeworkCheckIns)
          .set({
            reviewStatus: body.reviewStatus,
            teacherFeedback: body.teacherFeedback,
            rating: body.rating,
            reviewedByTeacherId: scope.teacherId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.homeworkCheckIns.id, homeworkCheckInId),
              inArray(schema.homeworkCheckIns.studentId, Array.from(scope.studentIds)),
            ),
          )
          .returning();
        if (!updated) {
          throw notFound('Homework check-in not found');
        }

        const reviewStatusText = body.reviewStatus === 'needs_revision' ? '需要订正' : '已批阅';
        const ratingText = body.rating > 0 ? `，${body.rating} 星` : '';
        await notifyLearningSafely({
          studentId: updated.studentId,
          studentName: studentName(scope, updated.studentId),
          title: '任务批阅已更新',
          body: compactText(
            body.teacherFeedback || `老师已批阅打卡，结果：${reviewStatusText}${ratingText}`,
            '任务批阅已更新',
          ),
          updateType: '任务批阅',
          page: '/pages/account-homework/index',
          sourceEventName: 'homework.review',
          dedupeKey: `homework.review:${homeworkCheckInId}:${updated.updatedAt.getTime()}`,
          meta: {
            homeworkCheckInId,
            studentId: updated.studentId,
            courseId: updated.courseId,
            classSessionId: updated.classSessionId,
            reviewStatus: updated.reviewStatus,
          },
        });

        return { homeworkCheckIn: enrichTeacherHomework(scope, [updated])[0] };
      },
    );

    app.get('/v1/teachers', { preHandler: app.requireAdmin }, async () => {
      const teachers = await teachingRepo.listTeachers(app.db);
      return { teachers: teachers.map(toTeacherDto) };
    });

    // When a teacher resource carries a phone number, provision a teacher login
    // account: password = last 6 of the phone, forced change on first login.
    // Idempotent — skips when the teacher already has an account; refuses (with a
    // warning, not a hard error) when the phone already belongs to someone else.
    async function ensureTeacherAccount(teacher: typeof schema.teachers.$inferSelect): Promise<{
      accountCreated: boolean;
      defaultPassword?: string;
      accountWarning?: string;
    }> {
      const phone = teacher.phone?.trim();
      const password = defaultPasswordFromPhone(phone);
      if (!phone || !password) {
        return { accountCreated: false };
      }
      if (await accountsRepo.findByTeacherId(app.db, teacher.id)) {
        return { accountCreated: false };
      }
      if (await accountsRepo.findByPhone(app.db, phone)) {
        return {
          accountCreated: false,
          accountWarning: '该手机号已被其他账号占用，未自动创建老师账号',
        };
      }
      try {
        await accountsRepo.createAccount(app.db, {
          role: 'teacher',
          phone,
          displayName: teacher.name,
          passwordHash: hashPassword(password),
          teacherId: teacher.id,
          mustChangePassword: true,
        });
        return { accountCreated: true, defaultPassword: password };
      } catch (error) {
        app.log.error(
          { err: error, teacherId: teacher.id },
          'failed to auto-create teacher account',
        );
        return {
          accountCreated: false,
          accountWarning: '自动创建老师账号失败，请在账号管理中手动创建',
        };
      }
    }

    app.post('/v1/teachers', { preHandler: app.requireAdmin }, async (request) => {
      const body = teacherSchema.parse(request.body);
      const teacher = await teachingRepo.createTeacher(app.db, normalizeTeacherBody(body));
      const account = await ensureTeacherAccount(teacher);
      return { teacher: toTeacherDto(teacher), ...account };
    });

    app.patch('/v1/teachers/:teacherId', { preHandler: app.requireAdmin }, async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const body = teacherUpdateSchema.parse(request.body);
      const teacher = await teachingRepo.updateTeacher(
        app.db,
        teacherId,
        normalizeTeacherBody(body),
      );
      if (!teacher) throw notFound('Teacher not found');
      const account = await ensureTeacherAccount(teacher);
      return { teacher: toTeacherDto(teacher), ...account };
    });

    app.delete('/v1/teachers/:teacherId', { preHandler: app.requireAdmin }, async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const teacher = await teachingRepo.deleteTeacher(app.db, teacherId);
      if (!teacher) throw notFound('Teacher not found');
      return { teacher: toTeacherDto(teacher) };
    });

    app.get('/v1/institutions', { preHandler: app.requireAdmin }, async () => {
      return { institutions: await teachingRepo.listInstitutions(app.db) };
    });

    app.post('/v1/institutions', { preHandler: app.requireAdmin }, async (request) => {
      const body = institutionSchema.parse(request.body);
      const existing = await teachingRepo.listInstitutions(app.db);
      const institution = await teachingRepo.createInstitution(app.db, {
        ...body,
        sortOrder: body.sortOrder ?? existing.length * 10,
      });
      return { institution };
    });

    app.patch('/v1/institutions/order', { preHandler: app.requireAdmin }, async (request) => {
      const body = institutionOrderSchema.parse(request.body);
      const institutions = await teachingRepo.reorderInstitutions(app.db, body.ids);
      return { institutions };
    });

    app.patch(
      '/v1/institutions/:institutionId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { institutionId } = request.params as { institutionId: string };
        const body = institutionUpdateSchema.parse(request.body);
        const institution = await teachingRepo.updateInstitution(app.db, institutionId, body);
        if (!institution) throw notFound('Institution not found');
        return { institution };
      },
    );

    app.delete(
      '/v1/institutions/:institutionId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { institutionId } = request.params as { institutionId: string };
        const institution = await teachingRepo.deleteInstitution(app.db, institutionId);
        if (!institution) throw notFound('Institution not found');
        return { institution };
      },
    );

    app.get('/v1/classrooms', { preHandler: app.requireAdmin }, async () => {
      return { classrooms: await teachingRepo.listClassrooms(app.db) };
    });

    app.post('/v1/classrooms', { preHandler: app.requireAdmin }, async (request) => {
      const body = classroomSchema.parse(request.body);
      const classroom = await teachingRepo.createClassroom(app.db, body);
      return { classroom };
    });

    app.patch('/v1/classrooms/:classroomId', { preHandler: app.requireAdmin }, async (request) => {
      const { classroomId } = request.params as { classroomId: string };
      const body = classroomUpdateSchema.parse(request.body);
      const classroom = await teachingRepo.updateClassroom(app.db, classroomId, body);
      if (!classroom) throw notFound('Classroom not found');
      return { classroom };
    });

    app.delete('/v1/classrooms/:classroomId', { preHandler: app.requireAdmin }, async (request) => {
      const { classroomId } = request.params as { classroomId: string };
      const classroom = await teachingRepo.deleteClassroom(app.db, classroomId);
      if (!classroom) throw notFound('Classroom not found');
      return { classroom };
    });
  },
};
