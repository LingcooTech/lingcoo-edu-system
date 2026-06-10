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

  const stories = home?.organization.publicProfile.studentStories ?? [];

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">成长故事</div>
        <h1 className="section-title mt-2">学员成长故事</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">
          记录孩子从试听、练习到形成习惯的真实变化，用故事呈现课程带来的长期影响。
        </p>

        {stories.length ? (
          <div className="mt-8 grid gap-5">
            {stories.map((story) => (
              <article
                key={`${story.title}-${story.studentName}`}
                className="pwcard overflow-hidden md:grid md:grid-cols-[320px_minmax(0,1fr)]"
              >
                {story.coverImageUrl ? (
                  <div className="bg-brand-soft aspect-[4/3] overflow-hidden md:aspect-auto md:min-h-72">
                    <img
                      src={story.coverImageUrl}
                      alt={story.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="bg-brand-soft hidden md:block" />
                )}
                <div className="p-6 md:p-7">
                  {story.studentName ? (
                    <div className="text-brand text-xs font-semibold">{story.studentName}</div>
                  ) : null}
                  <h2 className="text-ink mt-2 text-2xl leading-tight font-bold">{story.title}</h2>
                  <p className="text-ink-soft mt-4 text-sm leading-7">
                    {story.summary || story.content}
                  </p>
                  {story.content && story.content !== story.summary ? (
                    <p className="text-ink-soft mt-5 text-sm leading-7 whitespace-pre-wrap">
                      {story.content}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="pwcard text-muted mt-8 p-6 text-sm">
            暂无公开成长故事。可在后台「机构主页」里添加故事标题、封面、摘要和正文。
          </div>
        )}

        <Link to="/register" className="pwbtn pwbtn-primary mt-8">
          预约一次真实课堂体验
        </Link>
      </section>
    </Layout>
  );
}
