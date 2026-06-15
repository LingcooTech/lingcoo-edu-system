import { z } from 'zod';

import * as catalogRepo from '../../db/repositories/catalog.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
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
      const scopeChanged =
        Object.hasOwn(body, 'courseId') || Object.hasOwn(body, 'courseSeriesId');
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

function normalizePackageCreate(body: z.infer<typeof packageSchema>): packagesRepo.NewCoursePackage {
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
        businessModel,
      };
    });
  },
};
