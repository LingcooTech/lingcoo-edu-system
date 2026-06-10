import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { loadHome, type HomePayload } from '@/api/client';
import { Layout } from '@/components/Layout';

export function StudentStoriesPage() {
  const [home, setHome] = useState<HomePayload | null>(null);

  useEffect(() => {
    loadHome()
      .then(setHome)
      .catch(() => undefined);
  }, []);

  const profile = home?.organization.publicProfile;
  const testimonials = profile?.testimonials ?? [];

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">成长反馈</div>
        <h1 className="section-title mt-2">学员成长与家长反馈</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">
          前台不直接展示真实学员隐私档案；这里展示机构可公开的家长评价。
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {testimonials.length ? (
            testimonials.map((item) => (
              <blockquote key={`${item.name}-${item.content}`} className="pwcard p-5">
                <div className="flex items-center gap-3">
                  {item.avatarUrl ? (
                    <img
                      src={item.avatarUrl}
                      alt={item.name || '家长头像'}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="bg-brand-soft text-brand flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold">
                      {item.name.slice(0, 1) || '家'}
                    </div>
                  )}
                  <div className="text-ink text-sm font-semibold">{item.name || '家长'}</div>
                </div>
                <p className="text-ink-soft mt-4 text-sm leading-7">“{item.content}”</p>
              </blockquote>
            ))
          ) : (
            <div className="pwcard text-muted p-5 text-sm">
              暂无公开评价。可在后台「品牌设置」里维护用户评价。
            </div>
          )}
        </div>

        <Link to="/register" className="pwbtn pwbtn-primary mt-8">
          预约一次真实课堂体验
        </Link>
      </section>
    </Layout>
  );
}
