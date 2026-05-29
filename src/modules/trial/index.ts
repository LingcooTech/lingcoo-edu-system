import { z } from 'zod';

import * as trialRepo from '../../db/repositories/trial.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import { findTenantBySlug, requireTenant } from '../../db/repositories/tenant.js';
import * as crmRepo from '../../db/repositories/crm.js';
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

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export const trialModule: AppModule = {
  name: 'trial',
  async register(app) {
    app.get('/public/:tenantSlug/home', async (request) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const tenant = await findTenantBySlug(app.db, tenantSlug);
      if (!tenant) throw notFound('Tenant not found');

      const [featuredCourses, trialSessions] = await Promise.all([
        catalogRepo.listPublishedCourses(app.db, tenant.id),
        trialRepo.listOpenTrialSessions(app.db, tenant.id),
      ]);
      return { tenant, featuredCourses, trialSessions };
    });

    app.get('/public/:tenantSlug/courses', async (request) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const tenant = await findTenantBySlug(app.db, tenantSlug);
      if (!tenant) throw notFound('Tenant not found');
      return { courses: await catalogRepo.listPublishedCourses(app.db, tenant.id) };
    });

    app.get('/public/:tenantSlug/trial-sessions', async (request) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const tenant = await findTenantBySlug(app.db, tenantSlug);
      if (!tenant) throw notFound('Tenant not found');
      return { trialSessions: await trialRepo.listOpenTrialSessions(app.db, tenant.id) };
    });

    app.post('/public/:tenantSlug/trial-registrations', async (request) => {
      const { tenantSlug } = request.params as { tenantSlug: string };
      const tenant = await findTenantBySlug(app.db, tenantSlug);
      if (!tenant) throw notFound('Tenant not found');

      const body = registrationSchema.parse(request.body);
      const campusId = await trialRepo.firstCampusId(app.db, tenant.id);

      const lead = await crmRepo.createLead(app.db, {
        tenantId: tenant.id,
        campusId,
        courseId: body.courseId,
        trialSessionId: body.trialSessionId,
        guardianName: body.guardianName,
        phone: body.phone,
        studentName: body.studentName,
        grade: body.grade,
        source: body.source,
        status: 'new',
      });

      if (body.trialSessionId) {
        await trialRepo.incrementBookedCount(app.db, body.trialSessionId);
      }

      return { lead, message: '预约成功，我们会尽快联系您确认上课时间。' };
    });

    app.get(
      '/v1/tenants/:tenantId/trial-sessions',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        return { trialSessions: await trialRepo.listTrialSessions(app.db, tenantId) };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/trial-sessions',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        const body = trialSessionSchema.parse(request.body);
        await catalogRepo.requireCourse(app.db, tenantId, body.courseId);

        const trialSession = await trialRepo.createTrialSession(app.db, {
          tenantId,
          campusId: body.campusId,
          courseId: body.courseId,
          title: body.title,
          startsAt: new Date(body.startsAt),
          endsAt: new Date(body.endsAt),
          capacity: body.capacity,
          status: body.status,
          bookedCount: 0,
        });
        return { trialSession };
      },
    );
  },
};
