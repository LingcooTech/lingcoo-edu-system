import { z } from 'zod';

import * as catalogRepo from '../../db/repositories/catalog.js';
import * as organizationRepo from '../../db/repositories/organization.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import { readBusinessModel } from '../../lib/business-model.js';
import type { AppModule } from '../types.js';

const courseSchema = z.object({
  campusId: z.string().optional(),
  slug: z.string().min(2),
  name: z.string().min(1),
  category: z.string().min(1),
  ageRange: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  providerInstitutionId: z.string().uuid().nullable().optional(),
  defaultTeacherId: z.string().uuid().nullable().optional(),
  teachingLocationLabel: z.string().max(200).nullable().optional(),
  paymentReceiverType: z.enum(['platform', 'provider', 'other']).default('platform'),
  paymentReceiverInstitutionId: z.string().uuid().nullable().optional(),
  paymentReceiverName: z.string().max(160).nullable().optional(),
  trialDescription: z.string().default(''),
  reservationNotice: z.string().default(''),
  onlineSalesEnabled: z.boolean().default(true),
  summary: z.string().default(''),
  content: z.string().default(''),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});

const courseUpdateSchema = courseSchema.partial();

const packageSchema = z.object({
  courseId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().default(''),
  lessonCount: z.number().int().positive(),
  priceAmount: z.number().int().nonnegative(),
  status: z.enum(['active', 'archived']).default('active'),
});

const packageUpdateSchema = packageSchema.partial();

export const catalogModule: AppModule = {
  name: 'catalog',
  async register(app) {
    app.get('/v1/courses', { preHandler: app.requireAdmin }, async () => {
      return { courses: await catalogRepo.listCourses(app.db) };
    });

    app.post('/v1/courses', { preHandler: app.requireAdmin }, async (request) => {
      const body = courseSchema.parse(request.body);
      const course = await catalogRepo.createCourse(app.db, body);
      return { course };
    });

    app.patch('/v1/courses/:courseId', { preHandler: app.requireAdmin }, async (request) => {
      const { courseId } = request.params as { courseId: string };
      const body = courseUpdateSchema.parse(request.body);
      const course = await catalogRepo.updateCourse(app.db, courseId, body);
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
      const coursePackage = await packagesRepo.createPackage(app.db, body);
      return { coursePackage };
    });

    app.patch(
      '/v1/course-packages/:packageId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { packageId } = request.params as { packageId: string };
        const body = packageUpdateSchema.parse(request.body);
        const coursePackage = await packagesRepo.updatePackage(app.db, packageId, body);
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
        defaultTeacher,
        paymentReceiverInstitution,
      ] = await Promise.all([
        packagesRepo.listActivePackagesForCourse(app.db, course.id),
        organizationRepo.requireOrganization(app.db),
        teachingRepo.findInstitution(app.db, course.providerInstitutionId),
        teachingRepo.findTeacher(app.db, course.defaultTeacherId),
        teachingRepo.findInstitution(app.db, course.paymentReceiverInstitutionId),
      ]);
      const businessModel = readBusinessModel(organization.settings);
      return {
        course,
        coursePackages: businessModel.packagePriceDisplayEnabled ? coursePackages : [],
        providerInstitution,
        defaultTeacher,
        paymentReceiverInstitution,
        businessModel,
      };
    });
  },
};
