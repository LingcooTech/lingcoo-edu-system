import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Award,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  School,
  Sparkles,
  X,
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
        <Link to="/teachers" className="text-muted hover:text-ink inline-flex items-center text-sm">
          <ChevronLeft className="h-4 w-4" />
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
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="skeleton h-28 w-28 shrink-0 sm:h-36 sm:w-36" />
          <div className="flex-1">
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
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <div className="skeleton h-40 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
        <div className="skeleton h-64 w-full" />
      </div>
    </div>
  );
}

function TeacherDetailBody({ detail }: { detail: PublicTeacherDetail }) {
  const { teacher, institution } = detail;
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);
  const profileSections = teacherProfileSections(teacher);
  const stats = teacherStats(teacher);
  const classPhotos = teacher.classPhotoUrls ?? [];
  const studentWorks = teacher.studentWorkUrls ?? [];
  const testimonials = teacher.parentTestimonials ?? [];
  const hasIntro = Boolean(teacher.bio?.trim() || teacher.tagline?.trim());
  const closeViewer = () => setViewer(null);
  const showPrev = () => {
    setViewer((current) =>
      current
        ? {
            ...current,
            index: (current.index - 1 + current.urls.length) % current.urls.length,
          }
        : current,
    );
  };
  const showNext = () => {
    setViewer((current) =>
      current
        ? {
            ...current,
            index: (current.index + 1) % current.urls.length,
          }
        : current,
    );
  };

  return (
    <>
      <header className="pwcard mt-6 p-5 shadow-sm sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-stretch">
          <div className="grid gap-6 sm:grid-cols-[188px_minmax(0,1fr)] sm:items-stretch">
            <TeacherAvatar teacher={teacher} />

            <div className="flex min-w-0 flex-col">
              {institution ? <InstitutionMark institution={institution} className="mb-3" /> : null}
              <h1 className="text-ink text-3xl font-semibold tracking-tight sm:text-4xl">
                {teacher.name}
              </h1>
              {teacher.title ? (
                <div className="text-ink-soft mt-2 text-base font-medium">{teacher.title}</div>
              ) : null}

              {teacher.tagline ? (
                <p className="text-ink border-brand mt-4 max-w-md border-l-2 pl-4 text-base leading-8 sm:text-lg">
                  {teacher.tagline}
                </p>
              ) : null}

              {stats.length > 0 ? (
                <div className="border-line divide-line bg-paper/60 mt-5 grid max-w-md grid-cols-3 divide-x overflow-hidden rounded-2xl border">
                  {stats.map((item) => (
                    <div key={item.label} className="px-2 py-3 text-center">
                      <div className="text-ink text-xl font-semibold">{item.value}</div>
                      <div className="text-muted mt-0.5 text-xs">{item.label}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <aside className="border-line flex flex-col justify-center gap-4 border-t pt-5 text-center lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <Link to={`/register?teacherId=${teacher.id}`} className="pwbtn pwbtn-primary w-full">
              预约试听
            </Link>
            {teacher.wechatQrUrl ? (
              <div className="flex flex-col items-center gap-2">
                <img
                  src={teacher.wechatQrUrl}
                  alt={`${teacher.name}老师微信二维码`}
                  className="border-line h-28 w-28 rounded-2xl border bg-white object-contain"
                />
                <span className="text-muted text-xs">扫码加老师微信</span>
              </div>
            ) : null}
          </aside>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-6">
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
              <SectionHead title="教学理念" />
              <p className="text-ink border-brand mt-4 max-w-3xl border-l-2 pl-4 text-base leading-8 whitespace-pre-line">
                {teacher.teachingPhilosophy}
              </p>
            </section>
          ) : null}

          {profileSections.length > 0 ? (
            <section className="pwcard p-5 sm:p-6">
              <SectionHead title="教学经历与资质" />
              <div className="divide-line mt-4 divide-y">
                {profileSections.map((section) => (
                  <ProfileSection key={section.key} section={section} />
                ))}
              </div>
            </section>
          ) : null}

          {classPhotos.length > 0 ? (
            <GallerySection
              id="class-photos"
              title="课堂实拍"
              urls={classPhotos}
              onOpen={(index) => setViewer({ urls: classPhotos, index })}
            />
          ) : null}

          {studentWorks.length > 0 || testimonials.length > 0 ? (
            <ResultsSection
              id="student-results"
              works={studentWorks}
              testimonials={testimonials}
              onOpenWork={(index) => setViewer({ urls: studentWorks, index })}
            />
          ) : null}
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-24">
          {teacher.specialties.length > 0 ? (
            <section className="pwcard p-5 sm:p-6">
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

          {detail.courses.length > 0 ? (
            <CoursesSection id="teacher-courses" courses={detail.courses} />
          ) : null}
        </aside>
      </div>

      {viewer ? (
        <Lightbox
          urls={viewer.urls}
          index={viewer.index}
          onClose={closeViewer}
          onPrev={showPrev}
          onNext={showNext}
        />
      ) : null}
    </>
  );
}

function TeacherAvatar({ teacher }: { teacher: PublicTeacherDetail['teacher'] }) {
  // Stretches to the column height on sm+ so the photo's bottom edge lines up
  // with the bottom of the stat bar in the info column.
  const base =
    'border-line h-56 w-full rounded-2xl border object-cover shadow-sm sm:h-full sm:min-h-[248px] sm:w-[188px]';
  if (teacher.avatarUrl) {
    return <img src={teacher.avatarUrl} alt={teacher.name} className={base} />;
  }
  return (
    <div className={`${base} bg-brand-soft text-brand flex items-center justify-center`}>
      <GraduationCap className="h-12 w-12" />
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
    <article className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-4 py-5 first:pt-0 last:pb-0">
      <div className="bg-brand-soft text-brand grid h-11 w-11 place-items-center rounded-xl">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h3 className="text-ink text-base font-semibold">{section.label}</h3>

        {section.tone === 'list' && lines.length > 1 ? (
          <ul className="text-ink-soft mt-2.5 space-y-2 text-sm leading-7">
            {lines.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="bg-brand mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-soft mt-2 text-sm leading-7 whitespace-pre-line">{section.text}</p>
        )}
      </div>
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

function CoursesSection({ id, courses }: { id: string; courses: Course[] }) {
  return (
    <section id={id} className="pwcard scroll-mt-32 p-5 sm:p-6">
      <SectionHead title="主讲课程" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {courses.map((course) => (
          <Link
            key={course.id}
            to={`/courses/${course.slug}`}
            className="border-line pwcard-hover block rounded-2xl border p-4 no-underline"
          >
            <div className="text-ink text-base font-semibold">{course.name}</div>
            <div className="text-muted mt-1 text-xs">
              {course.category} · {course.ageRange} · {course.durationMinutes} 分钟
            </div>
            {course.summary ? (
              <p className="text-ink-soft mt-3 line-clamp-2 text-sm leading-6">{course.summary}</p>
            ) : null}
            <div className="text-ink mt-3 text-sm font-semibold">{coursePriceLabel(course)}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function GallerySection({
  id,
  title,
  urls,
  onOpen,
}: {
  id: string;
  title: string;
  urls: string[];
  onOpen: (index: number) => void;
}) {
  return (
    <section id={id} className="pwcard scroll-mt-32 p-5 sm:p-6">
      <SectionHead title={title} />
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {urls.slice(0, 8).map((url, index) => (
          <button
            key={`${url}-${index}`}
            type="button"
            onClick={() => onOpen(index)}
            className="group border-line focus-visible:ring-brand/40 block overflow-hidden rounded-2xl border outline-none focus-visible:ring-2"
            aria-label={`查看${title}第 ${index + 1} 张`}
          >
            <img
              src={url}
              alt={`${title} ${index + 1}`}
              className="aspect-[4/3] w-full bg-white object-cover transition duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function ResultsSection({
  id,
  works,
  testimonials,
  onOpenWork,
}: {
  id: string;
  works: string[];
  testimonials: string[];
  onOpenWork: (index: number) => void;
}) {
  const showWorks = works.length > 0;
  const showTestimonials = testimonials.length > 0;

  return (
    <section id={id} className="pwcard scroll-mt-32 p-5 sm:p-6">
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
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => onOpenWork(index)}
                className="group border-line focus-visible:ring-brand/40 block overflow-hidden rounded-2xl border outline-none focus-visible:ring-2"
                aria-label={`查看学员作品第 ${index + 1} 张`}
              >
                <img
                  src={url}
                  alt={`学员作品 ${index + 1}`}
                  className="aspect-[4/3] w-full bg-white object-cover transition duration-300 group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        ) : null}

        {showTestimonials ? (
          <div className="grid content-start gap-3">
            {testimonials.slice(0, 4).map((item, index) => (
              <blockquote
                key={`${item}-${index}`}
                className="bg-paper/60 border-line relative rounded-2xl border p-4 pt-7"
              >
                <span
                  aria-hidden
                  className="text-brand/30 absolute top-1 left-3 text-4xl leading-none font-serif"
                >
                  &ldquo;
                </span>
                <p className="text-ink-soft text-sm leading-7">{item}</p>
              </blockquote>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Lightbox({
  urls,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  urls: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const multiple = urls.length > 1;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onClick={onClose}
      className="bg-ink/90 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭预览"
        className="absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {multiple ? (
        <>
          <button
            type="button"
            aria-label="上一张"
            onClick={(event) => {
              event.stopPropagation();
              onPrev();
            }}
            className="absolute left-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-6"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={(event) => {
              event.stopPropagation();
              onNext();
            }}
            className="absolute right-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-6"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}

      <img
        src={urls[index]}
        alt={`预览图 ${index + 1}`}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
      />

      {multiple ? (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
          {index + 1} / {urls.length}
        </div>
      ) : null}
    </div>
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
