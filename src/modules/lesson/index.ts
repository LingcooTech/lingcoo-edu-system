import * as lessonRepo from '../../db/repositories/lesson.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import { requireTenant } from '../../db/repositories/tenant.js';
import type { AppModule } from '../types.js';

export const lessonModule: AppModule = {
  name: 'lesson',
  async register(app) {
    app.get(
      '/v1/tenants/:tenantId/lesson-accounts',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);

        const [accounts, students, courses] = await Promise.all([
          lessonRepo.listLessonAccounts(app.db, tenantId),
          peopleRepo.listStudents(app.db, tenantId),
          catalogRepo.listCourses(app.db, tenantId),
        ]);
        const studentById = new Map(students.map((student) => [student.id, student]));
        const courseById = new Map(courses.map((course) => [course.id, course]));

        return {
          lessonAccounts: accounts.map((account) => ({
            ...account,
            student: studentById.get(account.studentId),
            course: courseById.get(account.courseId),
          })),
        };
      },
    );

    app.get(
      '/v1/tenants/:tenantId/lesson-transactions',
      { preHandler: app.authenticate },
      async (request) => {
        const { tenantId } = request.params as { tenantId: string };
        await requireTenant(app.db, tenantId);
        return { lessonTransactions: await lessonRepo.listLessonTransactions(app.db, tenantId) };
      },
    );
  },
};
