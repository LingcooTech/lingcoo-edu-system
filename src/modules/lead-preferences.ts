import * as catalogRepo from '../db/repositories/catalog.js';
import * as organizationRepo from '../db/repositories/organization.js';
import * as teachingRepo from '../db/repositories/teaching.js';
import type { Database } from '../db/client.js';

function unprocessable(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 422 });
}

function courseClassroomIds(course: Awaited<ReturnType<typeof catalogRepo.requireCourse>>) {
  return course.classroomIds?.length
    ? course.classroomIds
    : course.classroomId
      ? [course.classroomId]
      : [];
}

function courseTeacherIds(course: Awaited<ReturnType<typeof catalogRepo.requireCourse>>) {
  return course.defaultTeacherIds?.length
    ? course.defaultTeacherIds
    : course.defaultTeacherId
      ? [course.defaultTeacherId]
      : [];
}

export async function validateLeadPreferences(
  db: Database,
  input: {
    campusId: string;
    courseId?: string | null;
    preferredTeacherId?: string | null;
  },
) {
  const campuses = await organizationRepo.listCampuses(db);
  if (!campuses.some((campus) => campus.id === input.campusId)) {
    throw unprocessable('所选校区暂不可用');
  }

  const course = input.courseId ? await catalogRepo.requireCourse(db, input.courseId) : null;
  if (course) {
    const classroomIds = courseClassroomIds(course);
    if (classroomIds.length > 0) {
      const classrooms = await teachingRepo.findClassrooms(db, classroomIds);
      const campusIds = new Set(classrooms.map((classroom) => classroom.campusId));
      if (campusIds.size > 0 && !campusIds.has(input.campusId)) {
        throw unprocessable('所选校区暂不支持该课程');
      }
    } else if (course.campusId && course.campusId !== input.campusId) {
      throw unprocessable('所选校区暂不支持该课程');
    }
  }

  if (!input.preferredTeacherId) return;

  const teacher = await teachingRepo.findTeacher(db, input.preferredTeacherId);
  if (!teacher || teacher.status === 'archived') {
    throw unprocessable('所选老师暂不可用');
  }

  if (!course) return;

  const allowedTeacherIds = courseTeacherIds(course);
  if (allowedTeacherIds.length > 0 && !allowedTeacherIds.includes(input.preferredTeacherId)) {
    throw unprocessable('所选老师暂不支持该课程');
  }
}
