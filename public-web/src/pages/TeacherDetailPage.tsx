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

import { fetchPublicTeacher, type PublicTeacherDetail } from '@/api/client';
import { Layout } from '@/components/Layout';

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

  return (
    <>
      <header className="relative mt-6 overflow-hidden rounded-[1.75rem] border border-[#d8c39a]/70 bg-[#fbf7ec] p-5 shadow-sm sm:p-7">
        <div className="grid gap-5 lg:grid-cols-[auto_1fr_180px] lg:items-center">
          {teacher.avatarUrl ? (
            <img
              src={teacher.avatarUrl}
              alt={teacher.name}
              className="h-32 w-32 rounded-2xl border border-[#d8c39a]/70 object-cover shadow-sm sm:h-40 sm:w-40"
            />
          ) : (
            <div className="bg-brand-soft text-brand flex h-32 w-32 items-center justify-center rounded-2xl border border-[#d8c39a]/70 sm:h-40 sm:w-40">
              <GraduationCap className="h-10 w-10" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            {institution ? <InstitutionMark institution={institution} className="mb-3" /> : null}
            <h1 className="text-ink text-3xl font-semibold tracking-tight">{teacher.name}</h1>
            {teacher.title ? <div className="text-muted mt-2 text-sm">{teacher.title}</div> : null}
            {teacher.tagline ? (
              <p className="text-ink mt-4 max-w-2xl text-base leading-7">{teacher.tagline}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {teacher.specialties.map((item) => (
                <span key={item} className="chip">
                  {item}
                </span>
              ))}
            </div>
          </div>

          {teacher.wechatQrUrl ? (
            <div className="rounded-2xl bg-white/70 p-3 lg:justify-self-end">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#17324d]">
                <MessageCircle className="h-4 w-4" />
                加老师微信
              </div>
              <img
                src={teacher.wechatQrUrl}
                alt={`${teacher.name}的微信二维码`}
                className="aspect-square w-36 rounded-xl bg-white object-contain p-2 lg:w-full"
              />
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="pwcard p-5 sm:p-6">
          <SectionHead eyebrow="Profile" title="老师介绍" />
          {profileSections.length > 0 ? (
            <div className="mt-5 grid gap-4">
              {profileSections.map((section) => (
                <ProfileSection key={section.key} section={section} />
              ))}
            </div>
          ) : (
            <p className="text-muted mt-5 text-sm">老师介绍待补充。</p>
          )}
        </section>

        <aside className="space-y-5">
          <section className="pwcard p-5">
            <SectionHead eyebrow="Focus" title="擅长方向" />
            <div className="mt-4 flex flex-wrap gap-2">
              {teacher.specialties.length ? (
                teacher.specialties.map((item) => (
                  <span key={item} className="chip">
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-muted text-sm">待补充</span>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
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
