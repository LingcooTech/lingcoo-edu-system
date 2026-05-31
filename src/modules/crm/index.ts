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
    app.get('/v1/leads', { preHandler: app.requireAdmin }, async () => {
      return { leads: await crmRepo.listLeads(app.db) };
    });

    app.patch('/v1/leads/:leadId/status', { preHandler: app.requireAdmin }, async (request) => {
      const { leadId } = request.params as { leadId: string };
      const body = statusSchema.parse(request.body);
      await crmRepo.requireLead(app.db, leadId);
      const lead = await crmRepo.updateLead(app.db, leadId, { status: body.status });
      return { lead };
    });

    app.post('/v1/leads/:leadId/follow-ups', { preHandler: app.requireAdmin }, async (request) => {
      const { leadId } = request.params as { leadId: string };
      await crmRepo.requireLead(app.db, leadId);
      const body = followUpSchema.parse(request.body);

      const nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
      const followUp = await crmRepo.addFollowUp(app.db, {
        leadId,
        content: body.content,
        nextFollowUpAt,
      });
      const lead = await crmRepo.updateLead(app.db, leadId, {
        nextFollowUpAt,
        status: 'follow_up',
      });

      return { followUp, lead };
    });

    app.get('/v1/leads/:leadId/follow-ups', { preHandler: app.requireAdmin }, async (request) => {
      const { leadId } = request.params as { leadId: string };
      await crmRepo.requireLead(app.db, leadId);
      return { followUps: await crmRepo.listFollowUps(app.db, leadId) };
    });

    app.post('/v1/leads/:leadId/convert', { preHandler: app.requireAdmin }, async (request) => {
      const { leadId } = request.params as { leadId: string };
      const body = convertSchema.parse(request.body);
      const lead = await crmRepo.requireLead(app.db, leadId);

      let guardian = await peopleRepo.findGuardianByPhone(app.db, lead.phone);
      if (!guardian) {
        guardian = await peopleRepo.createGuardian(app.db, {
          name: lead.guardianName,
          phone: lead.phone,
        });
      }

      const student = await peopleRepo.createStudent(app.db, {
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
    });
  },
};
