import { z } from 'zod';

import { QiniuSettingsService } from '../../lib/qiniu-settings.js';
import { NotificationsService } from './service.js';
import type { AppModule } from '../types.js';

const uploadTokenSchema = z.object({
  filename: z.string().min(1),
  prefix: z.string().optional(),
});

const qiniuSettingsSchema = z.object({
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
  bucketName: z.string().optional(),
  publicBaseUrl: z.string().optional(),
  uploadHost: z.string().optional(),
  defaultPrefix: z.string().optional(),
});

export const notificationsModule: AppModule = {
  name: 'notifications',
  async register(app) {
    // --- Staff notifications ---
    app.get('/v1/notifications', { preHandler: app.authenticate }, async (request) => {
      const recipientId = (request.user as { sub: string }).sub;
      const service = new NotificationsService(app.db);
      const query = request.query as { status?: 'unread' | 'read' | 'archived'; limit?: string };
      const items = await service.listForRecipient({
        recipientType: 'staff',
        recipientId,
        status: query.status,
        limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
      });
      return { notifications: items };
    });

    app.get('/v1/notifications/unread-count', { preHandler: app.authenticate }, async (request) => {
      const recipientId = (request.user as { sub: string }).sub;
      const service = new NotificationsService(app.db);
      return { unreadCount: await service.countUnread('staff', recipientId) };
    });

    app.post(
      '/v1/notifications/:notificationId/read',
      { preHandler: app.authenticate },
      async (request) => {
        const recipientId = (request.user as { sub: string }).sub;
        const { notificationId } = request.params as { notificationId: string };
        const service = new NotificationsService(app.db);
        const item = await service.markAsRead(notificationId, recipientId);
        if (!item) {
          throw Object.assign(new Error('Notification not found'), { statusCode: 404 });
        }
        return { notification: item };
      },
    );

    app.post('/v1/notifications/read-all', { preHandler: app.authenticate }, async (request) => {
      const recipientId = (request.user as { sub: string }).sub;
      const service = new NotificationsService(app.db);
      return { updatedCount: await service.markAllAsRead('staff', recipientId) };
    });

    // --- Qiniu storage config + upload tokens (admin) ---
    app.get('/v1/storage/qiniu', { preHandler: app.authenticate }, async () => {
      const service = new QiniuSettingsService(app.db, app.appEnv);
      return { overview: await service.getOverview() };
    });

    app.put('/v1/storage/qiniu', { preHandler: app.authenticate }, async (request) => {
      const body = qiniuSettingsSchema.parse(request.body);
      const recipientId = (request.user as { sub: string }).sub;
      const service = new QiniuSettingsService(app.db, app.appEnv);
      return { overview: await service.upsertSettings(body, recipientId) };
    });

    app.post('/v1/storage/qiniu/test', { preHandler: app.authenticate }, async (request) => {
      const body = qiniuSettingsSchema.parse(request.body);
      const service = new QiniuSettingsService(app.db, app.appEnv);
      return service.testConnection(body);
    });

    app.get('/v1/storage/qiniu/images', { preHandler: app.authenticate }, async (request) => {
      const query = request.query as { prefix?: string; marker?: string; limit?: string };
      const service = new QiniuSettingsService(app.db, app.appEnv);
      return service.listImages({
        prefix: query.prefix,
        marker: query.marker,
        limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
      });
    });

    app.post('/v1/storage/qiniu/upload-token', { preHandler: app.authenticate }, async (request) => {
      const body = uploadTokenSchema.parse(request.body);
      const service = new QiniuSettingsService(app.db, app.appEnv);
      return service.createUploadToken(body);
    });
  },
};
