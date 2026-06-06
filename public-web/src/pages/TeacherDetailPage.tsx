import { useEffect, useMemo, useState } from 'react';
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
import { BlockRenderer } from '@/components/blocks/BlockRenderer';
import { parseBlocks, type Block } from '@/components/blocks/blocks';
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

  const bioBlocks = useMemo(() => parseBlocks(detail?.teacher.bio), [detail]);

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
          <TeacherDetailBody detail={detail} bioBlocks={bioBlocks} />
        )}
      </section>
    </Layout>
  );
}

function TeacherDetailBody({
  detail,
  bioBlocks,
}: {
  detail: PublicTeacherDetail;
  bioBlocks: ReturnType<typeof parseBlocks>;
}) {
  const { teacher, institution } = detail;
  const resumeHighlights = extractResumeHighlights(bioBlocks);

  return (
    <>
      <header className="relative mt-6 overflow-hidden rounded-[1.75rem] border border-[#d8c39a]/70 bg-[#fbf7ec] p-5 shadow-sm sm:p-7">
        <div className="pointer-events-none absolute inset-x-8 top-4 h-px bg-[#d8c39a]/70" />
        <div className="pointer-events-none absolute right-6 bottom-6 hidden h-24 w-24 rounded-full border border-[#b4553e]/30 text-[#b4553e]/70 sm:block" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {teacher.avatarUrl ? (
            <img
              src={teacher.avatarUrl}
              alt={teacher.name}
              className="h-32 w-28 rounded-2xl border border-[#d8c39a]/70 object-cover shadow-sm sm:h-40 sm:w-32"
            />
          ) : (
            <div className="bg-brand-soft text-brand flex h-32 w-28 items-center justify-center rounded-2xl border border-[#d8c39a]/70 sm:h-40 sm:w-32">
              <GraduationCap className="h-10 w-10" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            {institution ? (
              <InstitutionMark
                institution={institution}
                className="mb-3 border-[#d8c39a] bg-white/70 text-[#17324d]"
              />
            ) : null}
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
        </div>
      </header>

      {resumeHighlights.length > 0 ? <ResumeHighlights items={resumeHighlights} /> : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        {bioBlocks.length > 0 ? (
          <section className="pwcard p-5 sm:p-6">
            <SectionHead eyebrow="Resume" title="教师简历" />
            <div className="mt-5">
              <BlockRenderer blocks={bioBlocks} />
            </div>
          </section>
        ) : (
          <section className="pwcard p-5 sm:p-6">
            <SectionHead eyebrow="Resume" title="教师简历" />
            <p className="text-muted mt-5 text-sm">简历内容待补充。</p>
          </section>
        )}

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

          {teacher.wechatQrUrl ? (
            <section className="pwcard p-5">
              <div className="flex items-center gap-2">
                <MessageCircle className="text-brand h-4 w-4" />
                <h2 className="text-ink text-sm font-semibold">加老师微信</h2>
              </div>
              <p className="text-muted mt-2 text-xs">微信扫一扫，添加老师了解更多课程信息。</p>
              <img
                src={teacher.wechatQrUrl}
                alt={`${teacher.name}的微信二维码`}
                className="border-line mt-4 aspect-square w-full rounded-2xl border bg-white object-contain p-3"
              />
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}

type HighlightIcon = 'school' | 'book' | 'sparkles' | 'award';

interface ResumeHighlight {
  label: string;
  text: string;
  icon: HighlightIcon;
}

const RESUME_RULES: Array<{ label: string; icon: HighlightIcon; keywords: string[] }> = [
  {
    label: '毕业院校',
    icon: 'school',
    keywords: ['毕业', '大学', '学院', '院校', '本科', '硕士', '博士', '专业'],
  },
  {
    label: '专业方向',
    icon: 'book',
    keywords: ['擅长', '专注', '书法', '美术', '国画', '硬笔', '软笔', '创作'],
  },
  {
    label: '教学经验',
    icon: 'sparkles',
    keywords: ['教学经验', '培训经验', '授课', '任教', '教学', '年从事', '年少儿'],
  },
  {
    label: '荣誉奖项',
    icon: 'award',
    keywords: ['获奖', '奖', '优秀', '荣誉', '大赛', '展览', '收藏'],
  },
];

function extractResumeHighlights(blocks: Block[]): ResumeHighlight[] {
  const lines = extractResumeLines(blocks);
  const used = new Set<string>();

  return RESUME_RULES.flatMap((rule) => {
    const line = lines.find(
      (item) => !used.has(item) && rule.keywords.some((keyword) => item.includes(keyword)),
    );
    if (!line) return [];
    used.add(line);
    return [{ label: rule.label, text: line, icon: rule.icon }];
  });
}

function extractResumeLines(blocks: Block[]): string[] {
  const lines: string[] = [];

  function pushText(value: string | undefined) {
    if (!value) return;
    value
      .replace(/[。；]/g, (match) => `${match}\n`)
      .split(/\n+/)
      .map((line) => line.replace(/^[\s•\-*、\d.]+/, '').trim())
      .filter(Boolean)
      .forEach((line) => lines.push(line));
  }

  blocks.forEach((block) => {
    switch (block.type) {
      case 'paragraph':
        pushText(block.text);
        break;
      case 'list':
      case 'stats':
      case 'testimonials':
        block.items.forEach(pushText);
        break;
      case 'imageText':
        pushText(block.title);
        pushText(block.text);
        break;
      case 'faq':
        block.items.forEach((item) => {
          pushText(item.q);
          pushText(item.a);
        });
        break;
      case 'heading':
      case 'image':
      case 'cta':
      case 'gallery':
      case 'divider':
        break;
    }
  });

  return Array.from(new Set(lines)).slice(0, 40);
}

function ResumeHighlights({ items }: { items: ResumeHighlight[] }) {
  return (
    <section className="mt-8">
      <SectionHead eyebrow="Profile" title="履历重点" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const Icon = highlightIcon(item.icon);
          return (
            <div key={item.label} className="pwcard flex gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#17324d] text-white">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-brand text-xs font-semibold">{item.label}</div>
                <p className="text-ink mt-1 text-sm leading-6">{item.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function highlightIcon(icon: HighlightIcon) {
  switch (icon) {
    case 'school':
      return School;
    case 'book':
      return BookOpen;
    case 'sparkles':
      return Sparkles;
    case 'award':
      return Award;
  }
}

function InstitutionMark({
  institution,
  className = '',
}: {
  institution: NonNullable<PublicTeacherDetail['institution']>;
  className?: string;
}) {
  const baseClass =
    'inline-flex h-10 max-w-full items-center rounded-full border px-3 text-sm font-medium';

  if (institution.logoUrl) {
    return (
      <span className={`${baseClass} ${className}`} title={institution.name}>
        <img
          src={institution.logoUrl}
          alt={institution.name}
          className="max-h-7 max-w-32 object-contain"
        />
        <span className="sr-only">{institution.name}</span>
      </span>
    );
  }

  return (
    <span className={`${baseClass} ${className}`}>
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
