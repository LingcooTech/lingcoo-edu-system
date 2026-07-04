import { fetchStories, type ContentItem } from '../../services/api';
import { configuredShareTitle, enableShareMenu, shareCard, timelineCard } from '../../utils/share';

type StoryCard = {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string;
};

function toStoryCard(item: ContentItem): StoryCard {
  return {
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt || item.content,
    coverImageUrl: item.coverThumbUrl || item.coverUrl || '',
  };
}

Page({
  data: {
    loading: true,
    stories: [] as StoryCard[],
  },

  onLoad() {
    enableShareMenu();
    this.load();
  },

  onShareAppMessage() {
    return shareCard(configuredShareTitle('stories', '成长故事 · 成长教室'), '/pages/stories/index');
  },

  onShareTimeline() {
    return timelineCard(configuredShareTitle('stories', '成长故事 · 成长教室'), '');
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const payload = await fetchStories({ limit: 50, offset: 0 });
      this.setData({ loading: false, stories: payload.items.map(toStoryCard) });
    } catch (error) {
      this.setData({ loading: false, stories: [] });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },
});
