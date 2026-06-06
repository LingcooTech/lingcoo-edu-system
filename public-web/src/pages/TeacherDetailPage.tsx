import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Camera,
  GraduationCap,
  MessageCircle,
  School,
  Sparkles,
  Star,
} from 'lucide-react';

import { fetchPublicTeacher, type Course, type PublicTeacherDetail } from '@/api/client';
import { Layout } from '@/components/Layout';
import { money } from '@/lib/utils';

export function TeacherDetailPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const [detail, setDetail] = useState<PublicTeacherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!teacherId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    fetchPublicTeacher(teacherId)
      .then(setDetail)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [teacherId]);

  return (
    <Layout>
      <section className="container-narrow py-10">
        <Link
          to="/teachers"
          className="text-ink-soft hover:text-ink inline-flex items-center gap-1 text-sm no-underline"
        >
          <ArrowLeft className="h-4 w-4" />
          返回教师团队
        </Link>

        {loading ? (
          <p className="text-muted mt-8 text-sm">加载中…</p>
        ) : notFound || !detail ? (
          <p className="text-muted mt-8 text-sm">没有找到这位老师，可能已下线。</p>
        ) : (
          <TeacherDetailBody detail={detail} />
        )}
      </section>
    </Layout>
  );
}

function TeacherDetailBody({ detail }: { detail: PublicTeacherDetail }) {
  const { teacher, institution } = detail;
  const profileSections = teacherProfileSections(teacher);
  const stats = teacherStats(teacher);
  const classPhotos = teacher.classPhotoUrls ?? [];
  const studentWorks = teacher.studentWorkUrls ?? [];
  const testimonials = teacher.parentTestimonials ?? [];

  return (
    <>
      <header className="relative mt-6 overflow-hidden rounded-3xl border border-[#d8c39a]/70 bg-[#fbf7ec] p-5 shadow-sm sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[auto_1fr_170px] lg:items-start">
          <div className="flex gap-4">
            {teacher.avatarUrl ? (
              <img
                src={teacher.avatarUrl}
                alt={teacher.name}
                className="h-28 w-28 rounded-2xl border border-[#d8c39a]/70 object-cover shadow-sm sm:h-36 sm:w-36"
              />
            ) : (
              <div className="bg-brand-soft text-brand flex h-28 w-28 items-center justify-center rounded-2xl border border-[#d8c39a]/70 sm:h-36 sm:w-36">
                <GraduationCap className="h-10 w-10" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            {institution ? <InstitutionMark institution={institution} className="mb-3" /> : null}
            <h1 className="text-ink text-3xl font-semibold tracking-tight">{teacher.name}</h1>
            {teacher.title ? (
              <div className="text-ink-soft mt-2 text-base font-medium">{teacher.title}</div>
            ) : null}
            <div className="mt-3 flex items-center gap-1 text-[#c68b2c]" aria-label="五星评价">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="h-4 w-4 fill-current" />
              ))}
            </div>

            {teacher.tagline ? (
              <p className="text-ink mt-4 max-w-2xl text-lg leading-8">{teacher.tagline}</p>
            ) : null}

            {stats.length > 0 ? (
              <div className="mt-5 grid max-w-xl grid-cols-3 gap-2">
                {stats.map((item) => (
                  <div key={item.label} className="rounded-2xl bg-white/75 px-3 py-3">
                    <div className="text-ink text-lg font-semibold">{item.value}</div>
                    <div className="text-muted mt-0.5 text-xs">{item.label}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2" aria-label="擅长方向">
              {teacher.specialties.map((item) => (
                <span key={item} className="chip">
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={`/register?teacherId=${teacher.id}`} className="pwbtn pwbtn-primary">
                预约试听
              </Link>
              {teacher.wechatQrUrl ? (
                <a
                  href={teacher.wechatQrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="pwbtn pwbtn-outline lg:hidden"
                >
                  微信咨询
                </a>
              ) : null}
              {teacher.wechatQrUrl ? (
                <a href="#teacher-wechat" className="pwbtn pwbtn-outline hidden lg:inline-flex">
                  微信咨询
                </a>
              ) : null}
            </div>
          </div>

          {teacher.wechatQrUrl ? (
            <div
              id="teacher-wechat"
              className="hidden rounded-2xl bg-white/70 p-3 lg:block lg:justify-self-end"
            >
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#17324d]">
                <MessageCircle className="h-4 w-4" />
                微信咨询
              </div>
              <img
                src={teacher.wechatQrUrl}
                alt={`${teacher.name}的微信二维码`}
                className="aspect-square w-36 rounded-xl bg-white object-contain p-2"
              />
            </div>
          ) : null}
        </div>
      </header>

      {teacher.teachingPhilosophy ? (
        <section className="pwcard mt-8 p-5 sm:p-6">
          <SectionHead eyebrow="Method" title="教学理念" />
          <p className="text-ink mt-4 max-w-3xl border-l-2 border-[#c9a76d] pl-4 text-base leading-8 whitespace-pre-line">
            {teacher.teachingPhilosophy}
          </p>
        </section>
      ) : null}

      {detail.courses.length > 0 ? <CoursesSection courses={detail.courses} /> : null}

      {classPhotos.length > 0 ? (
        <GallerySection title="课堂实拍" eyebrow="Classroom" urls={classPhotos} icon={Camera} />
      ) : null}

      {studentWorks.length > 0 ? (
        <GallerySection title="学员作品" eyebrow="Works" urls={studentWorks} icon={BookOpen} />
      ) : null}

      {testimonials.length > 0 ? <TestimonialsSection items={testimonials} /> : null}

      {profileSections.length > 0 ? (
        <section className="pwcard mt-8 p-5 sm:p-6">
          <SectionHead eyebrow="Profile" title="教学经历与资质" />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {profileSections.map((section) => (
              <ProfileSection key={section.key} section={section} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function teacherStats(teacher: PublicTeacherDetail['teacher']) {
  return [
    { label: '教学经验', value: teacher.teachingYears },
    { label: '累计学员', value: teacher.studentCount },
    { label: '续班率', value: teacher.retentionRate },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value?.trim()));
}

type ProfileKey = 'education' | 'teachingExperience' | 'teachingStyle' | 'achievements';

interface TeacherProfileSection {
  key: ProfileKey;
  label: string;
  text: string;
  icon: typeof School;
  tone: 'plain' | 'quote' | 'list';
}

function teacherProfileSections(teacher: PublicTeacherDetail['teacher']): TeacherProfileSection[] {
  const sections: TeacherProfileSection[] = [
    {
      key: 'education',
      label: '毕业院校 / 专业背景',
      text: teacher.education ?? '',
      icon: School,
      tone: 'plain',
    },
    {
      key: 'teachingExperience',
      label: '教学经验',
      text: teacher.teachingExperience ?? '',
      icon: BookOpen,
      tone: 'plain',
    },
    {
      key: 'teachingStyle',
      label: '教学风格',
      text: teacher.teachingStyle ?? '',
      icon: Sparkles,
      tone: 'quote',
    },
    {
      key: 'achievements',
      label: '荣誉奖项 / 代表经历',
      text: teacher.achievements ?? '',
      icon: Award,
      tone: 'list',
    },
  ];

  return sections.filter((section) => section.text.trim().length > 0);
}

function splitLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•\-*、\d.]+/, '').trim())
    .filter(Boolean);
}

function ProfileSection({ section }: { section: TeacherProfileSection }) {
  const Icon = section.icon;
  const lines = splitLines(section.text);

  return (
    <article className="border-line/80 bg-paper/40 rounded-2xl border p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#17324d] text-white">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-ink text-base font-semibold">{section.label}</h3>
      </div>

      {section.tone === 'list' && lines.length > 1 ? (
        <ul className="text-ink-soft mt-4 space-y-2 text-sm leading-7">
          {lines.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a76d]" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className={[
            'mt-4 text-sm leading-7 whitespace-pre-line',
            section.tone === 'quote'
              ? 'text-ink border-l-2 border-[#c9a76d] pl-4'
              : 'text-ink-soft',
          ].join(' ')}
        >
          {section.text}
        </p>
      )}
    </article>
  );
}

function coursePriceLabel(course: Course) {
  if (
    !course.packageCount ||
    course.startingPriceAmount === null ||
    course.startingPriceAmount === undefined
  ) {
    return '可预约试听';
  }
  return `${money(course.startingPriceAmount)} 起`;
}

function CoursesSection({ courses }: { courses: Course[] }) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-end justify-between">
        <SectionHead eyebrow="Courses" title="主讲课程" />
        <Link to="/courses" className="text-brand inline-flex items-center gap-1 text-sm">
          全部课程
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {courses.slice(0, 3).map((course) => (
          <Link
            key={course.id}
            to={`/courses/${course.slug}`}
            className="pwcard block p-5 no-underline"
          >
            <div className="text-ink text-base font-semibold">{course.name}</div>
            <div className="text-muted mt-1 text-xs">
              {course.category} · {course.ageRange} · {course.durationMinutes} 分钟
            </div>
            <p className="text-ink-soft mt-3 line-clamp-2 text-sm leading-6">{course.summary}</p>
            <div className="text-ink mt-4 text-sm font-semibold">{coursePriceLabel(course)}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function GallerySection({
  title,
  eyebrow,
  urls,
  icon: Icon,
}: {
  title: string;
  eyebrow: string;
  urls: string[];
  icon: typeof Camera;
}) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <div className="bg-brand-soft text-brand flex h-9 w-9 items-center justify-center rounded-full">
          <Icon className="h-4 w-4" />
        </div>
        <SectionHead eyebrow={eyebrow} title={title} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {urls.slice(0, 8).map((url, index) => (
          <img
            key={`${url}-${index}`}
            src={url}
            alt=""
            className="border-line aspect-[4/3] w-full rounded-2xl border bg-white object-cover"
          />
        ))}
      </div>
    </section>
  );
}

function TestimonialsSection({ items }: { items: string[] }) {
  return (
    <section className="mt-8">
      <SectionHead eyebrow="Parents" title="家长评价" />
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {items.slice(0, 6).map((item, index) => (
          <blockquote key={`${item}-${index}`} className="pwcard p-5">
            <p className="text-ink-soft text-sm leading-7">“{item}”</p>
          </blockquote>
        ))}
      </div>
    </section>
  );
}

function InstitutionMark({
  institution,
  className = '',
}: {
  institution: NonNullable<PublicTeacherDetail['institution']>;
  className?: string;
}) {
  if (institution.logoUrl) {
    return (
      <span className={`inline-flex max-w-full items-center ${className}`} title={institution.name}>
        <img
          src={institution.logoUrl}
          alt={institution.name}
          className="max-h-8 max-w-36 object-contain"
        />
        <span className="sr-only">{institution.name}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex h-10 max-w-full items-center rounded-full bg-white/70 px-3 text-sm font-medium text-[#17324d] ${className}`}
    >
      <span className="truncate">{institution.name}</span>
    </span>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="text-ink mt-1 text-lg font-semibold">{title}</h2>
    </div>
  );
}
