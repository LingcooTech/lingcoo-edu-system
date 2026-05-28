import type { AppModule } from '../types.js';
import { getModuleNames } from '../index.js';

export const systemModule: AppModule = {
  name: 'system',
  async register(app) {
    app.get('/health', async () => ({ ok: true }));
    app.get('/ready', async () => ({ ok: true, checks: { api: true } }));
    app.get('/v1/system/modules', async () => ({ modules: getModuleNames() }));
  },
};
