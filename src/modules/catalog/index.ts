import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';

import * as catalogRepo from '../../db/repositories/catalog.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import * as schema from '../../db/schema.js';
import { readBusinessModel } from '../../lib/business-model.js';
import type { AppModule } from '../types.js';

const courseShape = {
  courseSeriesId: z.string().uuid().nullable().optional(),
  campusId: z.string().uuid().nullable().optional(),
  slug: z.string().min(2),
  name: z.string().min(1),
  category: z.string().min(1),
  ageRange: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  providerInstitutionId: z.string().uuid().nullable().optional(),
  defaultTeacherId: z.string().uuid().nullable().optional(),
  defaultTeacherIds: z.array(z.string().uuid()),
  classroomId: z.string().uuid().nullable().optional(),
  classroomIds: z.array(z.string().uuid()),
  teachingLocationLabel: z.string().max(200).nullable().optional(),
  paymentReceiverType: z.enum(['platform', 'provider', 'other']),
  paymentReceiverInstitutionId: z.string().uuid().nullable().optional(),
  paymentReceiverName: z.string().max(160).nullable().optional(),
  trialDescription: z.string(),
  reservationNotice: z.string(),
  coverImageUrl: z.string().max(500).nullable().optional(),
  coverThumbUrl: z.string().max(500).nullable().optional(),
  onlineSalesEnabled: z.boolean(),
  summary: z.string(),
  content: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
};

const courseSchema = z.object({
  ...courseShape,
  defaultTeacherIds: courseShape.defaultTeacherIds.default([]),
  classroomIds: courseShape.classroomIds.default([]),
  paymentReceiverType: courseShape.paymentReceiverType.default('platform'),
  trialDescription: courseShape.trialDescription.default(''),
  reservationNotice: courseShape.reservationNotice.default(''),
  onlineSalesEnabled: courseShape.onlineSalesEnabled.default(true),
  summary: courseShape.summary.default(''),
  content: courseShape.content.default(''),
  status: courseShape.status.default('draft'),
});

const courseUpdateSchema = z.object(courseShape).partial();

const studentWorkSchema = z.object({
  studentId: z.string().uuid().nullable().optional(),
  classId: z.string().uuid().nullable().optional(),
  classSessionId: z.string().uuid().nullable().optional(),
  teacherId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(160).default('作品展示'),
  description: z.string().trim().max(2000).default(''),
  imageUrls: z.array(z.string().trim().url().max(500)).min(1).max(12),
  frameStyle: z.enum(['classic', 'gallery', 'paper']).default('gallery'),
  status: z.enum(['published', 'hidden']).default('published'),
});

const studentWorkUpdateSchema = studentWorkSchema.partial();

const packageShape = {
  courseId: z.string().uuid().nullable().optional(),
  courseSeriesId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  description: z.string(),
  lessonCount: z.number().int().positive(),
  giftedLessonCount: z.number().int().nonnegative(),
  priceAmount: z.number().int().nonnegative(),
  discountPriceAmount: z.number().int().nonnegative().nullable().optional(),
  status: z.enum(['active', 'archived']),
};

const packageSchema = z
  .object({
    ...packageShape,
    description: packageShape.description.default(''),
    giftedLessonCount: packageShape.giftedLessonCount.default(0),
    status: packageShape.status.default('active'),
  })
  .refine((body) => Boolean(body.courseId || body.courseSeriesId), {
    message: '课时包必须关联课程或课程系列',
    path: ['courseSeriesId'],
  })
  .refine((body) => !(body.courseId && body.courseSeriesId), {
    message: '课时包只能关联课程或课程系列其中一个',
    path: ['courseSeriesId'],
  });

const packageUpdateSchema = z
  .object(packageShape)
  .partial()
  .refine(
    (body) => {
      const scopeChanged = Object.hasOwn(body, 'courseId') || Object.hasOwn(body, 'courseSeriesId');
      return !scopeChanged || Boolean(body.courseId || body.courseSeriesId);
    },
    {
      message: '课时包必须关联课程或课程系列',
      path: ['courseSeriesId'],
    },
  )
  .refine((body) => !(body.courseId && body.courseSeriesId), {
    message: '课时包只能关联课程或课程系列其中一个',
    path: ['courseSeriesId'],
  });

const courseSeriesSchema = z.object({
  slug: z.string().min(2).max(120),
  name: z.string().min(1).max(160),
  description: z.string().default(''),
  status: z.enum(['active', 'archived']).default('active'),
  sortOrder: z.number().int().default(0),
});

const courseSeriesUpdateSchema = courseSeriesSchema.partial();

function uniqueTeacherIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function uniqueClassroomIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function normalizeCourseCreate(body: z.infer<typeof courseSchema>): catalogRepo.NewCourse {
  const defaultTeacherIds = uniqueTeacherIds(
    body.defaultTeacherIds.length > 0
      ? body.defaultTeacherIds
      : body.defaultTeacherId
        ? [body.defaultTeacherId]
        : [],
  );
  const classroomIds = uniqueClassroomIds(
    body.classroomIds.length > 0 ? body.classroomIds : body.classroomId ? [body.classroomId] : [],
  );
  return {
    ...body,
    defaultTeacherIds,
    defaultTeacherId: defaultTeacherIds[0] ?? null,
    classroomIds,
    classroomId: classroomIds[0] ?? null,
  };
}

function normalizeCourseUpdate(body: z.infer<typeof courseUpdateSchema>) {
  const patch = Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  ) as Partial<catalogRepo.NewCourse>;

  if ('defaultTeacherIds' in body) {
    const defaultTeacherIds = uniqueTeacherIds(body.defaultTeacherIds ?? []);
    patch.defaultTeacherIds = defaultTeacherIds;
    patch.defaultTeacherId = defaultTeacherIds[0] ?? null;
  } else if ('defaultTeacherId' in body) {
    const defaultTeacherId = body.defaultTeacherId ?? null;
    patch.defaultTeacherId = defaultTeacherId;
    patch.defaultTeacherIds = defaultTeacherId ? [defaultTeacherId] : [];
  }

  if ('classroomIds' in body) {
    const classroomIds = uniqueClassroomIds(body.classroomIds ?? []);
    patch.classroomIds = classroomIds;
    patch.classroomId = classroomIds[0] ?? null;
  } else if ('classroomId' in body) {
    const classroomId = body.classroomId ?? null;
    patch.classroomId = classroomId;
    patch.classroomIds = classroomId ? [classroomId] : [];
  }

  return patch;
}

function normalizePackageCreate(
  body: z.infer<typeof packageSchema>,
): packagesRepo.NewCoursePackage {
  return {
    ...body,
    courseId: body.courseId ?? null,
    courseSeriesId: body.courseSeriesId ?? null,
  };
}

function normalizePackageUpdate(body: z.infer<typeof packageUpdateSchema>) {
  const patch = Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  ) as Partial<packagesRepo.NewCoursePackage>;

  if ('courseId' in body) {
    patch.courseId = body.courseId ?? null;
    if (patch.courseId) patch.courseSeriesId = null;
  }
  if ('courseSeriesId' in body) {
    patch.courseSeriesId = body.courseSeriesId ?? null;
    if (patch.courseSeriesId) patch.courseId = null;
  }

  return patch;
}

export const catalogModule: AppModule = {
  name: 'catalog',
  async register(app) {
    async function enrichStudentWorks(items: (typeof schema.studentWorks.$inferSelect)[]) {
      if (items.length === 0) {
        return [];
      }
      const [students, courses, classes, sessions, teachers] = await Promise.all([
        peopleRepo.listStudents(app.db),
        catalogRepo.listCourses(app.db),
        schedulingRepo.listClasses(app.db),
        schedulingRepo.listClassSessions(app.db),
        teachingRepo.listTeachers(app.db),
      ]);
      const studentById = new Map(students.map((student) => [student.id, student]));
      const courseById = new Map(courses.map((course) => [course.id, course]));
      const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
      const sessionById = new Map(sessions.map((session) => [session.id, session]));
      const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));

      return items.map((item) => {
        const session = item.classSessionId ? (sessionById.get(item.classSessionId) ?? null) : null;
        const classGroup =
          (item.classId ? (classById.get(item.classId) ?? null) : null) ??
          (session?.classId ? (classById.get(session.classId) ?? null) : null);
        const teacher =
          (item.teacherId ? (teacherById.get(item.teacherId) ?? null) : null) ??
          (classGroup?.teacherId ? (teacherById.get(classGroup.teacherId) ?? null) : null);
        const student = item.studentId ? studentById.get(item.studentId) : null;
        return {
          ...item,
          student: student
            ? {
                id: student.id,
                name: student.name,
                grade: student.grade,
                school: student.school,
              }
            : null,
          course: item.courseId ? (courseById.get(item.courseId) ?? null) : null,
          class: classGroup ? { id: classGroup.id, name: classGroup.name } : null,
          session,
          teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
        };
      });
    }

    app.get('/v1/course-series', { preHandler: app.requireAdmin }, async () => {
      return { courseSeries: await catalogRepo.listCourseSeries(app.db) };
    });

    app.post('/v1/course-series', { preHandler: app.requireAdmin }, async (request) => {
      const body = courseSeriesSchema.parse(request.body);
      const courseSeries = await catalogRepo.createCourseSeries(app.db, body);
      return { courseSeries };
    });

    app.patch(
      '/v1/course-series/:courseSeriesId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { courseSeriesId } = request.params as { courseSeriesId: string };
        const body = courseSeriesUpdateSchema.parse(request.body);
        const courseSeries = await catalogRepo.updateCourseSeries(app.db, courseSeriesId, body);
        if (!courseSeries) {
          throw Object.assign(new Error('Course series not found'), { statusCode: 404 });
        }
        return { courseSeries };
      },
    );

    app.delete(
      '/v1/course-series/:courseSeriesId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { courseSeriesId } = request.params as { courseSeriesId: string };
        const courseSeries = await catalogRepo.deleteCourseSeries(app.db, courseSeriesId);
        if (!courseSeries) {
          throw Object.assign(new Error('Course series not found'), { statusCode: 404 });
        }
        return { courseSeries };
      },
    );

    app.get('/v1/courses', { preHandler: app.requireAdmin }, async () => {
      return { courses: await catalogRepo.listCourses(app.db) };
    });

    app.post('/v1/courses', { preHandler: app.requireAdmin }, async (request) => {
      const body = courseSchema.parse(request.body);
      const course = await catalogRepo.createCourse(app.db, normalizeCourseCreate(body));
      return { course };
    });

    app.patch('/v1/courses/:courseId', { preHandler: app.requireAdmin }, async (request) => {
      const { courseId } = request.params as { courseId: string };
      const body = courseUpdateSchema.parse(request.body);
      const course = await catalogRepo.updateCourse(app.db, courseId, normalizeCourseUpdate(body));
      if (!course) {
        throw Object.assign(new Error('Course not found'), { statusCode: 404 });
      }
      return { course };
    });

    app.get(
      '/v1/courses/:courseId/student-works',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { courseId } = request.params as { courseId: string };
        await catalogRepo.requireCourse(app.db, courseId);
        const items = await app.db
          .select()
          .from(schema.studentWorks)
          .where(eq(schema.studentWorks.courseId, courseId))
          .orderBy(desc(schema.studentWorks.createdAt));
        return { studentWorks: await enrichStudentWorks(items) };
      },
    );

    app.post(
      '/v1/courses/:courseId/student-works',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { courseId } = request.params as { courseId: string };
        const body = studentWorkSchema.parse(request.body);
        await catalogRepo.requireCourse(app.db, courseId);
        if (body.studentId) {
          await peopleRepo.requireStudent(app.db, body.studentId);
        }
        const [item] = await app.db
          .insert(schema.studentWorks)
          .values({
            courseId,
            studentId: body.studentId ?? null,
            classId: body.classId ?? null,
            classSessionId: body.classSessionId ?? null,
            teacherId: body.teacherId ?? null,
            title: body.title || '作品展示',
            description: body.description,
            imageUrls: body.imageUrls,
            frameStyle: body.frameStyle,
            status: body.status,
            source: 'admin',
          })
          .returning();
        return { studentWork: (await enrichStudentWorks([item]))[0] };
      },
    );

    app.patch(
      '/v1/student-works/:studentWorkId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { studentWorkId } = request.params as { studentWorkId: string };
        const body = studentWorkUpdateSchema.parse(request.body);
        const patch = Object.fromEntries(
          Object.entries(body).filter(([, value]) => value !== undefined),
        ) as Partial<typeof schema.studentWorks.$inferInsert>;
        if (body.studentId) {
          await peopleRepo.requireStudent(app.db, body.studentId);
        }
        const [item] = await app.db
          .update(schema.studentWorks)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(schema.studentWorks.id, studentWorkId))
          .returning();
        if (!item) {
          throw Object.assign(new Error('Student work not found'), { statusCode: 404 });
        }
        return { studentWork: (await enrichStudentWorks([item]))[0] };
      },
    );

    app.delete(
      '/v1/student-works/:studentWorkId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { studentWorkId } = request.params as { studentWorkId: string };
        const [item] = await app.db
          .delete(schema.studentWorks)
          .where(eq(schema.studentWorks.id, studentWorkId))
          .returning();
        if (!item) {
          throw Object.assign(new Error('Student work not found'), { statusCode: 404 });
        }
        return { studentWork: item };
      },
    );

    app.delete('/v1/courses/:courseId', { preHandler: app.requireAdmin }, async (request) => {
      const { courseId } = request.params as { courseId: string };
      const course = await catalogRepo.deleteCourse(app.db, courseId);
      if (!course) {
        throw Object.assign(new Error('Course not found'), { statusCode: 404 });
      }
      return { course };
    });

    // --- Course packages (课时包) ---

    app.get('/v1/course-packages', { preHandler: app.requireAdmin }, async () => {
      return { coursePackages: await packagesRepo.listPackages(app.db) };
    });

    app.post('/v1/course-packages', { preHandler: app.requireAdmin }, async (request) => {
      const body = packageSchema.parse(request.body);
      const coursePackage = await packagesRepo.createPackage(app.db, normalizePackageCreate(body));
      return { coursePackage };
    });

    app.patch(
      '/v1/course-packages/:packageId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { packageId } = request.params as { packageId: string };
        const body = packageUpdateSchema.parse(request.body);
        const coursePackage = await packagesRepo.updatePackage(
          app.db,
          packageId,
          normalizePackageUpdate(body),
        );
        if (!coursePackage) {
          throw Object.assign(new Error('Course package not found'), { statusCode: 404 });
        }
        return { coursePackage };
      },
    );

    app.delete(
      '/v1/course-packages/:packageId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { packageId } = request.params as { packageId: string };
        const coursePackage = await packagesRepo.deletePackage(app.db, packageId);
        if (!coursePackage) {
          throw Object.assign(new Error('Course package not found'), { statusCode: 404 });
        }
        return { coursePackage };
      },
    );

    // Public: active packages (parent purchase surface).
    app.get('/public/course-packages', async () => {
      return { coursePackages: await packagesRepo.listActivePackages(app.db) };
    });

    // Public: a single published course by slug (parent course-detail page).
    app.get('/public/courses/:courseSlug', async (request) => {
      const { courseSlug } = request.params as { courseSlug: string };
      const course = await catalogRepo.findPublishedCourseBySlug(app.db, courseSlug);
      if (!course) {
        throw Object.assign(new Error('Course not found'), { statusCode: 404 });
      }
      const [
        coursePackages,
        organization,
        providerInstitution,
        defaultTeachers,
        paymentReceiverInstitution,
        classrooms,
        campuses,
        studentWorks,
      ] = await Promise.all([
        packagesRepo.listActivePackagesForCourse(app.db, course.id, course.courseSeriesId),
        organizationRepo.requireOrganization(app.db),
        teachingRepo.findInstitution(app.db, course.providerInstitutionId),
        teachingRepo.findTeachers(
          app.db,
          course.defaultTeacherIds?.length
            ? course.defaultTeacherIds
            : course.defaultTeacherId
              ? [course.defaultTeacherId]
              : [],
        ),
        teachingRepo.findInstitution(app.db, course.paymentReceiverInstitutionId),
        teachingRepo.findClassrooms(
          app.db,
          course.classroomIds?.length
            ? course.classroomIds
            : course.classroomId
              ? [course.classroomId]
              : [],
        ),
        organizationRepo.listCampuses(app.db),
        app.db
          .select()
          .from(schema.studentWorks)
          .where(eq(schema.studentWorks.courseId, course.id))
          .orderBy(desc(schema.studentWorks.createdAt)),
      ]);
      const classroom = classrooms[0] ?? null;
      const campusIds = new Set(classrooms.map((item) => item.campusId));
      if (course.campusId) campusIds.add(course.campusId);
      const selectedCampuses = campuses.filter((item) => campusIds.has(item.id));
      const campus =
        selectedCampuses.find((item) => item.id === (classroom?.campusId ?? course.campusId)) ??
        null;
      const businessModel = readBusinessModel(organization.settings);
      return {
        course,
        coursePackages: businessModel.packagePriceDisplayEnabled ? coursePackages : [],
        providerInstitution,
        defaultTeacher: defaultTeachers[0] ?? null,
        defaultTeachers,
        classroom,
        classrooms,
        campus,
        campuses: selectedCampuses,
        paymentReceiverInstitution,
        studentWorks: await enrichStudentWorks(
          studentWorks.filter((item) => item.status === 'published'),
        ),
        businessModel,
      };
    });
  },
};
