import type { Database } from '../db/client.js';
import * as accountsRepo from '../db/repositories/accounts.js';
import type { TeacherPermissions } from '../db/schema.js';

export const TEACHER_PERMISSION_KEYS = [
  'createClassSession',
  'createAdHocSession',
  'manageSessionRoster',
  'enrollStudents',
  'viewAllStudents',
  'setLessonUnits',
  'manageClasses',
] as const satisfies ReadonlyArray<keyof TeacherPermissions>;

export const ALL_TEACHER_PERMISSIONS: Required<TeacherPermissions> = {
  createClassSession: true,
  createAdHocSession: true,
  manageSessionRoster: true,
  enrollStudents: true,
  viewAllStudents: true,
  setLessonUnits: true,
  manageClasses: true,
};

export const NO_TEACHER_PERMISSIONS: Required<TeacherPermissions> = {
  createClassSession: false,
  createAdHocSession: false,
  manageSessionRoster: false,
  enrollStudents: false,
  viewAllStudents: false,
  setLessonUnits: false,
  manageClasses: false,
};

export function normalizeTeacherPermissions(
  permissions?: TeacherPermissions | null,
): Required<TeacherPermissions> {
  return { ...NO_TEACHER_PERMISSIONS, ...(permissions ?? {}) };
}

export async function resolveTeacherAccess(db: Database, accountId: string) {
  const [account, assignments] = await Promise.all([
    accountsRepo.findById(db, accountId),
    accountsRepo.listRoleAssignmentsForAccount(db, accountId),
  ]);
  if (!account || account.status !== 'active') {
    return null;
  }

  const teacherAssignment = assignments.find(
    (assignment) => assignment.role === 'teacher' && assignment.status === 'active',
  );
  const adminAssignment = assignments.find(
    (assignment) => assignment.role === 'admin' && assignment.status === 'active',
  );
  const teacherId =
    teacherAssignment?.teacherId ?? (account.role === 'teacher' ? account.teacherId : null);
  if (!teacherId) {
    return null;
  }

  return {
    account,
    teacherId,
    isAdminTeacher: Boolean(adminAssignment),
    permissions: adminAssignment
      ? ALL_TEACHER_PERMISSIONS
      : normalizeTeacherPermissions(teacherAssignment?.teacherPermissions),
  };
}

export function requireTeacherPermission(
  permissions: Required<TeacherPermissions>,
  permission: keyof TeacherPermissions,
) {
  if (!permissions[permission]) {
    throw Object.assign(new Error('该老师账号未开通此项权限'), { statusCode: 403 });
  }
}
