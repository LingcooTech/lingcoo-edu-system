import { z } from 'zod';

import { createId, requireTenant, store } from '../../lib/store.js';
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
      requireTenant(tenantId);
      return { courses: store.courses.filter((course) => course.tenantId === tenantId) };
    });

    app.post('/v1/tenants/:tenantId/courses', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      requireTenant(tenantId);
      const body = courseSchema.parse(request.body);
      const course = {
        id: createId('course'),
        tenantId,
        ...body,
      };
      store.courses.unshift(course);
      return { course };
    });
  },
};
