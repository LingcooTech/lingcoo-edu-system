import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const DEFAULT_SITE_TITLE = '成长空间';

function compact(value?: string | null) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  Object.entries(attrs).forEach(([key, value]) => element?.setAttribute(key, value));
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = href;
}

export function buildSeoTitle(title?: string | null, brandName?: string | null) {
  const pageTitle = compact(title);
  const brand = compact(brandName);

  if (pageTitle && brand && pageTitle !== brand) {
    return `${pageTitle} | ${brand}`;
  }
  return pageTitle || brand || DEFAULT_SITE_TITLE;
}

export function useSeo({
  title,
  description,
  brandName,
}: {
  title?: string | null;
  description?: string | null;
  brandName?: string | null;
}) {
  const location = useLocation();
  const seoTitle = buildSeoTitle(title, brandName);
  const seoDescription = compact(description) || seoTitle;

  useEffect(() => {
    document.title = seoTitle;

    upsertMeta('meta[name="description"]', {
      name: 'description',
      content: seoDescription,
    });
    upsertMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: seoDescription,
    });

    upsertMeta('meta[property="og:title"]', {
      property: 'og:title',
      content: seoTitle,
    });
    upsertMeta('meta[property="og:type"]', {
      property: 'og:type',
      content: 'website',
    });

    if (typeof window !== 'undefined') {
      upsertCanonical(`${window.location.origin}${location.pathname}`);
    }
  }, [location.pathname, seoDescription, seoTitle]);
}
