import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, GraduationCap } from 'lucide-react';

import { fetchPublicTeacher, type PublicTeacherDetail } from '@/api/client';
import { BlockRenderer } from '@/components/blocks/BlockRenderer';
import { parseBlocks } from '@/components/blocks/blocks';
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
        <Link to="/teachers" className="text-ink-soft hover:text-ink inline-flex items-center gap-1 text-sm no-underline">
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

  return (
    <>
      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        {teacher.avatarUrl ? (
          <img
            src={teacher.avatarUrl}
            alt={teacher.name}
            className="border-line h-20 w-20 rounded-3xl border object-cover"
          />
        ) : (
          <div className="bg-brand-soft text-brand flex h-20 w-20 items-center justify-center rounded-3xl">
            <GraduationCap className="h-8 w-8" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-ink text-2xl font-semibold">{teacher.name}</h1>
          {teacher.title ? <div className="text-muted mt-1 text-sm">{teacher.title}</div> : null}
          {institution ? (
            <div className="text-ink-soft mt-2 flex items-center gap-2 text-sm">
              {institution.logoUrl ? (
                <img
                  src={institution.logoUrl}
                  alt={institution.name}
                  className="border-line h-5 w-5 rounded border object-contain"
                />
              ) : null}
              {institution.name}
            </div>
          ) : null}
        </div>
      </header>

      {teacher.tagline ? (
        <p className="text-ink mt-5 text-base leading-7">{teacher.tagline}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {teacher.specialties.map((item) => (
          <span key={item} className="chip">
            {item}
          </span>
        ))}
      </div>

      {bioBlocks.length > 0 && (
        <div className="mt-8">
          <BlockRenderer blocks={bioBlocks} />
        </div>
      )}

      {teacher.wechatQrUrl ? (
        <div className="mt-8">
          <h2 className="text-ink text-sm font-semibold">加老师微信</h2>
          <p className="text-muted mt-1 text-xs">微信扫一扫，添加老师了解更多课程信息。</p>
          <img
            src={teacher.wechatQrUrl}
            alt={`${teacher.name}的微信二维码`}
            className="border-line mt-3 h-44 w-44 rounded-2xl border object-contain p-2"
          />
        </div>
      ) : null}
    </>
  );
}
