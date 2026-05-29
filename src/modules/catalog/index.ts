import { z } from 'zod';

import * as catalogRepo from '../../db/repositories/catalog.js';
import { requireTenant } from '../../db/repositories/tenant.js';
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
  },
};
