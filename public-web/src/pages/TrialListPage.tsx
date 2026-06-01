import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchTrialSessions, type TrialSession } from '@/api/client';
import { Layout } from '@/components/Layout';
import { formatDateTime } from '@/lib/utils';

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
      <section className="container-narrow py-8">
        <div className="eyebrow">Trial</div>
        <h1 className="text-ink mt-1 text-2xl font-bold">公开课 / 试听课</h1>
        <p className="text-ink-soft mt-2 text-sm leading-6">选择一节公开课,扫码或填表即可预约名额。</p>

        <div className="mt-5 grid gap-3">
          {loading ? (
            <p className="text-muted text-sm">加载中…</p>
          ) : sessions.length === 0 ? (
            <p className="text-muted text-sm">近期暂无公开课,可先预约心仪课程的试听。</p>
          ) : (
            sessions.map((session) => {
              const full = session.bookedCount >= session.capacity;
              return (
                <div key={session.id} className="pwcard p-4">
                  <div className="text-ink text-sm font-semibold">{session.title}</div>
                  <div className="text-ink-soft mt-2 text-sm">{formatDateTime(session.startsAt)}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-muted text-xs">
                      已报名 {session.bookedCount}/{session.capacity}
                    </span>
                    {full ? (
                      <span className="text-muted text-xs">名额已满</span>
                    ) : (
                      <Link
                        to={`/trials/${session.id}`}
                        className="pwbtn pwbtn-primary px-4 py-2"
                      >
                        预约
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </Layout>
  );
}
