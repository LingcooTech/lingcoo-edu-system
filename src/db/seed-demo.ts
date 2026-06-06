/**
 * Demo-data enrichment for the single-institution seed.
 *
 * Run after `npm run db:seed`: tsx src/db/seed-demo.ts
 */
import { and, eq } from 'drizzle-orm';

import { db, pool } from './client.js';
import * as schema from './schema.js';
import { hashPassword } from '../lib/password.js';
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
  const campus = required(
    await findOne(
      db.select().from(schema.campuses).where(eq(schema.campuses.name, '一里城校区')).limit(1),
    ),
    '缺少校区，请先 npm run db:seed',
  );
  const teacher = required(
    await findOne(
      db.select().from(schema.teachers).where(eq(schema.teachers.name, '王老师')).limit(1),
    ),
    '缺少老师，请先 npm run db:seed',
  );
  const classroom = required(
    await findOne(
      db
        .select()
        .from(schema.classrooms)
        .where(eq(schema.classrooms.name, '成长教室 A'))
        .limit(1),
    ),
    '缺少教室，请先 npm run db:seed',
  );
  const calligraphy = required(
    await findOne(
      db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.slug, 'hard-pen-calligraphy'))
        .limit(1),
    ),
    '缺少硬笔书法课程，请先 npm run db:seed',
  );
  const art = required(
    await findOne(
      db.select().from(schema.courses).where(eq(schema.courses.slug, 'creative-art')).limit(1),
    ),
    '缺少创意美术课程，请先 npm run db:seed',
  );
  const trial = await findOne(
    db
      .select()
      .from(schema.trialSessions)
      .where(eq(schema.trialSessions.title, '周六硬笔书法公开课'))
      .limit(1),
  );
  const xiaoyu = required(
    await findOne(
      db.select().from(schema.students).where(eq(schema.students.name, '小宇')).limit(1),
    ),
    '缺少学员 小宇，请先 npm run db:seed',
  );

  const doorPoster = required(
    await findOne(
      db.select().from(schema.channels).where(eq(schema.channels.code, 'door_poster')).limit(1),
    ),
    '缺少渠道 door_poster，请先 npm run db:seed',
  );
  const flyer = required(
    await findOne(
      db.select().from(schema.channels).where(eq(schema.channels.code, 'flyer')).limit(1),
    ),
    '缺少渠道 flyer，请先 npm run db:seed',
  );
  const wechatGroup = required(
    await findOne(
      db.select().from(schema.channels).where(eq(schema.channels.code, 'wechat_group')).limit(1),
    ),
    '缺少渠道 wechat_group，请先 npm run db:seed',
  );
  const summerBridge = required(
    await findOne(
      db
        .select()
        .from(schema.campaigns)
        .where(eq(schema.campaigns.code, 'summer_bridge'))
        .limit(1),
    ),
    '缺少活动 summer_bridge，请先 npm run db:seed',
  );
  const artFlyer = required(
    await findOne(
      db.select().from(schema.campaigns).where(eq(schema.campaigns.code, 'art_flyer')).limit(1),
    ),
    '缺少活动 art_flyer，请先 npm run db:seed',
  );
  const weekendTrial = required(
    await findOne(
      db
        .select()
        .from(schema.campaigns)
        .where(eq(schema.campaigns.code, 'weekend_trial'))
        .limit(1),
    ),
    '缺少活动 weekend_trial，请先 npm run db:seed',
  );

  async function ensureGuardian(name: string, phone: string) {
    const existing = await findOne(
      db.select().from(schema.guardians).where(eq(schema.guardians.phone, phone)).limit(1),
    );
    if (existing) return existing;
    return required(
      await findOne(db.insert(schema.guardians).values({ name, phone }).returning()),
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
      db.select().from(schema.students).where(eq(schema.students.name, name)).limit(1),
    );
    if (existing) return existing;
    return required(
      await findOne(
        db
          .insert(schema.students)
          .values({ guardianId, name, grade, school, status: 'active' })
          .returning(),
      ),
      'student insert failed',
    );
  }

  // A parent login account linked to a guardian (CRM contact). Default password
  // is the phone's last 6 digits, with a forced change on first login.
  async function ensureParentAccount(guardianId: string, displayName: string, phone: string) {
    const existing = await findOne(
      db.select().from(schema.accounts).where(eq(schema.accounts.phone, phone)).limit(1),
    );
    if (existing) return existing;
    return required(
      await findOne(
        db
          .insert(schema.accounts)
          .values({
            role: 'parent',
            phone,
            displayName,
            passwordHash: hashPassword(phone.slice(-6)),
            mustChangePassword: true,
            guardianId,
          })
          .returning(),
      ),
      'parent account insert failed',
    );
  }

  async function ensureLead(values: typeof schema.leads.$inferInsert) {
    const existing = await findOne(
      db.select().from(schema.leads).where(eq(schema.leads.phone, values.phone)).limit(1),
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
    return createLead(db, values);
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
      await db.insert(schema.classEnrollments).values({ classId, studentId, active: true });
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

  const contactedHasFollowUp = await findOne(
    db
      .select()
      .from(schema.followUpRecords)
      .where(eq(schema.followUpRecords.leadId, leadContacted.id))
      .limit(1),
  );
  if (!contactedHasFollowUp) {
    await addFollowUp(db, {
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
      leadId: leadTrialAttended.id,
      content: '已到店试听，孩子坐姿专注，家长倾向报名硬笔书法基础班，待最终确认。',
      nextFollowUpAt: new Date('2026-06-03T18:00:00+08:00'),
    });
  }

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

  const zhengGuardian = await ensureGuardian('郑女士', '13911110006');
  const zheng = await ensureStudent(zhengGuardian.id, '郑可欣', '一年级', '附近小学');
  // Demo parent login: 手机号 13911110006 / 默认密码 110006(首登强制改密)
  await ensureParentAccount(zhengGuardian.id, '郑女士', '13911110006');
  const fengGuardian = await ensureGuardian('冯先生', '13911110007');
  const feng = await ensureStudent(fengGuardian.id, '冯子墨', '二年级', '附近小学');

  await ensurePurchase(zheng.id, calligraphy.id, 12);
  await ensurePurchase(feng.id, calligraphy.id, 12);

  let cls = await findOne(
    db.select().from(schema.classes).where(eq(schema.classes.name, '硬笔书法春季班')).limit(1),
  );
  if (!cls) {
    cls = await createClass(db, {
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

  // --- 机构（教师所属机构）+ 教师档案补充 ---
  async function ensureInstitution(values: { name: string; intro: string; contact: string }) {
    const existing = await findOne(
      db
        .select()
        .from(schema.institutions)
        .where(eq(schema.institutions.name, values.name))
        .limit(1),
    );
    if (existing) return existing;
    return required(
      await findOne(db.insert(schema.institutions).values(values).returning()),
      'institution insert failed',
    );
  }

  const futureAcademy = await ensureInstitution({
    name: '未来书院',
    intro: '专注 6-12 岁中文书写与表达训练，小班教学、固定老师跟进。',
    contact: '微信 future-academy · 电话 0571-8888 0001',
  });
  const artStudio = await ensureInstitution({
    name: '童心美育',
    intro: '以创意美术启发孩子观察力与想象力的社区美育机构。',
    contact: '微信 tongxin-art · 电话 0571-8888 0002',
  });

  // 把基础种子里的王老师绑定到机构，并补充一句话简介。
  await db
    .update(schema.teachers)
    .set({
      institutionId: futureAcademy.id,
      tagline: '十年硬笔书法教学，擅长帮孩子稳定坐姿与笔画基础。',
      updatedAt: new Date(),
    })
    .where(eq(schema.teachers.id, teacher.id));

  // 再加一位隶属另一机构的老师，让前台机构 Tab 有对比。
  const existingLi = await findOne(
    db.select().from(schema.teachers).where(eq(schema.teachers.name, '李老师')).limit(1),
  );
  if (!existingLi) {
    await db.insert(schema.teachers).values({
      name: '李老师',
      title: '创意美术老师',
      institutionId: artStudio.id,
      tagline: '带孩子从涂鸦到创作，让每一幅画都有自己的故事。',
      specialties: ['创意美术', '儿童手工', '色彩启蒙'],
      status: 'active',
    });
  }

  console.log(JSON.stringify({ msg: 'demo enrichment completed', classId }));
}

seedDemo()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('demo enrichment failed', error);
    await pool.end();
    process.exit(1);
  });
