import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CalendarDays, MapPin } from 'lucide-react';

import {
  fetchTrialSessions,
  loadHome,
  type Course,
  type HomePayload,
  type TrialSession,
} from '@/api/client';
import { Layout } from '@/components/Layout';
import { getPageCopy } from '@/lib/page-copy';
import { useSeo } from '@/lib/seo';
import { formatDateTime, money } from '@/lib/utils';

type TimeFilter = 'this_week' | 'next_week' | 'next_14' | 'all';

const TIME_FILTERS: Array<{ value: TimeFilter; label: string }> = [
  { value: 'next_14', label: '近14天' },
  { value: 'this_week', label: '本周' },
  { value: 'next_week', label: '下周' },
  { value: 'all', label: '全部可约' },
];

interface TrialGroup {
  key: string;
  title: string;
  coverImageUrl?: string | null;
  course?: Course;
  campus?: { id: string; name: string; address: string | null };
  reservationFeeAmount: number;
  sessions: TrialSession[];
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  return next;
}

function endOfWeek(date: Date) {
  return endOfDay(addDays(startOfWeek(date), 6));
}

function timeRangeForFilter(filter: TimeFilter, now = new Date()) {
  if (filter === 'this_week') {
    return { from: now, to: endOfWeek(now) };
  }
  if (filter === 'next_week') {
    const from = addDays(startOfWeek(now), 7);
    return { from, to: endOfWeek(from) };
  }
  if (filter === 'next_14') {
    return { from: now, to: endOfDay(addDays(now, 13)) };
  }
  return { from: now, to: null };
}

function formatSessionChip(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function TrialListPage() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [sessions, setSessions] = useState<TrialSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('next_14');
  const [courseId, setCourseId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    Promise.all([fetchTrialSessions(), loadHome().catch(() => null)])
      .then(([sessionList, homePayload]) => {
        setSessions(sessionList);
        setHome(homePayload);
      })
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const pageCopy = getPageCopy(home, 'trials');

  useSeo({
    title: pageCopy.seoTitle || pageCopy.title,
    description: pageCopy.subtitle,
    brandName: home?.organization.brandName,
  });

  const courses = home?.featuredCourses ?? [];
  const campuses = home?.campuses ?? [];
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );
  const campusById = useMemo(
    () => new Map(campuses.map((campus) => [campus.id, campus])),
    [campuses],
  );
  const filteredSessions = useMemo(() => {
    const now = new Date();
    const range = timeRangeForFilter(timeFilter, now);
    return sessions
      .filter((session) => {
        const startsAt = new Date(session.startsAt);
        if (startsAt < range.from) return false;
        if (range.to && startsAt > range.to) return false;
        if (courseId && session.courseId !== courseId) return false;
        if (campusId && session.campusId !== campusId) return false;
        if (!showFull && session.bookedCount >= session.capacity) return false;
        return true;
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [campusId, courseId, sessions, showFull, timeFilter]);

  const trialGroups = useMemo(() => {
    const groups = new Map<string, TrialGroup>();
    for (const session of filteredSessions) {
      const key = [
        session.courseId,
        session.campusId,
        session.title,
        session.coverImageUrl ?? '',
        session.reservationFeeAmount,
      ].join('|');
      const existing = groups.get(key);
      if (existing) {
        existing.sessions.push(session);
        continue;
      }
      groups.set(key, {
        key,
        title: session.title,
        coverImageUrl: session.coverImageUrl,
        course: courseById.get(session.courseId),
        campus: campusById.get(session.campusId),
        reservationFeeAmount: session.reservationFeeAmount,
        sessions: [session],
      });
    }
    return Array.from(groups.values()).sort(
      (a, b) =>
        new Date(a.sessions[0]?.startsAt ?? 0).getTime() -
        new Date(b.sessions[0]?.startsAt ?? 0).getTime(),
    );
  }, [campusById, courseById, filteredSessions]);

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="mobile-page-head">
          <h1 className="section-title">{pageCopy.title}</h1>
          {pageCopy.subtitle ? (
            <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">{pageCopy.subtitle}</p>
          ) : null}
        </div>

        <div className="bg-surface/70 mt-6 grid gap-3 rounded-2xl p-3 shadow-sm md:grid-cols-[1.4fr_1fr_1fr_auto]">
          <div className="bg-paper/70 flex rounded-full p-1">
            {TIME_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`flex min-h-10 flex-1 items-center justify-center rounded-full px-3 py-2 text-sm font-semibold transition ${
                  timeFilter === item.value
                    ? 'bg-brand-soft text-brand'
                    : 'text-ink-soft hover:bg-surface'
                }`}
                onClick={() => setTimeFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <select
            className="pwinput"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          >
            <option value="">全部课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
          <select
            className="pwinput"
            value={campusId}
            onChange={(event) => setCampusId(event.target.value)}
          >
            <option value="">全部校区</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
          <label className="text-ink-soft flex items-center gap-2 px-1 text-sm">
            <input
              type="checkbox"
              checked={showFull}
              onChange={(event) => setShowFull(event.target.checked)}
            />
            显示已满
          </label>
        </div>

        {loading ? (
          <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <TrialCardSkeleton key={index} />
            ))}
          </div>
        ) : trialGroups.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {trialGroups.map((group) => (
              <TrialGroupCard key={group.key} group={group} />
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}

function TrialGroupCard({ group }: { group: TrialGroup }) {
  const firstSession = group.sessions[0];
  const nextRemaining = firstSession
    ? Math.max(0, firstSession.capacity - firstSession.bookedCount)
    : 0;
  const primaryHref = firstSession ? `/trials/${firstSession.id}` : '';
  const alternateSessions = group.sessions.slice(1);
  const visibleAlternateSessions = alternateSessions.slice(0, 5);
  const additionalAlternateCount = alternateSessions.length - visibleAlternateSessions.length;

  return (
    <article className="pwcard overflow-hidden">
      {group.coverImageUrl ? (
        primaryHref ? (
          <Link
            to={primaryHref}
            className="bg-brand-soft block aspect-[16/9] overflow-hidden"
            aria-label={`查看${group.title}最近场次`}
          >
            <img
              src={group.coverImageUrl}
              alt={group.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-200 hover:scale-[1.02]"
            />
          </Link>
        ) : (
          <div className="bg-brand-soft aspect-[16/9] overflow-hidden">
            <img
              src={group.coverImageUrl}
              alt={group.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        )
      ) : null}
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-ink line-clamp-2 text-base leading-snug font-semibold">
              {primaryHref ? (
                <Link to={primaryHref} className="hover:text-brand transition-colors">
                  {group.title}
                </Link>
              ) : (
                group.title
              )}
            </h2>
            <div className="text-muted mt-1 text-xs">
              {group.course?.name ?? '试听课程'}
              {group.course?.ageRange ? ` · ${group.course.ageRange}` : ''}
            </div>
          </div>
          <span className="text-brand shrink-0 text-sm font-semibold">
            {group.sessions.length} 场
          </span>
        </div>

        <div className="text-ink-soft mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
          {firstSession ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="text-brand h-4 w-4 shrink-0" />
              最近 {formatDateTime(firstSession.startsAt)}
            </span>
          ) : null}
          {group.campus ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="text-brand h-4 w-4 shrink-0" />
              {group.campus.name}
            </span>
          ) : null}
        </div>

        {group.reservationFeeAmount > 0 && (
          <span className="mt-2.5 inline-flex w-fit items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            {money(group.reservationFeeAmount)} 席位保留费
          </span>
        )}

        {alternateSessions.length > 0 ? (
          <div className="mt-3">
            <div className="text-muted mb-1.5 text-xs font-medium">其他时间</div>
            <div className="flex flex-wrap gap-1.5">
              {visibleAlternateSessions.map((session) => {
                const remaining = Math.max(0, session.capacity - session.bookedCount);
                const full = remaining === 0;
                return full ? (
                  <span
                    key={session.id}
                    className="border-line bg-paper text-muted rounded-full border px-2.5 py-1.5 text-xs"
                  >
                    {formatSessionChip(session.startsAt)} · 已满
                  </span>
                ) : (
                  <Link
                    key={session.id}
                    to={`/trials/${session.id}`}
                    className="border-brand/25 bg-brand-soft text-brand hover:border-brand/50 hover:bg-surface rounded-full border px-2.5 py-1.5 text-xs font-medium transition"
                  >
                    {formatSessionChip(session.startsAt)} · 剩 {remaining}
                  </Link>
                );
              })}
              {additionalAlternateCount > 0 ? (
                <span className="text-muted inline-flex items-center px-1.5 text-xs">
                  还有 {additionalAlternateCount} 场
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {firstSession && (
          <Link
            to={`/trials/${firstSession.id}`}
            className="text-ink mt-3 inline-flex items-center gap-1 text-sm font-medium hover:text-brand"
          >
            查看最近场次
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {firstSession ? (
          <div className="text-muted mt-1.5 text-xs">
            {nextRemaining === 0 ? '最近场次已满' : `最近场次剩余 ${nextRemaining} 席`}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function TrialCardSkeleton() {
  return (
    <div className="pwcard overflow-hidden">
      <div className="skeleton aspect-[16/9] rounded-none" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="skeleton h-5 w-2/3" />
            <div className="skeleton mt-2 h-3.5 w-32" />
          </div>
          <div className="skeleton h-4 w-10" />
        </div>
        <div className="mt-4 flex gap-3">
          <div className="skeleton h-4 w-36" />
          <div className="skeleton h-4 w-24" />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="skeleton h-7 w-28 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="pwcard mt-7 flex flex-col items-center px-6 py-14 text-center">
      <div className="bg-brand-soft text-brand flex h-12 w-12 items-center justify-center rounded-2xl">
        <CalendarClock className="h-6 w-6" />
      </div>
      <p className="text-ink mt-4 text-sm font-medium">近期暂无公开课</p>
      <p className="text-muted mt-1 text-sm">可以先预约心仪课程的试听，老师会安排合适的时间。</p>
      <Link to="/courses" className="pwbtn pwbtn-primary mt-5">
        浏览课程
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
