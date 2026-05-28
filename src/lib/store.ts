import type {
  AttendanceRecord,
  Channel,
  ClassEnrollment,
  ClassGroup,
  ClassSession,
  Classroom,
  Course,
  FollowUpRecord,
  Lead,
  LessonAccount,
  LessonTransaction,
  Order,
  Store,
  Student,
  Teacher,
  Tenant,
  TenantMembership,
  TrialSession,
  User,
} from './domain.js';

let counter = 1000;

export function createId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}`;
}

const tenant: Tenant = {
  id: 'tenant_demo',
  slug: 'meizhi',
  name: '美智优品成长教室',
  brandName: '美智优品儿童成长教室',
  phone: '13800000000',
  address: '社区门店一楼成长教室',
};

const campusId = 'campus_main';
const calligraphyCourseId = 'course_calligraphy';
const artCourseId = 'course_art';
const teacherId = 'teacher_wang';
const classroomId = 'classroom_a';
const classId = 'class_sat_morning';
const studentId = 'student_xiaoyu';
const guardianId = 'guardian_demo';
const lessonAccountId = 'lesson_account_demo';

export const store: Store = {
  users: [
    {
      id: 'user_admin',
      email: 'admin@fd-edu.local',
      displayName: '系统管理员',
      role: 'platform_admin',
    },
  ] satisfies User[],
  tenants: [tenant],
  campuses: [
    {
      id: campusId,
      tenantId: tenant.id,
      name: '一里城校区',
      address: tenant.address,
    },
  ],
  memberships: [
    {
      id: 'member_admin',
      tenantId: tenant.id,
      userId: 'user_admin',
      role: 'owner',
    },
  ] satisfies TenantMembership[],
  channels: [
    { id: 'channel_door_poster', tenantId: tenant.id, code: 'door_poster', name: '门口海报' },
    { id: 'channel_flyer', tenantId: tenant.id, code: 'flyer', name: '传单' },
    { id: 'channel_wechat_group', tenantId: tenant.id, code: 'wechat_group', name: '微信群' },
  ] satisfies Channel[],
  courses: [
    {
      id: calligraphyCourseId,
      tenantId: tenant.id,
      campusId,
      slug: 'hard-pen-calligraphy',
      name: '硬笔书法基础班',
      category: '书法',
      ageRange: '幼儿园大班至小学三年级',
      lessonCount: 12,
      durationMinutes: 90,
      priceAmount: 128000,
      status: 'published',
      summary: '改善坐姿、握笔、控笔和基础笔画。',
    },
    {
      id: artCourseId,
      tenantId: tenant.id,
      campusId,
      slug: 'creative-art',
      name: '儿童创意美术',
      category: '美术',
      ageRange: '4-9 岁',
      lessonCount: 8,
      durationMinutes: 90,
      priceAmount: 98000,
      status: 'published',
      summary: '围绕色彩、构图和手工材料展开的创意表达课。',
    },
  ] satisfies Course[],
  trialSessions: [
    {
      id: 'trial_sat_calligraphy',
      tenantId: tenant.id,
      campusId,
      courseId: calligraphyCourseId,
      title: '周六硬笔书法公开课',
      startsAt: '2026-06-06T10:00:00+08:00',
      endsAt: '2026-06-06T11:30:00+08:00',
      capacity: 8,
      bookedCount: 2,
      status: 'open',
    },
  ] satisfies TrialSession[],
  guardians: [{ id: guardianId, tenantId: tenant.id, name: '李女士', phone: '13900000000' }],
  students: [
    {
      id: studentId,
      tenantId: tenant.id,
      guardianId,
      name: '小宇',
      grade: '一年级',
      school: '附近小学',
      status: 'active',
    },
  ] satisfies Student[],
  leads: [
    {
      id: 'lead_demo',
      tenantId: tenant.id,
      campusId,
      courseId: calligraphyCourseId,
      trialSessionId: 'trial_sat_calligraphy',
      guardianName: '张女士',
      phone: '13700000000',
      studentName: '小米',
      grade: '大班',
      status: 'trial_booked',
      source: 'door_poster',
      createdAt: new Date().toISOString(),
    },
  ] satisfies Lead[],
  followUps: [] satisfies FollowUpRecord[],
  teachers: [
    {
      id: teacherId,
      tenantId: tenant.id,
      name: '王老师',
      phone: '13600000000',
      specialties: ['硬笔书法', '控笔训练'],
    },
  ] satisfies Teacher[],
  classrooms: [
    {
      id: classroomId,
      tenantId: tenant.id,
      campusId,
      name: '成长教室 A',
      capacity: 8,
    },
  ] satisfies Classroom[],
  classes: [
    {
      id: classId,
      tenantId: tenant.id,
      campusId,
      courseId: calligraphyCourseId,
      teacherId,
      classroomId,
      name: '周六上午硬笔基础班',
      capacity: 8,
      status: 'active',
    },
  ] satisfies ClassGroup[],
  enrollments: [
    { id: 'enrollment_demo', tenantId: tenant.id, classId, studentId, status: 'active' },
  ] satisfies ClassEnrollment[],
  classSessions: [
    {
      id: 'session_1',
      tenantId: tenant.id,
      classId,
      teacherId,
      classroomId,
      startsAt: '2026-06-13T10:00:00+08:00',
      endsAt: '2026-06-13T11:30:00+08:00',
      topic: '第一课：坐姿、握笔与横竖笔画',
      status: 'scheduled',
    },
  ] satisfies ClassSession[],
  attendanceRecords: [] satisfies AttendanceRecord[],
  lessonAccounts: [
    {
      id: lessonAccountId,
      tenantId: tenant.id,
      studentId,
      courseId: calligraphyCourseId,
      balance: 11,
    },
  ] satisfies LessonAccount[],
  lessonTransactions: [
    {
      id: 'lesson_tx_purchase_demo',
      tenantId: tenant.id,
      lessonAccountId,
      studentId,
      type: 'purchase',
      amount: 12,
      balanceAfter: 12,
      relatedEntityType: 'order',
      relatedEntityId: 'order_demo',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'lesson_tx_consume_demo',
      tenantId: tenant.id,
      lessonAccountId,
      studentId,
      type: 'consume',
      amount: -1,
      balanceAfter: 11,
      relatedEntityType: 'class_session',
      relatedEntityId: 'session_completed_demo',
      createdAt: new Date().toISOString(),
    },
  ] satisfies LessonTransaction[],
  orders: [
    {
      id: 'order_demo',
      tenantId: tenant.id,
      studentId,
      courseId: calligraphyCourseId,
      orderNo: 'EDU202605280001',
      amount: 128000,
      paidAmount: 128000,
      lessonCount: 12,
      status: 'paid',
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ] satisfies Order[],
};

export function requireTenant(tenantId: string): Tenant {
  const tenantRecord = store.tenants.find((item) => item.id === tenantId);
  if (!tenantRecord) {
    throw Object.assign(new Error('Tenant not found'), { statusCode: 404 });
  }

  return tenantRecord;
}

export function requireCourse(tenantId: string, courseId: string): Course {
  const course = store.courses.find((item) => item.tenantId === tenantId && item.id === courseId);
  if (!course) {
    throw Object.assign(new Error('Course not found'), { statusCode: 404 });
  }

  return course;
}

export function requireStudent(tenantId: string, studentId: string): Student {
  const student = store.students.find(
    (item) => item.tenantId === tenantId && item.id === studentId,
  );
  if (!student) {
    throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  }

  return student;
}
