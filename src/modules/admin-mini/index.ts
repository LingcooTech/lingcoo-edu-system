import { desc } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '../../db/schema.js';
import type { AppModule } from '../types.js';

const searchQuerySchema = z.object({
  q: z.string().optional(),
});

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function inRange(value: Date | null, from: Date, to: Date) {
  return Boolean(value && value >= from && value < to);
}

function money(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function includesText(value: unknown, keyword: string) {
  return String(value ?? '')
    .toLowerCase()
    .includes(keyword);
}

export const adminMiniModule: AppModule = {
  name: 'admin-mini',
  async register(app) {
    app.get('/public/admin/overview', { preHandler: app.requireAdmin }, async () => {
      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const monthStart = startOfMonth(now);

      const [
        orders,
        students,
        guardians,
        leads,
        sessions,
        classes,
        courses,
        teachers,
        classrooms,
        courseContracts,
      ] = await Promise.all([
        app.db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)),
        app.db.select().from(schema.students).orderBy(desc(schema.students.createdAt)),
        app.db.select().from(schema.guardians),
        app.db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt)),
        app.db.select().from(schema.classSessions).orderBy(desc(schema.classSessions.startsAt)),
        app.db.select().from(schema.classes),
        app.db.select().from(schema.courses),
        app.db.select().from(schema.teachers),
        app.db.select().from(schema.classrooms),
        app.db.select().from(schema.courseContracts),
      ]);

      const studentById = new Map(students.map((item) => [item.id, item]));
      const guardianById = new Map(guardians.map((item) => [item.id, item]));
      const classById = new Map(classes.map((item) => [item.id, item]));
      const courseById = new Map(courses.map((item) => [item.id, item]));
      const teacherById = new Map(teachers.map((item) => [item.id, item]));
      const classroomById = new Map(classrooms.map((item) => [item.id, item]));

      const paidOrders = orders.filter((item) => item.status === 'paid');
      const monthPaidOrders = paidOrders.filter((item) =>
        inRange(item.paidAt ?? item.createdAt, monthStart, todayEnd),
      );
      const todaySessions = sessions.filter((item) => inRange(item.startsAt, todayStart, todayEnd));
      const upcomingSessions = sessions
        .filter((item) => item.startsAt >= todayStart)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .slice(0, 8);

      return {
        metrics: {
          todaySessions: todaySessions.length,
          todayLeads: leads.filter((item) => inRange(item.createdAt, todayStart, todayEnd)).length,
          monthRevenue: monthPaidOrders.reduce((sum, item) => sum + item.paidAmount, 0),
          monthRevenueLabel: money(monthPaidOrders.reduce((sum, item) => sum + item.paidAmount, 0)),
          paidOrders: paidOrders.length,
          pendingOrders: orders.filter((item) => item.status === 'pending').length,
          activeStudents: students.filter((item) => item.status === 'active').length,
          lowLessonPackages: courseContracts.filter(
            (item) => item.status === 'active' && item.remainingLessonCount <= 3,
          ).length,
        },
        recentOrders: orders.slice(0, 8).map((item) => {
          const student = item.studentId ? studentById.get(item.studentId) : null;
          const course = item.courseId ? courseById.get(item.courseId) : null;
          return {
            id: item.id,
            orderNo: item.orderNo,
            status: item.status,
            amount: item.amount,
            paidAmount: item.paidAmount,
            amountLabel: money(item.amount),
            paidAmountLabel: money(item.paidAmount),
            studentName: student?.name ?? '待完善',
            courseName: course?.name ?? '活动待确认',
            createdAt: item.createdAt.toISOString(),
          };
        }),
        recentStudents: students.slice(0, 8).map((item) => {
          const guardian = item.guardianId ? guardianById.get(item.guardianId) : null;
          const balances = courseContracts.filter(
            (contract) => contract.studentId === item.id && contract.status === 'active',
          );
          return {
            id: item.id,
            name: item.name,
            grade: item.grade,
            school: item.school ?? '',
            status: item.status,
            guardianName: guardian?.name ?? '',
            guardianPhone: guardian?.phone ?? '',
            balance: balances.reduce((sum, contract) => sum + contract.remainingLessonCount, 0),
            createdAt: item.createdAt.toISOString(),
          };
        }),
        upcomingSessions: upcomingSessions.map((item) => {
          const classGroup = item.classId ? classById.get(item.classId) : null;
          const course = courseById.get(item.courseId) ?? null;
          const teacher = teacherById.get(item.teacherId);
          const classroom = classroomById.get(item.classroomId);
          return {
            id: item.id,
            topic: item.topic,
            status: item.status,
            startsAt: item.startsAt.toISOString(),
            endsAt: item.endsAt.toISOString(),
            className: classGroup?.name ?? '活动组待确认',
            courseName: course?.name ?? '活动待确认',
            teacherName: teacher?.name ?? '机构导师待确认',
            classroomName: classroom?.name ?? '空间待确认',
          };
        }),
      };
    });

    app.get('/public/admin/search', { preHandler: app.requireAdmin }, async (request) => {
      const query = searchQuerySchema.parse(request.query);
      const keyword = query.q?.trim().toLowerCase() ?? '';
      if (!keyword) {
        return { keyword: '', students: [], guardians: [], orders: [], courses: [] };
      }

      const [students, guardians, orders, courses] = await Promise.all([
        app.db.select().from(schema.students).orderBy(desc(schema.students.createdAt)),
        app.db.select().from(schema.guardians).orderBy(desc(schema.guardians.createdAt)),
        app.db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)),
        app.db.select().from(schema.courses).orderBy(desc(schema.courses.createdAt)),
      ]);

      const studentById = new Map(students.map((item) => [item.id, item]));
      const courseById = new Map(courses.map((item) => [item.id, item]));

      return {
        keyword,
        students: students
          .filter(
            (item) =>
              includesText(item.name, keyword) ||
              includesText(item.grade, keyword) ||
              includesText(item.school, keyword),
          )
          .slice(0, 10),
        guardians: guardians
          .filter((item) => includesText(item.name, keyword) || includesText(item.phone, keyword))
          .slice(0, 10),
        orders: orders
          .filter((item) => {
            const student = item.studentId ? studentById.get(item.studentId) : null;
            const course = item.courseId ? courseById.get(item.courseId) : null;
            return (
              includesText(item.orderNo, keyword) ||
              includesText(item.status, keyword) ||
              includesText(student?.name, keyword) ||
              includesText(course?.name, keyword)
            );
          })
          .slice(0, 10)
          .map((item) => ({
            id: item.id,
            orderNo: item.orderNo,
            status: item.status,
            amountLabel: money(item.amount),
            paidAmountLabel: money(item.paidAmount),
            studentName: item.studentId
              ? (studentById.get(item.studentId)?.name ?? '待完善')
              : '待完善',
            courseName: item.courseId
              ? (courseById.get(item.courseId)?.name ?? '活动待确认')
              : '活动待确认',
            createdAt: item.createdAt.toISOString(),
          })),
        courses: courses
          .filter(
            (item) =>
              includesText(item.name, keyword) ||
              includesText(item.category, keyword) ||
              includesText(item.ageRange, keyword),
          )
          .slice(0, 10),
      };
    });
  },
};
