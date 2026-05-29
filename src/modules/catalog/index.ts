import { z } from 'zod';

import * as catalogRepo from '../../db/repositories/catalog.js';
import * as packagesRepo from '../../db/repositories/packages.js';
import { findTenantBySlug, requireTenant } from '../../db/repositories/tenant.js';
import type { AppModule } from '../types.js';

const courseSchema = z.object({
  campusId: z.string(),
  slug: z.string().min(2),
  name: z.string().min(1),
  category: z.string().min(1),
  ageRange: z.string().min(1),
  lessonCount: z.number().int().nonnegative(),
  durationMinutes: z.number().int().positive(),
  priceAmount: z.number().int().nonnegative(),
  summary: z.string().default(''),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});

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
    app.get('/v1/tenants/:tenantId/courses', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      await requireTenant(app.db, tenantId);
      return { courses: await catalogRepo.listCourses(app.db, tenantId) };
    });

    app.post('/v1/tenants/:tenantId/courses', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      await requireTenant(app.db, tenantId);
      const body = courseSchema.parse(request.body);
      const course = await catalogRepo.createCourse(app.db, { tenantId, ...body });
      return { course };
    });

    // --- Course packages (课时包) ---

    app.get(
      '/v1/tenants/:tenantId/course-packages',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        return { coursePackages: await packagesRepo.listPackages(app.db, tenantId) };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/course-packages',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const body = packageSchema.parse(request.body);
        const coursePackage = await packagesRepo.createPackage(app.db, { tenantId, ...body });
        return { coursePackage };
      },
    );

    app.patch(
      '/v1/tenants/:tenantId/course-packages/:packageId',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, packageId } = request.params as {
          tenantId: string;
          packageId: string;
        };
        await requireTenant(app.db, tenantId);
        const body = packageUpdateSchema.parse(request.body);
        const coursePackage = await packagesRepo.updatePackage(app.db, tenantId, packageId, body);
        if (!coursePackage) {
          throw Object.assign(new Error('Course package not found'), { statusCode: 404 });
        }
        return { coursePackage };
      },
    );

    // Public: active packages for a tenant (parent purchase surface).
    app.get('/public/:tenantSlug/course-packages', async (request) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const tenant = await findTenantBySlug(app.db, tenantSlug);
      if (!tenant) {
        throw Object.assign(new Error('Tenant not found'), { statusCode: 404 });
      }
      return { coursePackages: await packagesRepo.listActivePackages(app.db, tenant.id) };
    });
  },
};
