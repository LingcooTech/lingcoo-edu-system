import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CalendarDays } from 'lucide-react';

import { fetchTrialSessions, type TrialSession } from '@/api/client';
import { Layout } from '@/components/Layout';
import { formatDateTime, money } from '@/lib/utils';

export function TrialListPage() {
  const [sessions, setSessions] = useState<TrialSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrialSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">试听预约</div>
        <h1 className="section-title mt-2">公开课 / 试听课</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">
          选择一节公开课，扫码或填表即可预约名额，老师会在课前与你确认。
        </p>

        {loading ? (
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <TrialCardSkeleton key={index} />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => (
              <TrialCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}

function TrialCard({ session }: { session: TrialSession }) {
  const remaining = Math.max(0, session.capacity - session.bookedCount);
  const full = remaining === 0;
  const pct =
    session.capacity > 0
      ? Math.min(100, Math.round((session.bookedCount / session.capacity) * 100))
      : 0;
  const almostFull = !full && remaining <= 3;

  const inner = (
    <>
      {session.coverImageUrl ? (
        <div className="bg-brand-soft aspect-[16/9] overflow-hidden">
          <img
            src={session.coverImageUrl}
            alt={session.title}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-5">
        <div className="text-ink-soft inline-flex items-center gap-1.5 text-sm">
          <CalendarDays className="text-brand h-4 w-4 shrink-0" />
          {formatDateTime(session.startsAt)}
        </div>
        <h2 className="text-ink mt-2 text-base font-semibold">{session.title}</h2>
        {session.reservationFeeAmount > 0 && (
          <span className="mt-3 inline-flex w-fit items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            {money(session.reservationFeeAmount)} 席位保留费
          </span>
        )}

        <div className="mt-auto pt-5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">
              已报名 {session.bookedCount}/{session.capacity}
            </span>
            <span
              className={
                full
                  ? 'text-muted'
                  : almostFull
                    ? 'font-medium text-amber-700'
                    : 'text-brand font-medium'
              }
            >
              {full ? '名额已满' : `剩 ${remaining} 席`}
            </span>
          </div>
          <div className="bg-line mt-2 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={full ? 'bg-muted h-full rounded-full' : 'bg-brand h-full rounded-full'}
              style={{ width: `${full ? 100 : Math.max(pct, 4)}%` }}
            />
          </div>
          {full ? (
            <div className="text-muted mt-4 text-sm font-medium">名额已满</div>
          ) : (
            <div className="text-ink mt-4 inline-flex items-center gap-1 text-sm font-medium">
              预约这节试听课
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (full) {
    return <div className="pwcard flex flex-col overflow-hidden opacity-70">{inner}</div>;
  }
  return (
    <Link
      to={`/trials/${session.id}`}
      className="pwcard pwcard-hover group flex flex-col overflow-hidden no-underline"
    >
      {inner}
    </Link>
  );
}

function TrialCardSkeleton() {
  return (
    <div className="pwcard flex flex-col overflow-hidden">
      <div className="skeleton aspect-[16/9]" />
      <div className="p-5">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton mt-3 h-5 w-2/3" />
        <div className="mt-8 pt-5">
          <div className="flex items-center justify-between">
            <div className="skeleton h-3.5 w-20" />
            <div className="skeleton h-3.5 w-12" />
          </div>
          <div className="skeleton mt-2 h-1.5 w-full" />
          <div className="skeleton mt-4 h-4 w-28" />
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
