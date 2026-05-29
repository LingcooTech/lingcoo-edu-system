import { z } from 'zod';

import * as crmRepo from '../../db/repositories/crm.js';
import * as peopleRepo from '../../db/repositories/people.js';
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
      return { leads: await crmRepo.listLeads(app.db, tenantId) };
    });

    app.patch(
      '/v1/tenants/:tenantId/leads/:leadId/status',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, leadId } = request.params as { tenantId: string; leadId: string };
        const body = statusSchema.parse(request.body);
        await crmRepo.requireLead(app.db, tenantId, leadId);
        const lead = await crmRepo.updateLead(app.db, leadId, { status: body.status });
        return { lead };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/leads/:leadId/follow-ups',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, leadId } = request.params as { tenantId: string; leadId: string };
        await crmRepo.requireLead(app.db, tenantId, leadId);
        const body = followUpSchema.parse(request.body);

        const nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
        const followUp = await crmRepo.addFollowUp(app.db, {
          tenantId,
          leadId,
          content: body.content,
          nextFollowUpAt,
        });
        const lead = await crmRepo.updateLead(app.db, leadId, {
          nextFollowUpAt,
          status: 'follow_up',
        });

        return { followUp, lead };
      },
    );

    app.post(
      '/v1/tenants/:tenantId/leads/:leadId/convert',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId, leadId } = request.params as { tenantId: string; leadId: string };
        const body = convertSchema.parse(request.body);
        const lead = await crmRepo.requireLead(app.db, tenantId, leadId);

        let guardian = await peopleRepo.findGuardianByPhone(app.db, tenantId, lead.phone);
        if (!guardian) {
          guardian = await peopleRepo.createGuardian(app.db, {
            tenantId,
            name: lead.guardianName,
            phone: lead.phone,
          });
        }

        const student = await peopleRepo.createStudent(app.db, {
          tenantId,
          guardianId: guardian.id,
          name: lead.studentName,
          grade: lead.grade,
          school: body.school,
          status: 'active',
        });

        const updatedLead = await crmRepo.updateLead(app.db, leadId, {
          convertedStudentId: student.id,
          status: 'paid',
        });

        return { guardian, student, lead: updatedLead };
      },
    );
  },
};
