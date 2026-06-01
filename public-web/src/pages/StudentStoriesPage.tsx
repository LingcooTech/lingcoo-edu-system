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
  const gallery = profile?.gallery ?? [];

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">Students</div>
        <h1 className="section-title mt-2">学员成长与家长反馈</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">
          前台不直接展示真实学员隐私档案；这里展示机构可公开的家长评价、课堂环境和作品图片。
        </p>

        {gallery.length > 0 && (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {gallery.map((url) => (
              <div key={url} className="hero-media aspect-square">
                <img src={url} alt="课堂环境或学员作品" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {testimonials.length ? (
            testimonials.map((item) => (
              <blockquote key={item} className="pwcard p-5 text-sm leading-7 text-ink-soft">
                “{item}”
              </blockquote>
            ))
          ) : (
            <div className="pwcard p-5 text-sm text-muted">
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
