/**
 * Idempotent seed for the demo tenant (美智优品成长教室).
 *
 * Re-runnable: every entity is matched on a natural key (slug / email / code /
 * tenant-scoped name) and inserted only when absent. Running twice does not
 * create duplicates. This preserves the live demo data when the in-memory store
 * is retired in favour of PostgreSQL.
 */
import { and, eq } from 'drizzle-orm';

import { db, pool } from './client.js';
import * as schema from './schema.js';
import { hashPassword } from '../lib/password.js';

async function findOne<T>(rows: Promise<T[]>): Promise<T | undefined> {
  return (await rows)[0];
}

async function seed(): Promise<void> {
  // Admin user (auth reads this row once auth is DB-backed).
  let admin = await findOne(
    db.select().from(schema.users).where(eq(schema.users.email, 'admin@fd-edu.local')).limit(1),
  );
  if (!admin) {
    admin = await findOne(
      db
        .insert(schema.users)
        .values({
          email: 'admin@fd-edu.local',
          displayName: '系统管理员',
          passwordHash: hashPassword('admin123456'),
        })
        .returning(),
    );
  }

  // Tenant.
  let tenant = await findOne(
    db.select().from(schema.tenants).where(eq(schema.tenants.slug, 'meizhi')).limit(1),
  );
  if (!tenant) {
    tenant = await findOne(
      db
        .insert(schema.tenants)
        .values({
          slug: 'meizhi',
          name: '美智优品成长教室',
          brandName: '美智优品儿童成长教室',
          phone: '13800000000',
          address: '社区门店一楼成长教室',
          status: 'active',
        })
        .returning(),
    );
  }
  const tenantId = tenant!.id;

  // Membership.
  const membership = await findOne(
    db
      .select()
      .from(schema.tenantMemberships)
      .where(
        and(
          eq(schema.tenantMemberships.tenantId, tenantId),
          eq(schema.tenantMemberships.userId, admin!.id),
        ),
      )
      .limit(1),
  );
  if (!membership) {
    await db
      .insert(schema.tenantMemberships)
      .values({ tenantId, userId: admin!.id, role: 'owner' });
  }

  // Campus.
  let campus = await findOne(
    db
      .select()
      .from(schema.campuses)
      .where(and(eq(schema.campuses.tenantId, tenantId), eq(schema.campuses.name, '一里城校区')))
      .limit(1),
  );
  if (!campus) {
    campus = await findOne(
      db
        .insert(schema.campuses)
        .values({ tenantId, name: '一里城校区', address: '社区门店一楼成长教室' })
        .returning(),
    );
  }
  const campusId = campus!.id;

  // Channels.
  for (const channel of [
    { code: 'door_poster', name: '门口海报' },
    { code: 'flyer', name: '传单' },
    { code: 'wechat_group', name: '微信群' },
  ]) {
    const existing = await findOne(
      db
        .select()
        .from(schema.channels)
        .where(and(eq(schema.channels.tenantId, tenantId), eq(schema.channels.code, channel.code)))
        .limit(1),
    );
    if (!existing) {
      await db.insert(schema.channels).values({ tenantId, ...channel });
    }
  }

  // Courses.
  const courseDefs = [
    {
      slug: 'hard-pen-calligraphy',
      name: '硬笔书法基础班',
      category: '书法',
      ageRange: '幼儿园大班至小学三年级',
      lessonCount: 12,
      durationMinutes: 90,
      priceAmount: 128000,
      status: 'published' as const,
      summary: '改善坐姿、握笔、控笔和基础笔画。',
    },
    {
      slug: 'creative-art',
      name: '儿童创意美术',
      category: '美术',
      ageRange: '4-9 岁',
      lessonCount: 8,
      durationMinutes: 90,
      priceAmount: 98000,
      status: 'published' as const,
      summary: '围绕色彩、构图和手工材料展开的创意表达课。',
    },
  ];
  const courseIds: Record<string, string> = {};
  for (const def of courseDefs) {
    let course = await findOne(
      db
        .select()
        .from(schema.courses)
        .where(and(eq(schema.courses.tenantId, tenantId), eq(schema.courses.slug, def.slug)))
        .limit(1),
    );
    if (!course) {
      course = await findOne(
        db
          .insert(schema.courses)
          .values({ tenantId, campusId, ...def })
          .returning(),
      );
    }
    courseIds[def.slug] = course!.id;
  }
  const calligraphyCourseId = courseIds['hard-pen-calligraphy'];

  // Open trial session (周六硬笔书法公开课).
  const trialTitle = '周六硬笔书法公开课';
  const existingTrial = await findOne(
    db
      .select()
      .from(schema.trialSessions)
      .where(
        and(
          eq(schema.trialSessions.tenantId, tenantId),
          eq(schema.trialSessions.title, trialTitle),
        ),
      )
      .limit(1),
  );
  if (!existingTrial) {
    await db.insert(schema.trialSessions).values({
      tenantId,
      campusId,
      courseId: calligraphyCourseId,
      title: trialTitle,
      startsAt: new Date('2026-06-06T10:00:00+08:00'),
      endsAt: new Date('2026-06-06T11:30:00+08:00'),
      capacity: 8,
      bookedCount: 2,
      status: 'open',
    });
  }

  // Teacher.
  let teacher = await findOne(
    db
      .select()
      .from(schema.teachers)
      .where(and(eq(schema.teachers.tenantId, tenantId), eq(schema.teachers.name, '王老师')))
      .limit(1),
  );
  if (!teacher) {
    teacher = await findOne(
      db
        .insert(schema.teachers)
        .values({
          tenantId,
          name: '王老师',
          phone: '13600000000',
          specialties: ['硬笔书法', '控笔训练'],
        })
        .returning(),
    );
  }

  // Classroom.
  let classroom = await findOne(
    db
      .select()
      .from(schema.classrooms)
      .where(
        and(eq(schema.classrooms.tenantId, tenantId), eq(schema.classrooms.name, '成长教室 A')),
      )
      .limit(1),
  );
  if (!classroom) {
    classroom = await findOne(
      db
        .insert(schema.classrooms)
        .values({ tenantId, campusId, name: '成长教室 A', capacity: 8 })
        .returning(),
    );
  }

  // Guardian + student.
  let guardian = await findOne(
    db
      .select()
      .from(schema.guardians)
      .where(and(eq(schema.guardians.tenantId, tenantId), eq(schema.guardians.phone, '13900000000')))
      .limit(1),
  );
  if (!guardian) {
    guardian = await findOne(
      db
        .insert(schema.guardians)
        .values({ tenantId, name: '李女士', phone: '13900000000' })
        .returning(),
    );
  }

  let student = await findOne(
    db
      .select()
      .from(schema.students)
      .where(and(eq(schema.students.tenantId, tenantId), eq(schema.students.name, '小宇')))
      .limit(1),
  );
  if (!student) {
    student = await findOne(
      db
        .insert(schema.students)
        .values({
          tenantId,
          guardianId: guardian!.id,
          name: '小宇',
          grade: '一年级',
          school: '附近小学',
          status: 'active',
        })
        .returning(),
    );
  }

  // Lesson account + opening transactions (purchase 12, consume 1 → balance 11).
  let account = await findOne(
    db
      .select()
      .from(schema.lessonAccounts)
      .where(
        and(
          eq(schema.lessonAccounts.studentId, student!.id),
          eq(schema.lessonAccounts.courseId, calligraphyCourseId),
        ),
      )
      .limit(1),
  );
  if (!account) {
    account = await findOne(
      db
        .insert(schema.lessonAccounts)
        .values({
          tenantId,
          studentId: student!.id,
          courseId: calligraphyCourseId,
          balance: 11,
        })
        .returning(),
    );
    await db.insert(schema.lessonTransactions).values([
      {
        tenantId,
        lessonAccountId: account!.id,
        studentId: student!.id,
        type: 'purchase',
        amount: 12,
        balanceAfter: 12,
        relatedEntityType: 'order',
      },
      {
        tenantId,
        lessonAccountId: account!.id,
        studentId: student!.id,
        type: 'consume',
        amount: -1,
        balanceAfter: 11,
        relatedEntityType: 'class_session',
      },
    ]);
  }

  // Demo paid order.
  const order = await findOne(
    db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderNo, 'EDU202605280001'))
      .limit(1),
  );
  if (!order) {
    await db.insert(schema.orders).values({
      tenantId,
      studentId: student!.id,
      courseId: calligraphyCourseId,
      orderNo: 'EDU202605280001',
      amount: 128000,
      paidAmount: 128000,
      lessonCount: 12,
      status: 'paid',
      paidAt: new Date(),
    });
  }

  console.log(JSON.stringify({ msg: 'seed completed', tenantId, slug: 'meizhi' }));
}

seed()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('seed failed', error);
    await pool.end();
    process.exit(1);
  });
