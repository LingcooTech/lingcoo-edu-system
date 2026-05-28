import { requireTenant, store } from '../../lib/store.js';
import type { AppModule } from '../types.js';

export const marketingModule: AppModule = {
  name: 'marketing',
  async register(app) {
    app.get('/v1/tenants/:tenantId/channels', { preHandler: app.authenticate }, async (request) => {
      const { tenantId } = request.params as { tenantId: string };
      requireTenant(tenantId);
      return { channels: store.channels.filter((channel) => channel.tenantId === tenantId) };
    });
  },
};
