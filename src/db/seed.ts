/**
 * Idempotent seed for the single-institution demo deployment.
 *
 * Re-runnable: every entity is matched on a natural key (email / code / slug /
 * name) and inserted only when absent.
 */
import { and, eq } from 'drizzle-orm';

import { db, pool } from './client.js';
import * as schema from './schema.js';
import { hashPassword } from '../lib/password.js';

async function findOne<T>(rows: Promise<T[]>): Promise<T | undefined> {
  return (await rows)[0];
}

async function seed(): Promise<void> {
  let admin = await findOne(
    db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.email, 'admin@fd-edu.local'))
      .limit(1),
  );
  if (!admin) {
    admin = await findOne(
      db
        .insert(schema.accounts)
        .values({
          role: 'admin',
          email: 'admin@fd-edu.local',
          displayName: '系统管理员',
          passwordHash: hashPassword('admin123456'),
        })
        .returning(),
    );
  }

  let organization = await findOne(db.select().from(schema.organization).limit(1));
  if (!organization) {
    organization = await findOne(
      db
        .insert(schema.organization)
        .values({
          name: '美智优品成长教室',
          brandName: '美智优品儿童成长教室',
          phone: '13800000000',
          address: '社区门店一楼成长教室',
          settings: {
            publicProfile: {
              eyebrow: '社区小班成长教室',
              bannerTitle: '社区里的儿童成长课堂',
              bannerSubtitle: '专注硬笔书法、创意美术与幼小衔接，让孩子在稳定陪伴中建立学习习惯。',
              highlights: [
                {
                  icon: 'map-pin',
                  title: '离家近',
                  text: '扎根社区，让教育资源到家门口',
                  imageUrl:
                    'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80',
                },
                {
                  icon: 'graduation-cap',
                  title: '小班教学',
                  text: '老师关注每个孩子的课堂状态',
                  imageUrl:
                    'https://images.unsplash.com/photo-1497486751825-1233686d5d80?auto=format&fit=crop&w=1200&q=80',
                },
                {
                  icon: 'message-circle',
                  title: '反馈可追踪',
                  text: '课后反馈清晰，家长持续看到进步',
                  imageUrl:
                    'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1200&q=80',
                },
              ],
              stats: ['6-8 人小班', '课后反馈', '社区近距离服务'],
              testimonials: [
                {
                  name: '一年级家长',
                  avatarUrl: '',
                  content: '老师反馈很及时，孩子写字习惯比之前稳定很多。',
                },
                {
                  name: '小班学员家长',
                  avatarUrl: '',
                  content: '离家近、班级小，孩子每周都愿意来上课。',
                },
              ],
              contentMarketingTitle: '成长故事',
              studentStories: [
                {
                  title: '从不敢下笔到主动完成一页练习',
                  studentName: '二年级学员 小羽',
                  summary: '通过硬笔书法小班训练，小羽先稳定坐姿和控笔，再逐步建立每日练习节奏。',
                  coverImageUrl:
                    'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80',
                  content:
                    '刚来试听时，小羽写字容易急，笔画轻重不稳定。老师先从坐姿、握笔和基础控笔开始，每节课保留一段可完成的小目标。四周后，小羽能独立完成一页练习，也愿意把课堂作品带回家给家长看。',
                },
                {
                  title: '把创意美术变成稳定表达',
                  studentName: '大班学员 安安',
                  summary: '从随意涂画到能讲出作品主题，孩子在材料探索中慢慢建立表达自信。',
                  coverImageUrl:
                    'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1200&q=80',
                  content:
                    '安安一开始喜欢颜色，但很少说作品想表达什么。老师用故事主题和材料任务引导她先观察、再选择、最后描述作品。连续几次课后，她开始主动讲自己的画面，也能听同伴分享并补充想法。',
                },
              ],
              growthLoop: {
                eyebrow: '成长闭环',
                title: '让课程围绕孩子持续迭代',
                summary: '目标、计划、课堂、反馈、复盘、调整，形成可追踪的成长路径。',
                primaryCtaText: '预约成长评估',
                primaryCtaLink: '/register',
                secondaryCtaText: '电话咨询',
                secondaryCtaLink: 'tel:15269284351',
                backgroundColor: '#211f1c',
                backgroundImageUrl: '',
                steps: [
                  { icon: 'search', title: '了解孩子' },
                  { icon: 'target', title: '共同确定目标' },
                  { icon: 'clipboard-list', title: '制定成长计划' },
                  { icon: 'users-round', title: '小班教学实施' },
                  { icon: 'camera', title: '课后反馈记录' },
                  { icon: 'bar-chart-3', title: '阶段复盘' },
                  { icon: 'refresh-cw', title: '调整目标计划' },
                  { icon: 'arrow-right', title: '进入下一阶段' },
                ],
              },
            },
            branding: {
              primaryColor: '#1f6f5b',
              secondaryColor: '#f2a65a',
              backgroundColor: '#fbf7ef',
              cardColor: '#ffffff',
              textColor: '#23312b',
              radius: '18px',
            },
          },
        })
        .returning(),
    );
  }

  for (const story of [
    {
      slug: 'xiao-yu-calligraphy-growth',
      title: '从不敢下笔到主动完成一页练习',
      authorName: '二年级学员 小羽',
      excerpt: '通过硬笔书法小班训练，小羽先稳定坐姿和控笔，再逐步建立每日练习节奏。',
      coverUrl:
        'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80',
      content:
        '刚来试听时，小羽写字容易急，笔画轻重不稳定。\n\n老师先从坐姿、握笔和基础控笔开始，每节课保留一段可完成的小目标。四周后，小羽能独立完成一页练习，也愿意把课堂作品带回家给家长看。',
    },
    {
      slug: 'anan-creative-art-expression',
      title: '把创意美术变成稳定表达',
      authorName: '大班学员 安安',
      excerpt: '从随意涂画到能讲出作品主题，孩子在材料探索中慢慢建立表达自信。',
      coverUrl:
        'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1200&q=80',
      content:
        '安安一开始喜欢颜色，但很少说作品想表达什么。\n\n老师用故事主题和材料任务引导她先观察、再选择、最后描述作品。连续几次课后，她开始主动讲自己的画面，也能听同伴分享并补充想法。',
    },
  ]) {
    const existing = await findOne(
      db
        .select()
        .from(schema.contentItems)
        .where(eq(schema.contentItems.slug, story.slug))
        .limit(1),
    );
    if (!existing) {
      await db.insert(schema.contentItems).values({
        ...story,
        sourceType: 'manual',
        status: 'published',
        publishedAt: new Date(),
      });
    }
  }

  let campus = await findOne(
    db.select().from(schema.campuses).where(eq(schema.campuses.name, '一里城校区')).limit(1),
  );
  if (!campus) {
    campus = await findOne(
      db
        .insert(schema.campuses)
        .values({ name: '一里城校区', address: '社区门店一楼成长教室' })
        .returning(),
    );
  }
  const campusId = campus!.id;

  const channelIds: Record<string, string> = {};
  for (const channel of [
    { code: 'door_poster', name: '门口海报' },
    { code: 'flyer', name: '传单' },
    { code: 'wechat_group', name: '微信群' },
  ]) {
    let existing = await findOne(
      db.select().from(schema.channels).where(eq(schema.channels.code, channel.code)).limit(1),
    );
    if (!existing) {
      existing = await findOne(db.insert(schema.channels).values(channel).returning());
    }
    channelIds[channel.code] = existing!.id;
  }

  const courseDefs = [
    {
      slug: 'hard-pen-calligraphy',
      name: '硬笔书法基础班',
      category: '书法',
      ageRange: '幼儿园大班至小学三年级',
      durationMinutes: 90,
      status: 'published' as const,
      summary: '改善坐姿、握笔、控笔和基础笔画。',
      coverImageUrl:
        'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80',
    },
    {
      slug: 'creative-art',
      name: '儿童创意美术',
      category: '美术',
      ageRange: '4-9 岁',
      durationMinutes: 90,
      status: 'published' as const,
      summary: '围绕色彩、构图和手工材料展开的创意表达课。',
      coverImageUrl:
        'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1200&q=80',
    },
  ];
  const courseIds: Record<string, string> = {};
  for (const def of courseDefs) {
    let course = await findOne(
      db.select().from(schema.courses).where(eq(schema.courses.slug, def.slug)).limit(1),
    );
    if (!course) {
      course = await findOne(
        db
          .insert(schema.courses)
          .values({ campusId, ...def })
          .returning(),
      );
    }
    courseIds[def.slug] = course!.id;
  }
  const calligraphyCourseId = courseIds['hard-pen-calligraphy'];

  for (const campaign of [
    {
      channelId: channelIds.door_poster,
      code: 'summer_bridge',
      name: '暑期幼小衔接海报',
      courseSlug: 'hard-pen-calligraphy',
      medium: 'qr_code',
      status: 'active' as const,
    },
    {
      channelId: channelIds.flyer,
      code: 'art_flyer',
      name: '创意美术传单',
      courseSlug: 'creative-art',
      medium: 'qr_code',
      status: 'active' as const,
    },
    {
      channelId: channelIds.wechat_group,
      code: 'weekend_trial',
      name: '周末公开课微信群',
      courseSlug: 'hard-pen-calligraphy',
      medium: 'wechat_group',
      status: 'active' as const,
    },
  ]) {
    const existing = await findOne(
      db.select().from(schema.campaigns).where(eq(schema.campaigns.code, campaign.code)).limit(1),
    );
    if (!existing) {
      await db.insert(schema.campaigns).values(campaign);
    }
  }

  const trialTitle = '周六硬笔书法公开课';
  const existingTrial = await findOne(
    db
      .select()
      .from(schema.trialSessions)
      .where(eq(schema.trialSessions.title, trialTitle))
      .limit(1),
  );
  if (!existingTrial) {
    await db.insert(schema.trialSessions).values({
      campusId,
      courseId: calligraphyCourseId,
      title: trialTitle,
      startsAt: new Date('2026-06-06T10:00:00+08:00'),
      endsAt: new Date('2026-06-06T11:30:00+08:00'),
      capacity: 8,
      bookedCount: 2,
      coverImageUrl:
        'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80',
      status: 'open',
    });
  }

  let teacher = await findOne(
    db.select().from(schema.teachers).where(eq(schema.teachers.name, '王老师')).limit(1),
  );
  if (!teacher) {
    teacher = await findOne(
      db
        .insert(schema.teachers)
        .values({
          name: '王老师',
          phone: '13600000000',
          specialties: ['硬笔书法', '控笔训练'],
        })
        .returning(),
    );
  }

  let classroom = await findOne(
    db.select().from(schema.classrooms).where(eq(schema.classrooms.name, '成长教室 A')).limit(1),
  );
  if (!classroom) {
    classroom = await findOne(
      db
        .insert(schema.classrooms)
        .values({ campusId, name: '成长教室 A', capacity: 8 })
        .returning(),
    );
  }

  let guardian = await findOne(
    db.select().from(schema.guardians).where(eq(schema.guardians.phone, '13900000000')).limit(1),
  );
  if (!guardian) {
    guardian = await findOne(
      db.insert(schema.guardians).values({ name: '李女士', phone: '13900000000' }).returning(),
    );
  }

  let student = await findOne(
    db.select().from(schema.students).where(eq(schema.students.name, '小宇')).limit(1),
  );
  if (!student) {
    student = await findOne(
      db
        .insert(schema.students)
        .values({
          guardianId: guardian!.id,
          name: '小宇',
          grade: '一年级',
          school: '附近小学',
          status: 'active',
        })
        .returning(),
    );
  }

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
          studentId: student!.id,
          courseId: calligraphyCourseId,
          balance: 11,
        })
        .returning(),
    );
    await db.insert(schema.lessonTransactions).values([
      {
        lessonAccountId: account!.id,
        studentId: student!.id,
        type: 'purchase',
        amount: 12,
        balanceAfter: 12,
        relatedEntityType: 'order',
      },
      {
        lessonAccountId: account!.id,
        studentId: student!.id,
        type: 'consume',
        amount: -1,
        balanceAfter: 11,
        relatedEntityType: 'class_session',
      },
    ]);
  }

  const order = await findOne(
    db.select().from(schema.orders).where(eq(schema.orders.orderNo, 'EDU202605280001')).limit(1),
  );
  if (!order) {
    await db.insert(schema.orders).values({
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

  console.log(JSON.stringify({ msg: 'seed completed', organizationId: organization!.id }));
}

seed()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('seed failed', error);
    await pool.end();
    process.exit(1);
  });
