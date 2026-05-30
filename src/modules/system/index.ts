import { z } from 'zod';

import { QiniuSettingsService } from '../../lib/qiniu-settings.js';
import { SmtpSettingsService } from '../../lib/smtp-settings.js';
import type { AppModule } from '../types.js';
import { getModuleNames } from '../index.js';

const smtpSettingsSchema = z.object({
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.string().optional(),
});

const smtpTestSchema = smtpSettingsSchema.extend({
  testTo: z.string().email(),
});

const qiniuSettingsSchema = z.object({
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
  bucketName: z.string().optional(),
  publicBaseUrl: z.string().optional(),
  uploadHost: z.string().optional(),
  defaultPrefix: z.string().optional(),
});

export const systemModule: AppModule = {
  name: 'system',
  async register(app) {
    app.get('/health', async () => ({ ok: true }));
    app.get('/ready', async () => ({ ok: true, checks: { api: true } }));
    app.get('/v1/system/modules', async () => ({ modules: getModuleNames() }));

    app.get('/v1/system-settings/smtp', { preHandler: app.authenticate }, async () => {
      return new SmtpSettingsService(app.db, app.appEnv).getOverview();
    });

    app.put('/v1/system-settings/smtp', { preHandler: app.authenticate }, async (request) => {
      const payload = smtpSettingsSchema.parse(request.body);
      const updatedBy = (request.user as { sub?: string }).sub;
      return new SmtpSettingsService(app.db, app.appEnv).upsertSettings(payload, updatedBy);
    });

    app.post('/v1/system-settings/smtp/test', { preHandler: app.authenticate }, async (request) => {
      const payload = smtpTestSchema.parse(request.body);
      return new SmtpSettingsService(app.db, app.appEnv).testConnection(payload);
    });

    app.delete('/v1/system-settings/smtp', { preHandler: app.authenticate }, async () => {
      await new SmtpSettingsService(app.db, app.appEnv).clearSettings();
      return { ok: true };
    });

    app.get('/v1/system-settings/qiniu', { preHandler: app.authenticate }, async () => {
      return new QiniuSettingsService(app.db, app.appEnv).getOverview();
    });

    app.put('/v1/system-settings/qiniu', { preHandler: app.authenticate }, async (request) => {
      const payload = qiniuSettingsSchema.parse(request.body);
      const updatedBy = (request.user as { sub?: string }).sub;
      return new QiniuSettingsService(app.db, app.appEnv).upsertSettings(payload, updatedBy);
    });

    app.post('/v1/system-settings/qiniu/test', { preHandler: app.authenticate }, async (request) => {
      const payload = qiniuSettingsSchema.parse(request.body ?? {});
      return new QiniuSettingsService(app.db, app.appEnv).testConnection(payload);
    });

    app.delete('/v1/system-settings/qiniu', { preHandler: app.authenticate }, async () => {
      await new QiniuSettingsService(app.db, app.appEnv).clearSettings();
      return { ok: true };
    });
  },
};
