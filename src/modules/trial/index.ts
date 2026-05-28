import { z } from 'zod';

import { createId, requireCourse, requireTenant, store } from '../../lib/store.js';
import type { AppModule } from '../types.js';

const trialSessionSchema = z.object({
  campusId: z.string(),
  courseId: z.string(),
  title: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().positive(),
  status: z.enum(['open', 'closed', 'cancelled']).default('open'),
});

const registrationSchema = z.object({
  courseId: z.string().optional(),
  trialSessionId: z.string().optional(),
  guardianName: z.string().min(1),
  phone: z.string().min(6),
  studentName: z.string().min(1),
  grade: z.string().min(1),
  source: z.string().default('unknown'),
});

export const trialModule: AppModule = {
  name: 'trial',
  async register(app) {
    app.get('/public/:tenantSlug/home', async (request) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const tenant = store.tenants.find((item) => item.slug === tenantSlug);
      if (!tenant) throw Object.assign(new Error('Tenant not found'), { statusCode: 404 });

      return {
        tenant,
        featuredCourses: store.courses.filter(
          (course) => course.tenantId === tenant.id && course.status === 'published',
        ),
        trialSessions: store.trialSessions.filter(
          (session) => session.tenantId === tenant.id && session.status === 'open',
        ),
      };
    });

    app.get('/public/:tenantSlug/courses', async (request) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const tenant = store.tenants.find((item) => item.slug === tenantSlug);
      if (!tenant) throw Object.assign(new Error('Tenant not found'), { statusCode: 404 });

      return {
        courses: store.courses.filter(
          (course) => course.tenantId === tenant.id && course.status === 'published',
        ),
      };
    });

    app.get('/public/:tenantSlug/trial-sessions', async (request) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const tenant = store.tenants.find((item) => item.slug === tenantSlug);
      if (!tenant) throw Object.assign(new Error('Tenant not found'), { statusCode: 404 });

      return {
        trialSessions: store.trialSessions.filter(
          (session) => session.tenantId === tenant.id && session.status === 'open',
        ),
      };
    });

    app.post('/public/:tenantSlug/trial-registrations', async (request) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const tenant = store.tenants.find((item) => item.slug === tenantSlug);
      if (!tenant) throw Object.assign(new Error('Tenant not found'), { statusCode: 404 });

      const body = registrationSchema.parse(request.body);
      const campusId = store.campuses.find((campus) => campus.tenantId === tenant.id)?.id;
      if (!campusId) throw Object.assign(new Error('Campus not found'), { statusCode: 404 });

      const lead = {
        id: createId('lead'),
        tenantId: tenant.id,
        campusId,
        courseId: body.courseId,
        trialSessionId: body.trialSessionId,
        guardianName: body.guardianName,
        phone: body.phone,
        studentName: body.studentName,
        grade: body.grade,
        source: body.source,
        status: 'new' as const,
        createdAt: new Date().toISOString(),
      };

      store.leads.unshift(lead);

      if (body.trialSessionId) {
        const session = store.trialSessions.find((item) => item.id === body.trialSessionId);
        if (session) session.bookedCount += 1;
      }

      return { lead, message: '预约成功，我们会尽快联系您确认上课时间。' };
    });

    app.get(
      '/v1/tenants/:tenantId/trial-sessions',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        return {
          trialSessions: store.trialSessions.filter((session) => session.tenantId === tenantId),
        };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/trial-sessions',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        requireTenant(tenantId);
        const body = trialSessionSchema.parse(request.body);
        requireCourse(tenantId, body.courseId);

        const trialSession = {
          id: createId('trial'),
          tenantId,
          bookedCount: 0,
          ...body,
        };
        store.trialSessions.unshift(trialSession);
        return { trialSession };
      },
    );
  },
};
