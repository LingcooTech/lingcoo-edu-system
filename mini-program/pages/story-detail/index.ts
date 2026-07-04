import { fetchStory, type ContentItem } from '../../services/api';
import { parseBlocks, type Block } from '../../utils/blocks';
import { configuredShareTitle, enableShareMenu, shareCard, timelineCard } from '../../utils/share';

type StoryHtmlSegment =
  | { type: 'html'; html: string }
  | { type: 'image'; url: string }
  | { type: 'imageScroll'; urls: string[] };

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function applyInlineStyle(html: string, tag: string, style: string) {
  return html.replace(new RegExp(`<${tag}\\b([^>]*)>`, 'gi'), (_match, attrs: string) => {
    const nextAttrs = attrs.replace(
      /\sstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_styleMatch, quote: string, existingStyle: string) =>
        ` style=${quote}${existingStyle}; ${style}${quote}`,
    );
    if (nextAttrs !== attrs) return `<${tag}${nextAttrs}>`;
    return `<${tag}${attrs} style="${style}">`;
  });
}

function isEmptyHtmlParagraph(innerHtml: string) {
  const text = innerHtml
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
  return text.length === 0;
}

function appendSpacingAfterTag(html: string, tag: string, heightPx: number) {
  const spacer = `<div style="height: ${heightPx}px; line-height: ${heightPx}px;"></div>`;
  return html.replace(new RegExp(`</${tag}>`, 'gi'), `</${tag}>${spacer}`);
}

function normalizeStoryHtml(value: string) {
  const paragraphStyle =
    'display: block; margin: 0; padding: 0; color: #33302c; font-size: 16px; line-height: 1.72;';
  const headingStyle =
    'display: block; margin: 0; padding: 18px 0 12px; color: #211f1c; font-weight: 700; line-height: 1.45;';

  let html = value
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (match, innerHtml: string) =>
      isEmptyHtmlParagraph(innerHtml) ? '' : match,
    )
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br /><br />');

  html = applyInlineStyle(html, 'p', paragraphStyle);
  html = applyInlineStyle(html, 'h1', `${headingStyle} font-size: 20px;`);
  html = applyInlineStyle(html, 'h2', `${headingStyle} font-size: 19px;`);
  html = applyInlineStyle(html, 'h3', `${headingStyle} font-size: 17px;`);
  html = applyInlineStyle(html, 'img', 'max-width: 100%; height: auto; border-radius: 6px;');
  html = appendSpacingAfterTag(html, 'p', 12);
  html = appendSpacingAfterTag(html, 'h1', 8);
  html = appendSpacingAfterTag(html, 'h2', 8);
  html = appendSpacingAfterTag(html, 'h3', 8);

  return html.trim();
}

function extractImageUrls(value: string) {
  return [...value.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter(Boolean);
}

function appendHtmlWithSingleImages(segments: StoryHtmlSegment[], value: string) {
  const pattern =
    /<figure\b[^>]*>[\s\S]*?<img\b[^>]*\ssrc=["']([^"']+)["'][^>]*>[\s\S]*?<\/figure>|<img\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const before = value.slice(cursor, match.index).trim();
    if (before) segments.push({ type: 'html', html: before });

    const url = match[1] || match[2];
    if (url) segments.push({ type: 'image', url });
    cursor = match.index + match[0].length;
  }

  const after = value.slice(cursor).trim();
  if (after) segments.push({ type: 'html', html: after });
}

function splitStoryHtml(value: string): StoryHtmlSegment[] {
  const segments: StoryHtmlSegment[] = [];
  const pattern =
    /<div[^>]*(?:class=["'][^"']*article-image-scroll[^"']*["']|data-role=["']image-scroll["'])[^>]*>([\s\S]*?)<\/div>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const before = value.slice(cursor, match.index).trim();
    if (before) appendHtmlWithSingleImages(segments, before);

    const urls = extractImageUrls(match[1]);
    if (urls.length) segments.push({ type: 'imageScroll', urls });
    cursor = match.index + match[0].length;
  }

  const after = value.slice(cursor).trim();
  if (after) appendHtmlWithSingleImages(segments, after);
  return segments;
}

Page({
  data: {
    loading: true,
    notFound: false,
    story: null as ContentItem | null,
    blocks: [] as Block[],
    html: '',
    htmlSegments: [] as StoryHtmlSegment[],
  },

  onLoad(options: { slug?: string }) {
    enableShareMenu();
    this.load(options.slug || '');
  },

  onShareAppMessage() {
    const story = this.data.story as ContentItem | null;
    return shareCard(
      configuredShareTitle('storyDetail', story?.title || '成长故事'),
      `/pages/story-detail/index?slug=${encodeURIComponent(story?.slug || '')}`,
      story?.coverUrl || undefined,
    );
  },

  onShareTimeline() {
    const story = this.data.story as ContentItem | null;
    return timelineCard(
      configuredShareTitle('storyDetail', story?.title || '成长故事'),
      `slug=${encodeURIComponent(story?.slug || '')}`,
      story?.coverUrl || undefined,
    );
  },

  async load(slug: string) {
    if (!slug) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.setData({ loading: true, notFound: false, blocks: [], html: '', htmlSegments: [] });
    try {
      const story = await fetchStory(slug);
      const content = story.content || '';
      const contentIsHtml = looksLikeHtml(content);
      const html = contentIsHtml ? normalizeStoryHtml(content) : '';
      const htmlSegments = html ? splitStoryHtml(html) : [];
      wx.setNavigationBarTitle({ title: story.title });
      this.setData({
        loading: false,
        story,
        blocks: contentIsHtml ? [] : parseBlocks(content),
        html,
        htmlSegments,
      });
    } catch {
      this.setData({ loading: false, notFound: true });
    }
  },

  goBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.switchTab({ url: '/pages/home/index' });
      },
    });
  },

  onPreviewImage(event: { currentTarget: { dataset: { url?: string; urls?: string[] } } }) {
    const url = event.currentTarget.dataset.url;
    const urls = event.currentTarget.dataset.urls || (url ? [url] : []);
    if (url && urls.length) {
      wx.previewImage({ urls, current: url });
    }
  },
});
