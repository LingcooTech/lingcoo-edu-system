import * as tenantRepo from '../../db/repositories/tenant.js';
import { requireTenant } from '../../db/repositories/tenant.js';
import type { AppModule } from '../types.js';

export const marketingModule: AppModule = {
  name: 'marketing',
  async register(app) {
    app.get('/v1/tenants/:tenantId/channels', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      await requireTenant(app.db, tenantId);
      return { channels: await tenantRepo.listChannels(app.db, tenantId) };
    });
  },
};
