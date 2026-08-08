import * as lessonRepo from '../../db/repositories/lesson.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import { resolveBackofficeInstitutionScope } from '../../lib/institution-scope.js';
import type { AppModule } from '../types.js';

export const lessonModule: AppModule = {
  name: 'lesson',
  async register(app) {
    app.get('/v1/lesson-accounts', { preHandler: app.requireBackoffice }, async (request) => {
      const institutionId = await resolveBackofficeInstitutionScope(app.db, request.account);
      const [accounts, students, courses] = await Promise.all([
        lessonRepo.listLessonAccounts(app.db, institutionId),
        peopleRepo.listStudents(app.db),
        catalogRepo.listCourses(app.db),
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
    });

    app.get('/v1/lesson-transactions', { preHandler: app.requireBackoffice }, async (request) => {
      const institutionId = await resolveBackofficeInstitutionScope(app.db, request.account);
      return {
        lessonTransactions: await lessonRepo.listLessonTransactions(app.db, institutionId),
      };
    });
  },
};
