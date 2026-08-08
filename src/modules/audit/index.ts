import { z } from 'zod';

import * as auditRepo from '../../db/repositories/audit.js';
import { resolveBackofficeInstitutionScope } from '../../lib/institution-scope.js';
import type { AppModule } from '../types.js';

const querySchema = z.object({
  action: z.string().trim().optional(),
  resourceType: z.string().trim().optional(),
  search: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const auditModule: AppModule = {
  name: 'audit',
  async register(app) {
    app.get(
      '/v1/audit-logs',
      { preHandler: app.requireRole('admin', 'institution_admin') },
      async (request) => {
        const query = querySchema.parse(request.query);
        const institutionId = await resolveBackofficeInstitutionScope(app.db, request.account);
        const [rows, facets] = await Promise.all([
          auditRepo.listAuditLogs(app.db, { ...query, institutionId }),
          auditRepo.listAuditFacets(app.db, institutionId),
        ]);
        return {
          auditLogs: rows.map((row) => ({
            ...row.auditLog,
            actor: row.auditLog.actorAccountId
              ? { displayName: row.actorDisplayName, email: row.actorEmail }
              : null,
            institution: row.auditLog.institutionId
              ? { id: row.auditLog.institutionId, name: row.institutionName }
              : null,
          })),
          facets,
        };
      },
    );
  },
};
