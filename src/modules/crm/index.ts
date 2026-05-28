import { z } from 'zod';

import { createId, requireTenant, store } from '../../lib/store.js';
import type { LeadStatus } from '../../lib/domain.js';
import type { AppModule } from '../types.js';

const statusSchema = z.object({
  status: z.enum([
    'new',
    'contacted',
    'trial_booked',
    'trial_attended',
    'paid',
    'follow_up',
    'invalid',
  ]),
});

const followUpSchema = z.object({
  content: z.string().min(1),
  nextFollowUpAt: z.string().datetime({ offset: true }).optional(),
});

const convertSchema = z.object({
  school: z.string().optional(),
});

export const crmModule: AppModule = {
  name: 'crm',
  async register(app) {
    app.get('/v1/tenants/:tenantId/leads', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      requireTenant(tenantId);
      return { leads: store.leads.filter((lead) => lead.tenantId === tenantId) };
    });

    app.patch(
      '/v1/tenants/:tenantId/leads/:leadId/status',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, leadId } = request.params as { tenantId: string; leadId: string };
        const body = statusSchema.parse(request.body);
        const lead = store.leads.find((item) => item.tenantId === tenantId && item.id === leadId);
        if (!lead) throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
        lead.status = body.status as LeadStatus;
        return { lead };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/leads/:leadId/follow-ups',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, leadId } = request.params as { tenantId: string; leadId: string };
        const lead = store.leads.find((item) => item.tenantId === tenantId && item.id === leadId);
        if (!lead) throw Object.assign(new Error('Lead not found'), { statusCode: 404 });

        const body = followUpSchema.parse(request.body);
        const followUp = {
          id: createId('follow_up'),
          tenantId,
          leadId,
          content: body.content,
          nextFollowUpAt: body.nextFollowUpAt,
          createdAt: new Date().toISOString(),
        };

        lead.nextFollowUpAt = body.nextFollowUpAt;
        lead.status = 'follow_up';
        store.followUps.unshift(followUp);

        return { followUp, lead };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/leads/:leadId/convert',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, leadId } = request.params as { tenantId: string; leadId: string };
        const body = convertSchema.parse(request.body);
        const lead = store.leads.find((item) => item.tenantId === tenantId && item.id === leadId);
        if (!lead) throw Object.assign(new Error('Lead not found'), { statusCode: 404 });

        let guardian = store.guardians.find(
          (item) => item.tenantId === tenantId && item.phone === lead.phone,
        );
        if (!guardian) {
          guardian = {
            id: createId('guardian'),
            tenantId,
            name: lead.guardianName,
            phone: lead.phone,
          };
          store.guardians.unshift(guardian);
        }

        const student = {
          id: createId('student'),
          tenantId,
          guardianId: guardian.id,
          name: lead.studentName,
          grade: lead.grade,
          school: body.school,
          status: 'active' as const,
        };

        store.students.unshift(student);
        lead.convertedStudentId = student.id;
        lead.status = 'paid';

        return { guardian, student, lead };
      },
    );
  },
};
