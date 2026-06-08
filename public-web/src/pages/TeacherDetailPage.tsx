import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  BookOpen,
  GraduationCap,
  MessageCircle,
  School,
  Sparkles,
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
          <TeacherDetailSkeleton />
        ) : notFound || !detail ? (
          <p className="text-muted mt-8 text-sm">没有找到这位老师，可能已下线。</p>
        ) : (
          <TeacherDetailBody detail={detail} />
        )}
      </section>
    </Layout>
  );
}

function TeacherDetailSkeleton() {
  return (
    <div className="mt-6">
      <div className="pwcard p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="grid gap-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <div className="skeleton h-36 w-full" />
            <div>
              <div className="skeleton h-5 w-28" />
              <div className="skeleton mt-3 h-9 w-1/2" />
              <div className="skeleton mt-3 h-4 w-2/3" />
              <div className="mt-5 grid max-w-xl grid-cols-3 gap-2">
                <div className="skeleton h-16" />
                <div className="skeleton h-16" />
                <div className="skeleton h-16" />
              </div>
            </div>
          </div>
          <div>
            <div className="skeleton h-5 w-28" />
            <div className="skeleton mt-4 h-11 w-full" />
            <div className="skeleton mt-3 h-11 w-full" />
          </div>
        </div>
      </div>
      <div className="skeleton mt-8 h-40 w-full" />
    </div>
  );
}

function TeacherDetailBody({ detail }: { detail: PublicTeacherDetail }) {
  const { teacher, institution } = detail;
  const profileSections = teacherProfileSections(teacher);
  const stats = teacherStats(teacher);
  const classPhotos = teacher.classPhotoUrls ?? [];
  const studentWorks = teacher.studentWorkUrls ?? [];
  const testimonials = teacher.parentTestimonials ?? [];
  const hasIntro = Boolean(teacher.bio?.trim() || teacher.tagline?.trim());

  return (
    <>
      <header className="pwcard mt-6 p-5 shadow-sm sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-stretch">
          <div className="grid gap-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <TeacherAvatar teacher={teacher} />

            <div className="min-w-0">
              {institution ? <InstitutionMark institution={institution} className="mb-3" /> : null}
              <h1 className="text-ink text-3xl font-semibold tracking-tight sm:text-4xl">
                {teacher.name}
              </h1>
              {teacher.title ? (
                <div className="text-ink-soft mt-2 text-base font-medium">{teacher.title}</div>
              ) : null}

              {teacher.tagline ? (
                <p className="text-ink border-brand mt-4 max-w-2xl border-l-2 pl-4 text-base leading-8 sm:text-lg">
                  {teacher.tagline}
                </p>
              ) : null}

              {stats.length > 0 ? (
                <div className="mt-5 grid max-w-xl grid-cols-3 gap-2">
                  {stats.map((item) => (
                    <div key={item.label} className="bg-paper/70 rounded-2xl px-3 py-3">
                      <div className="text-ink text-lg font-semibold">{item.value}</div>
                      <div className="text-muted mt-0.5 text-xs">{item.label}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <aside className="border-line flex flex-col justify-center gap-3 border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <Link to={`/register?teacherId=${teacher.id}`} className="pwbtn pwbtn-primary w-full">
              预约试听
            </Link>
            {teacher.wechatQrUrl ? (
              <a
                href={teacher.wechatQrUrl}
                target="_blank"
                rel="noreferrer"
                className="pwbtn pwbtn-outline w-full"
              >
                <MessageCircle className="h-4 w-4" />
                微信联系
              </a>
            ) : null}
          </aside>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-6">
          {hasIntro ? (
            <section className="pwcard p-5 sm:p-6">
              <SectionHead title="老师简介" />
              <p className="text-ink-soft mt-4 max-w-3xl text-base leading-8 whitespace-pre-line">
                {teacher.bio || teacher.tagline}
              </p>
            </section>
          ) : null}

          {teacher.teachingPhilosophy ? (
            <section className="pwcard p-5 sm:p-6">
              <SectionHead title="教学方法" />
              <p className="text-ink-soft mt-4 max-w-3xl text-base leading-8 whitespace-pre-line">
                {teacher.teachingPhilosophy}
              </p>
            </section>
          ) : null}

          {profileSections.length > 0 ? (
            <section className="pwcard p-5 sm:p-6">
              <SectionHead title="教学经历与资质" />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {profileSections.map((section) => (
                  <ProfileSection key={section.key} section={section} />
                ))}
              </div>
            </section>
          ) : null}

          {classPhotos.length > 0 ? <GallerySection title="课堂实拍" urls={classPhotos} /> : null}

          {studentWorks.length > 0 || testimonials.length > 0 ? (
            <ResultsSection works={studentWorks} testimonials={testimonials} />
          ) : null}
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-24">
          {detail.courses.length > 0 ? <CoursesSection courses={detail.courses} /> : null}

          {teacher.specialties.length > 0 ? (
            <section className="pwcard p-5">
              <SectionHead title="擅长方向" />
              <div className="mt-4 flex flex-wrap gap-2">
                {teacher.specialties.map((item) => (
                  <span key={item} className="chip">
                    {item}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function TeacherAvatar({ teacher }: { teacher: PublicTeacherDetail['teacher'] }) {
  if (teacher.avatarUrl) {
    return (
      <img
        src={teacher.avatarUrl}
        alt={teacher.name}
        className="border-line h-44 w-full rounded-2xl border object-cover shadow-sm sm:h-48"
      />
    );
  }

  return (
    <div className="border-line text-brand bg-brand-soft flex h-44 w-full items-center justify-center rounded-2xl border sm:h-48">
      <GraduationCap className="h-10 w-10" />
    </div>
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
        <div className="bg-ink flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-ink text-base font-semibold">{section.label}</h3>
      </div>

      {section.tone === 'list' && lines.length > 1 ? (
        <ul className="text-ink-soft mt-4 space-y-2 text-sm leading-7">
          {lines.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="bg-brand mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className={[
            'mt-4 text-sm leading-7 whitespace-pre-line',
            section.tone === 'quote' ? 'text-ink border-brand border-l-2 pl-4' : 'text-ink-soft',
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
    <section className="pwcard p-5">
      <SectionHead title="主讲课程" />
      <div className="mt-4 grid gap-3">
        {courses.map((course) => (
          <div key={course.id} className="border-line rounded-2xl border p-4">
            <div className="text-ink text-base font-semibold">{course.name}</div>
            <div className="text-muted mt-1 text-xs">
              {course.category} · {course.ageRange} · {course.durationMinutes} 分钟
            </div>
            {course.summary ? (
              <p className="text-ink-soft mt-3 line-clamp-2 text-sm leading-6">{course.summary}</p>
            ) : null}
            <div className="text-ink mt-3 text-sm font-semibold">{coursePriceLabel(course)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GallerySection({ title, urls }: { title: string; urls: string[] }) {
  return (
    <section className="pwcard p-5 sm:p-6">
      <SectionHead title={title} />
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

function ResultsSection({ works, testimonials }: { works: string[]; testimonials: string[] }) {
  const showWorks = works.length > 0;
  const showTestimonials = testimonials.length > 0;

  return (
    <section className="pwcard p-5 sm:p-6">
      <SectionHead title="学员作品与家长反馈" />
      <div
        className={[
          'mt-4 grid gap-4',
          showWorks && showTestimonials ? 'lg:grid-cols-[minmax(0,1fr)_18rem]' : '',
        ].join(' ')}
      >
        {showWorks ? (
          <div className="grid grid-cols-2 gap-3">
            {works.slice(0, 6).map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt=""
                className="border-line aspect-[4/3] w-full rounded-2xl border bg-white object-cover"
              />
            ))}
          </div>
        ) : null}

        {showTestimonials ? (
          <div className="grid gap-3">
            {testimonials.slice(0, 4).map((item, index) => (
              <blockquote key={`${item}-${index}`} className="bg-paper/60 rounded-2xl p-4">
                <p className="text-ink-soft text-sm leading-7">“{item}”</p>
              </blockquote>
            ))}
          </div>
        ) : null}
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
      className={`bg-surface/70 text-ink inline-flex h-10 max-w-full items-center rounded-full px-3 text-sm font-medium ${className}`}
    >
      <span className="truncate">{institution.name}</span>
    </span>
  );
}

function SectionHead({ title }: { title: string }) {
  return <h2 className="text-ink text-lg font-semibold">{title}</h2>;
}
