import * as lessonRepo from '../../db/repositories/lesson.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import type { AppModule } from '../types.js';

export const lessonModule: AppModule = {
  name: 'lesson',
  async register(app) {
    app.get('/v1/lesson-accounts', { preHandler: app.authenticate }, async () => {
      const [accounts, students, courses] = await Promise.all([
        lessonRepo.listLessonAccounts(app.db),
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

    app.get('/v1/lesson-transactions', { preHandler: app.authenticate }, async () => {
      return { lessonTransactions: await lessonRepo.listLessonTransactions(app.db) };
    });
  },
};
