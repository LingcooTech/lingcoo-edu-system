import * as catalogRepo from '../db/repositories/catalog.js';
import type { CoursePackage } from '../db/repositories/packages.js';
import type { Database } from '../db/client.js';
import { httpError } from '../lib/http-error.js';

export async function resolvePackageCourse(
  db: Database,
  pkg: CoursePackage,
  requestedCourseId?: string | null,
) {
  if (pkg.courseId) {
    if (requestedCourseId && requestedCourseId !== pkg.courseId) {
      throw httpError(422, '所选课程与课时包不匹配');
    }
    return catalogRepo.requireCourse(db, pkg.courseId);
  }

  if (pkg.courseSeriesId) {
    if (!requestedCourseId) {
      throw httpError(422, '请选择课时包适用的课程');
    }
    const course = await catalogRepo.requireCourse(db, requestedCourseId);
    if (course.courseSeriesId !== pkg.courseSeriesId) {
      throw httpError(422, '该课时包不适用于所选课程');
    }
    return course;
  }

  throw httpError(422, '该课时包未绑定课程或课程系列，暂不能使用');
}
