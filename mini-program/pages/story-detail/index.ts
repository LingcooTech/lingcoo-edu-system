import { fetchStory, type ContentItem } from '../../services/api';
import { parseBlocks, type Block } from '../../utils/blocks';
import { enableShareMenu, shareCard, timelineCard } from '../../utils/share';

function isHtmlContent(value: string) {
  return /^\s*</.test(value);
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
      wx.setNavigationBarTitle({ title: story.title });
      this.setData({
        loading: false,
        story,
        blocks: isHtmlContent(content) ? [] : parseBlocks(content),
        html: isHtmlContent(content) ? content : '',
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
