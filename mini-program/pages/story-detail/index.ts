import { fetchStory, type ContentItem } from '../../services/api';
import { parseBlocks, type Block } from '../../utils/blocks';
import { enableShareMenu, shareCard, timelineCard } from '../../utils/share';

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

Page({
  data: {
    loading: true,
    notFound: false,
    story: null as ContentItem | null,
    blocks: [] as Block[],
    html: '',
  },

  onLoad(options: { slug?: string }) {
    enableShareMenu();
    this.load(options.slug || '');
  },

  onShareAppMessage() {
    const story = this.data.story as ContentItem | null;
    return shareCard(
      story?.title || '成长故事',
      `/pages/story-detail/index?slug=${encodeURIComponent(story?.slug || '')}`,
      story?.coverUrl || undefined,
    );
  },

  onShareTimeline() {
    const story = this.data.story as ContentItem | null;
    return timelineCard(
      story?.title || '成长故事',
      `slug=${encodeURIComponent(story?.slug || '')}`,
      story?.coverUrl || undefined,
    );
  },

  async load(slug: string) {
    if (!slug) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.setData({ loading: true, notFound: false });
    try {
      const story = await fetchStory(slug);
      const content = story.content || '';
      const contentIsHtml = looksLikeHtml(content);
      wx.setNavigationBarTitle({ title: story.title });
      this.setData({
        loading: false,
        story,
        blocks: contentIsHtml ? [] : parseBlocks(content),
        html: contentIsHtml ? normalizeStoryHtml(content) : '',
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
});
