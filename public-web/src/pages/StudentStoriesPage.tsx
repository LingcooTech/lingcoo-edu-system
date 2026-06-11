import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchStories, loadHome, type ContentItem, type HomePayload } from '@/api/client';
import { Layout } from '@/components/Layout';

const PAGE_SIZE = 12;

export function StoriesPage() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [stories, setStories] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHome()
      .then(setHome)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchStories({ limit: PAGE_SIZE, offset: 0, search: search.trim() || undefined })
      .then((payload) => {
        if (!active) return;
        setStories(payload.items);
        setTotal(payload.total);
      })
      .catch(() => {
        if (!active) return;
        setStories([]);
        setTotal(0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search]);

  const title = home?.organization.publicProfile.contentMarketingTitle || '成长故事';

  return (
    <Layout>
      <section className="container-narrow py-10">
        <div className="eyebrow">{title}</div>
        <h1 className="section-title mt-2">{title}</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm leading-7">
          记录孩子从试听、练习到形成习惯的真实变化，用故事呈现课程带来的长期影响。
        </p>

        <div className="border-line bg-surface mt-7 flex max-w-xl items-center gap-2 rounded-full border px-4 py-2">
          <Search className="text-muted h-4 w-4" />
          <input
            className="text-ink placeholder:text-muted min-w-0 flex-1 bg-transparent text-sm outline-none"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索标题、摘要或作者"
          />
          {total > 0 ? <span className="text-muted text-xs">共 {total} 篇</span> : null}
        </div>

        {loading ? (
          <div className="mt-8 grid gap-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="pwcard p-5">
                <div className="skeleton h-4 w-1/3" />
                <div className="skeleton mt-4 h-7 w-2/3" />
                <div className="skeleton mt-4 h-4 w-full" />
                <div className="skeleton mt-2 h-4 w-4/5" />
              </div>
            ))}
          </div>
        ) : stories.length ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {stories.map((story) => (
              <Link
                key={story.id}
                to={`/stories/${story.slug}`}
                className="pwcard pwcard-hover group flex flex-col overflow-hidden no-underline"
              >
                {story.coverUrl ? (
                  <div className="bg-brand-soft aspect-[16/10] overflow-hidden">
                    <img
                      src={story.coverUrl}
                      alt={story.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col p-5">
                  {story.authorName ? (
                    <div className="text-brand text-xs font-semibold">{story.authorName}</div>
                  ) : null}
                  <h2 className="text-ink mt-2 line-clamp-2 text-xl leading-tight font-bold">
                    {story.title}
                  </h2>
                  <p className="text-ink-soft mt-4 line-clamp-3 flex-1 text-sm leading-7">
                    {story.excerpt || story.content}
                  </p>
                  <span className="text-brand mt-5 text-sm font-semibold">阅读全文</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="pwcard text-muted mt-8 p-6 text-sm">
            暂无公开内容。可在后台「招生转化 / 内容营销」中新建或导入内容并发布。
          </div>
        )}

        <Link to="/register" className="pwbtn pwbtn-primary mt-8">
          预约一次真实课堂体验
        </Link>
      </section>
    </Layout>
  );
}
