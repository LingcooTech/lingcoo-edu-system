import { z } from 'zod';

import * as accountsRepo from '../../db/repositories/accounts.js';
import * as catalogRepo from '../../db/repositories/catalog.js';
import * as peopleRepo from '../../db/repositories/people.js';
import * as schedulingRepo from '../../db/repositories/scheduling.js';
import * as teachingRepo from '../../db/repositories/teaching.js';
import type { AppModule } from '../types.js';

const teacherSchema = z.object({
  name: z.string().min(1),
  phone: z.string().default(''),
  specialties: z.array(z.string()).default([]),
  status: z.enum(['active', 'archived']).default('active'),
});

const teacherUpdateSchema = teacherSchema.partial();

const classroomSchema = z.object({
  campusId: z.string(),
  name: z.string().min(1),
  capacity: z.number().int().positive().default(8),
  status: z.enum(['active', 'archived']).default('active'),
});

const classroomUpdateSchema = classroomSchema.partial();

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

export const teachingModule: AppModule = {
  name: 'teaching',
  async register(app) {
    app.get('/public/teacher/dashboard', { preHandler: app.requireRole('teacher') }, async (request) => {
      const account = await accountsRepo.findById(app.db, request.account!.id);
      if (!account?.teacherId) {
        throw Object.assign(new Error('Teacher profile is not linked'), { statusCode: 422 });
      }

      const [sessions, classes, courses, classrooms, students] = await Promise.all([
        schedulingRepo.listClassSessions(app.db),
        schedulingRepo.listClasses(app.db),
        catalogRepo.listCourses(app.db),
        teachingRepo.listClassrooms(app.db),
        peopleRepo.listStudents(app.db),
      ]);
      const classById = new Map(classes.map((item) => [item.id, item]));
      const courseById = new Map(courses.map((item) => [item.id, item]));
      const classroomById = new Map(classrooms.map((item) => [item.id, item]));
      const studentById = new Map(students.map((item) => [item.id, item]));
      const myClasses = classes.filter((item) => item.teacherId === account.teacherId);

      const classCards = await Promise.all(
        myClasses.map(async (classGroup) => {
          const enrollments = await schedulingRepo.listEnrollments(app.db, classGroup.id);
          return {
            ...classGroup,
            course: courseById.get(classGroup.courseId),
            classroom: classroomById.get(classGroup.classroomId),
            students: enrollments
              .map((enrollment) => studentById.get(enrollment.studentId))
              .filter(Boolean)
              .map((student) => ({
                id: student!.id,
                name: student!.name,
                grade: student!.grade,
              })),
          };
        }),
      );

      return {
        sessions: sessions
          .filter((session) => session.teacherId === account.teacherId)
          .map((session) => {
            const classGroup = classById.get(session.classId);
            return {
              ...session,
              class: classGroup ? { name: classGroup.name } : undefined,
              course: classGroup ? courseById.get(classGroup.courseId) : undefined,
              classroom: classroomById.get(session.classroomId),
            };
          }),
        classes: classCards,
      };
    });

    app.get('/v1/teachers', { preHandler: app.requireAdmin }, async () => {
      return { teachers: await teachingRepo.listTeachers(app.db) };
    });

    app.post('/v1/teachers', { preHandler: app.requireAdmin }, async (request) => {
      const body = teacherSchema.parse(request.body);
      const teacher = await teachingRepo.createTeacher(app.db, body);
      return { teacher };
    });

    app.patch('/v1/teachers/:teacherId', { preHandler: app.requireAdmin }, async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const body = teacherUpdateSchema.parse(request.body);
      const teacher = await teachingRepo.updateTeacher(app.db, teacherId, body);
      if (!teacher) throw notFound('Teacher not found');
      return { teacher };
    });

    app.delete('/v1/teachers/:teacherId', { preHandler: app.requireAdmin }, async (request) => {
      const { teacherId } = request.params as { teacherId: string };
      const teacher = await teachingRepo.archiveTeacher(app.db, teacherId);
      if (!teacher) throw notFound('Teacher not found');
      return { teacher };
    });

    app.get('/v1/classrooms', { preHandler: app.requireAdmin }, async () => {
      return { classrooms: await teachingRepo.listClassrooms(app.db) };
    });

    app.post('/v1/classrooms', { preHandler: app.requireAdmin }, async (request) => {
      const body = classroomSchema.parse(request.body);
      const classroom = await teachingRepo.createClassroom(app.db, body);
      return { classroom };
    });

    app.patch(
      '/v1/classrooms/:classroomId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { classroomId } = request.params as { classroomId: string };
        const body = classroomUpdateSchema.parse(request.body);
        const classroom = await teachingRepo.updateClassroom(app.db, classroomId, body);
        if (!classroom) throw notFound('Classroom not found');
        return { classroom };
      },
    );

    app.delete(
      '/v1/classrooms/:classroomId',
      { preHandler: app.requireAdmin },
      async (request) => {
        const { classroomId } = request.params as { classroomId: string };
        const classroom = await teachingRepo.archiveClassroom(app.db, classroomId);
        if (!classroom) throw notFound('Classroom not found');
        return { classroom };
      },
    );
  },
};
