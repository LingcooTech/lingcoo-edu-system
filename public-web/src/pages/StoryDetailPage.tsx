import { ArrowLeft, CalendarDays } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { fetchStory, type ContentItem } from '@/api/client';
import { ImagePreview, type ImagePreviewState } from '@/components/ImagePreview';
import { Layout } from '@/components/Layout';
import { RichTextRenderer } from '@/components/RichTextRenderer';
import { useSeo } from '@/lib/seo';
import { formatDateTime } from '@/lib/utils';

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function StoryDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [story, setStory] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<ImagePreviewState | null>(null);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    fetchStory(slug)
      .then((payload) => {
        if (active) setStory(payload);
      })
      .catch(() => {
        if (active) setStory(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useSeo({
    title: story?.title || '成长故事',
    description: story?.excerpt || story?.content.slice(0, 140),
  });

  function openHtmlImage(event: MouseEvent<HTMLDivElement>) {
    const image = (event.target as HTMLElement).closest('img') as HTMLImageElement | null;
    if (!image) return;

    const currentUrl = image.currentSrc || image.src;
    if (!currentUrl) return;
    event.preventDefault();

    const group = image.closest('.article-image-scroll, [data-role="image-scroll"]');
    if (!group) {
      setViewer({ urls: [currentUrl], index: 0 });
      return;
    }

    const urls = [...group.querySelectorAll('img')]
      .map((item) => item.currentSrc || item.src)
      .filter(Boolean);
    const index = Math.max(0, urls.indexOf(currentUrl));
    setViewer({ urls: urls.length ? urls : [currentUrl], index });
  }

  return (
    <Layout>
      <section className="container-narrow py-6 sm:py-8">
        <Link
          to="/stories"
          className="text-brand inline-flex items-center gap-1 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" />
          返回成长故事
        </Link>

        {loading ? (
          <div className="pwcard mt-6 p-6">
            <div className="skeleton h-5 w-1/4" />
            <div className="skeleton mt-4 h-10 w-3/4" />
            <div className="skeleton mt-6 h-56 w-full" />
          </div>
        ) : story ? (
          <article className="mt-5 sm:mt-6">
            {story.coverUrl ? (
              <div className="pwcard overflow-hidden">
                <img
                  src={story.coverUrl}
                  alt={story.title}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[16/10] w-full object-cover sm:aspect-[21/9]"
                />
              </div>
            ) : null}

            <header className="mobile-page-head mx-auto mt-5 max-w-3xl sm:mt-8">
              {story.authorName ? (
                <div className="text-brand text-sm font-semibold">{story.authorName}</div>
              ) : null}
              <h1 className="text-ink mt-3 text-2xl leading-tight font-bold md:text-4xl">
                {story.title}
              </h1>
              <div className="text-muted mt-4 flex flex-wrap items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4" />
                <span>{formatDateTime(story.publishedAt || story.createdAt)}</span>
              </div>
              {story.excerpt ? (
                <p className="border-line text-ink-soft mt-6 border-l-2 pl-4 text-base leading-8">
                  {story.excerpt}
                </p>
              ) : null}
            </header>

            <div
              className="story-content mx-auto mt-6 max-w-3xl sm:mt-8"
              onClick={looksLikeHtml(story.content) ? openHtmlImage : undefined}
            >
              {looksLikeHtml(story.content) ? (
                <div dangerouslySetInnerHTML={{ __html: story.content }} />
              ) : (
                <RichTextRenderer content={story.content} />
              )}
            </div>
          </article>
        ) : (
          <div className="pwcard text-muted mt-6 p-6 text-sm">内容不存在或暂未发布。</div>
        )}
      </section>
      <ImagePreview
        viewer={viewer}
        onClose={() => setViewer(null)}
        onChange={(nextIndex) =>
          setViewer((current) => (current ? { ...current, index: nextIndex } : current))
        }
      />
    </Layout>
  );
}
