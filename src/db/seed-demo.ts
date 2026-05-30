/**
 * Demo-data enrichment for the seeded tenant (美智优品成长教室).
 *
 * The base `seed.ts` only creates the bare minimum (admin, tenant, two courses,
 * one trial, one student). This script layers a full, clickable招生→教学→消课
 * funnel on top so every admin page has realistic data:
 *
 *   leads (multiple statuses + sources) → follow-ups → converted student
 *   → class + enrollments → conflict-checked class sessions
 *   → attendance (auto-consumes lessons + writes the lesson ledger)
 *   → manual paid / pending orders
 *
 * It drives the real repositories (createClassSession + findScheduleConflict,
 * recordAttendance → applyLessonDelta) rather than raw inserts, so the demo data
 * respects the same business rules as the live API. Every entity is matched on a
 * natural key and created only when absent — re-running does not duplicate.
 *
 * Run after `npm run db:seed`:  tsx src/db/seed-demo.ts
 */
import { and, eq } from 'drizzle-orm';

import { db, pool } from './client.js';
import * as schema from './schema.js';
import { addFollowUp, createLead } from './repositories/crm.js';
import {
  createClass,
  createClassSession,
  findScheduleConflict,
} from './repositories/scheduling.js';
import { recordAttendance } from './repositories/attendance.js';
import { applyLessonDelta } from './repositories/lesson.js';

async function findOne<T>(rows: Promise<T[]>): Promise<T | undefined> {
  return (await rows)[0];
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}

async function seedDemo(): Promise<void> {
  // --- Anchor on the base data created by seed.ts ---------------------------
  const tenant = await findOne(
    db.select().from(schema.tenants).where(eq(schema.tenants.slug, 'meizhi')).limit(1),
  );
  if (!tenant) {
    throw new Error('基础数据缺失：请先运行 `npm run db:seed`');
  }
  const tenantId = tenant.id;

  const campus = required(
    await findOne(
      db
        .select()
        .from(schema.campuses)
        .where(and(eq(schema.campuses.tenantId, tenantId), eq(schema.campuses.name, '一里城校区')))
        .limit(1),
    ),
    '缺少校区，请先 npm run db:seed',
  );
  const teacher = required(
    await findOne(
      db
        .select()
        .from(schema.teachers)
        .where(and(eq(schema.teachers.tenantId, tenantId), eq(schema.teachers.name, '王老师')))
        .limit(1),
    ),
    '缺少老师，请先 npm run db:seed',
  );
  const classroom = required(
    await findOne(
      db
        .select()
        .from(schema.classrooms)
        .where(
          and(eq(schema.classrooms.tenantId, tenantId), eq(schema.classrooms.name, '成长教室 A')),
        )
        .limit(1),
    ),
    '缺少教室，请先 npm run db:seed',
  );
  const calligraphy = required(
    await findOne(
      db
        .select()
        .from(schema.courses)
        .where(
          and(eq(schema.courses.tenantId, tenantId), eq(schema.courses.slug, 'hard-pen-calligraphy')),
        )
        .limit(1),
    ),
    '缺少硬笔书法课程，请先 npm run db:seed',
  );
  const art = required(
    await findOne(
      db
        .select()
        .from(schema.courses)
        .where(and(eq(schema.courses.tenantId, tenantId), eq(schema.courses.slug, 'creative-art')))
        .limit(1),
    ),
    '缺少创意美术课程，请先 npm run db:seed',
  );
  const trial = await findOne(
    db
      .select()
      .from(schema.trialSessions)
      .where(
        and(
          eq(schema.trialSessions.tenantId, tenantId),
          eq(schema.trialSessions.title, '周六硬笔书法公开课'),
        ),
      )
      .limit(1),
  );
  const xiaoyu = required(
    await findOne(
      db
        .select()
        .from(schema.students)
        .where(and(eq(schema.students.tenantId, tenantId), eq(schema.students.name, '小宇')))
        .limit(1),
    ),
    '缺少学员 小宇，请先 npm run db:seed',
  );

  const doorPoster = required(
    await findOne(
      db
        .select()
        .from(schema.channels)
        .where(and(eq(schema.channels.tenantId, tenantId), eq(schema.channels.code, 'door_poster')))
        .limit(1),
    ),
    '缺少渠道 door_poster，请先 npm run db:seed',
  );
  const flyer = required(
    await findOne(
      db
        .select()
        .from(schema.channels)
        .where(and(eq(schema.channels.tenantId, tenantId), eq(schema.channels.code, 'flyer')))
        .limit(1),
    ),
    '缺少渠道 flyer，请先 npm run db:seed',
  );
  const wechatGroup = required(
    await findOne(
      db
        .select()
        .from(schema.channels)
        .where(and(eq(schema.channels.tenantId, tenantId), eq(schema.channels.code, 'wechat_group')))
        .limit(1),
    ),
    '缺少渠道 wechat_group，请先 npm run db:seed',
  );
  const summerBridge = required(
    await findOne(
      db
        .select()
        .from(schema.campaigns)
        .where(and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.code, 'summer_bridge')))
        .limit(1),
    ),
    '缺少活动 summer_bridge，请先 npm run db:seed',
  );
  const artFlyer = required(
    await findOne(
      db
        .select()
        .from(schema.campaigns)
        .where(and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.code, 'art_flyer')))
        .limit(1),
    ),
    '缺少活动 art_flyer，请先 npm run db:seed',
  );
  const weekendTrial = required(
    await findOne(
      db
        .select()
        .from(schema.campaigns)
        .where(and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.code, 'weekend_trial')))
        .limit(1),
    ),
    '缺少活动 weekend_trial，请先 npm run db:seed',
  );

  // --- Helpers ---------------------------------------------------------------
  async function ensureGuardian(name: string, phone: string) {
    const existing = await findOne(
      db
        .select()
        .from(schema.guardians)
        .where(and(eq(schema.guardians.tenantId, tenantId), eq(schema.guardians.phone, phone)))
        .limit(1),
    );
    if (existing) return existing;
    return required(
      await findOne(
        db.insert(schema.guardians).values({ tenantId, name, phone }).returning(),
      ),
      'guardian insert failed',
    );
  }

  async function ensureStudent(
    guardianId: string,
    name: string,
    grade: string,
    school: string,
  ) {
    const existing = await findOne(
      db
        .select()
        .from(schema.students)
        .where(and(eq(schema.students.tenantId, tenantId), eq(schema.students.name, name)))
        .limit(1),
    );
    if (existing) return existing;
    return required(
      await findOne(
        db
          .insert(schema.students)
          .values({ tenantId, guardianId, name, grade, school, status: 'active' })
          .returning(),
      ),
      'student insert failed',
    );
  }

  async function ensureLead(values: Omit<typeof schema.leads.$inferInsert, 'tenantId'>) {
    const existing = await findOne(
      db
        .select()
        .from(schema.leads)
        .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.phone, values.phone)))
        .limit(1),
    );
    if (existing) {
      return required(
        await findOne(
          db
            .update(schema.leads)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(schema.leads.id, existing.id))
            .returning(),
        ),
        'lead update failed',
      );
    }
    return createLead(db, { tenantId, ...values });
  }

  async function ensurePurchase(studentId: string, courseId: string, amount: number) {
    const account = await findOne(
      db
        .select()
        .from(schema.lessonAccounts)
        .where(
          and(
            eq(schema.lessonAccounts.studentId, studentId),
            eq(schema.lessonAccounts.courseId, courseId),
          ),
        )
        .limit(1),
    );
    if (account) return;
    await db.transaction(async (tx) => {
      await applyLessonDelta(tx, {
        tenantId,
        studentId,
        courseId,
        type: 'purchase',
        amount,
        relatedEntityType: 'order',
      });
    });
  }

  async function ensureEnrollment(classId: string, studentId: string) {
    const existing = await findOne(
      db
        .select()
        .from(schema.classEnrollments)
        .where(
          and(
            eq(schema.classEnrollments.classId, classId),
            eq(schema.classEnrollments.studentId, studentId),
          ),
        )
        .limit(1),
    );
    if (!existing) {
      await db.insert(schema.classEnrollments).values({ tenantId, classId, studentId, active: true });
    }
  }

  async function ensureSession(values: {
    classId: string;
    startsAt: Date;
    endsAt: Date;
    topic: string;
  }) {
    const existing = await findOne(
      db
        .select()
        .from(schema.classSessions)
        .where(
          and(
            eq(schema.classSessions.classId, values.classId),
            eq(schema.classSessions.startsAt, values.startsAt),
          ),
        )
        .limit(1),
    );
    if (existing) return existing;
    const conflict = await findScheduleConflict(db, {
      tenantId,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      classroomId: classroom.id,
      teacherId: teacher.id,
    });
    if (conflict) {
      console.log(JSON.stringify({ msg: 'skip session (conflict)', topic: values.topic }));
      return undefined;
    }
    return createClassSession(db, {
      tenantId,
      classId: values.classId,
      teacherId: teacher.id,
      classroomId: classroom.id,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      topic: values.topic,
    });
  }

  async function ensureOrder(values: {
    orderNo: string;
    studentId: string;
    courseId: string;
    amount: number;
    paidAmount: number;
    lessonCount: number;
    status: 'pending' | 'paid';
  }) {
    const existing = await findOne(
      db.select().from(schema.orders).where(eq(schema.orders.orderNo, values.orderNo)).limit(1),
    );
    if (existing) return;
    await db.insert(schema.orders).values({
      tenantId,
      studentId: values.studentId,
      courseId: values.courseId,
      orderNo: values.orderNo,
      amount: values.amount,
      paidAmount: values.paidAmount,
      lessonCount: values.lessonCount,
      status: values.status,
      paidAt: values.status === 'paid' ? new Date() : null,
    });
  }

  // --- 1. CRM funnel: leads across the full status spectrum -----------------
  await ensureLead({
    guardianName: '赵先生',
    phone: '13911110001',
    studentName: '赵子轩',
    grade: '幼儿园大班',
    status: 'new',
    source: 'door_poster',
    channelId: doorPoster.id,
    campaignId: summerBridge.id,
    medium: 'qr_code',
    courseId: calligraphy.id,
  });

  const leadContacted = await ensureLead({
    guardianName: '钱女士',
    phone: '13911110002',
    studentName: '钱朵朵',
    grade: '二年级',
    status: 'contacted',
    source: 'flyer',
    channelId: flyer.id,
    campaignId: artFlyer.id,
    medium: 'qr_code',
    courseId: art.id,
    nextFollowUpAt: new Date('2026-06-02T10:00:00+08:00'),
  });

  await ensureLead({
    guardianName: '孙女士',
    phone: '13911110003',
    studentName: '孙浩然',
    grade: '一年级',
    status: 'trial_booked',
    source: 'wechat_group',
    channelId: wechatGroup.id,
    campaignId: weekendTrial.id,
    medium: 'wechat_group',
    courseId: calligraphy.id,
    trialSessionId: trial?.id ?? null,
  });

  const leadTrialAttended = await ensureLead({
    guardianName: '周先生',
    phone: '13911110004',
    studentName: '周一诺',
    grade: '三年级',
    status: 'trial_attended',
    source: 'door_poster',
    channelId: doorPoster.id,
    campaignId: summerBridge.id,
    medium: 'qr_code',
    courseId: calligraphy.id,
  });

  // Follow-up notes give the lead detail pages a timeline.
  const contactedHasFollowUp = await findOne(
    db
      .select()
      .from(schema.followUpRecords)
      .where(eq(schema.followUpRecords.leadId, leadContacted.id))
      .limit(1),
  );
  if (!contactedHasFollowUp) {
    await addFollowUp(db, {
      tenantId,
      leadId: leadContacted.id,
      content: '电话联系，家长对创意美术感兴趣，约本周末到店试听。',
      nextFollowUpAt: new Date('2026-06-02T10:00:00+08:00'),
    });
  }
  const trialHasFollowUp = await findOne(
    db
      .select()
      .from(schema.followUpRecords)
      .where(eq(schema.followUpRecords.leadId, leadTrialAttended.id))
      .limit(1),
  );
  if (!trialHasFollowUp) {
    await addFollowUp(db, {
      tenantId,
      leadId: leadTrialAttended.id,
      content: '已到店试听，孩子坐姿专注，家长倾向报名硬笔书法基础班，待最终确认。',
      nextFollowUpAt: new Date('2026-06-03T18:00:00+08:00'),
    });
  }

  // --- 2. Converted lead → paid student (CRM #5) ----------------------------
  const wuGuardian = await ensureGuardian('吴女士', '13911110005');
  const wuStudent = await ensureStudent(wuGuardian.id, '吴梓萱', '二年级', '附近小学');
  await ensureLead({
    guardianName: '吴女士',
    phone: '13911110005',
    studentName: '吴梓萱',
    grade: '二年级',
    status: 'paid',
    source: 'flyer',
    channelId: flyer.id,
    campaignId: artFlyer.id,
    medium: 'qr_code',
    courseId: calligraphy.id,
    convertedStudentId: wuStudent.id,
  });

  // --- 3. Two more enrolled students with purchased lesson balances ----------
  const zhengGuardian = await ensureGuardian('郑女士', '13911110006');
  const zheng = await ensureStudent(zhengGuardian.id, '郑可欣', '一年级', '附近小学');
  const fengGuardian = await ensureGuardian('冯先生', '13911110007');
  const feng = await ensureStudent(fengGuardian.id, '冯子墨', '二年级', '附近小学');

  await ensurePurchase(zheng.id, calligraphy.id, 12);
  await ensurePurchase(feng.id, calligraphy.id, 12);

  // --- 4. Class + enrollments (teaching) ------------------------------------
  let cls = await findOne(
    db
      .select()
      .from(schema.classes)
      .where(and(eq(schema.classes.tenantId, tenantId), eq(schema.classes.name, '硬笔书法春季班')))
      .limit(1),
  );
  if (!cls) {
    cls = await createClass(db, {
      tenantId,
      campusId: campus.id,
      courseId: calligraphy.id,
      teacherId: teacher.id,
      classroomId: classroom.id,
      name: '硬笔书法春季班',
      capacity: 8,
      status: 'active',
    });
  }
  const classId = cls!.id;

  await ensureEnrollment(classId, xiaoyu.id);
  await ensureEnrollment(classId, zheng.id);
  await ensureEnrollment(classId, feng.id);

  // --- 5. Class sessions (conflict-checked) ----------------------------------
  const pastSession = await ensureSession({
    classId,
    startsAt: new Date('2026-05-24T10:00:00+08:00'),
    endsAt: new Date('2026-05-24T11:30:00+08:00'),
    topic: '基础笔画与坐姿',
  });
  await ensureSession({
    classId,
    startsAt: new Date('2026-06-07T10:00:00+08:00'),
    endsAt: new Date('2026-06-07T11:30:00+08:00'),
    topic: '横竖撇捺练习',
  });

  // --- 6. Attendance on the past session → auto-consume lessons + ledger -----
  if (pastSession) {
    const already = await findOne(
      db
        .select()
        .from(schema.attendanceRecords)
        .where(eq(schema.attendanceRecords.classSessionId, pastSession.id))
        .limit(1),
    );
    if (!already) {
      await recordAttendance(db, {
        tenantId,
        sessionId: pastSession.id,
        courseId: calligraphy.id,
        records: [
          { studentId: xiaoyu.id, status: 'present' },
          { studentId: zheng.id, status: 'present' },
          { studentId: feng.id, status: 'leave', note: '家长临时请假，安排补课' },
        ],
      });
    }
  }

  // --- 7. Finance: paid orders for the purchases + one pending order ---------
  await ensureOrder({
    orderNo: 'EDU202605290002',
    studentId: zheng.id,
    courseId: calligraphy.id,
    amount: 128000,
    paidAmount: 128000,
    lessonCount: 12,
    status: 'paid',
  });
  await ensureOrder({
    orderNo: 'EDU202605290003',
    studentId: feng.id,
    courseId: calligraphy.id,
    amount: 128000,
    paidAmount: 128000,
    lessonCount: 12,
    status: 'paid',
  });
  await ensureOrder({
    orderNo: 'EDU202605290004',
    studentId: wuStudent.id,
    courseId: art.id,
    amount: 98000,
    paidAmount: 0,
    lessonCount: 8,
    status: 'pending',
  });

  console.log(JSON.stringify({ msg: 'demo enrichment completed', tenantId, classId }));
}

seedDemo()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('demo enrichment failed', error);
    await pool.end();
    process.exit(1);
  });
