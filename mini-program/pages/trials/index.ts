import { loadHome, type TrialSession } from '../../services/api';
import { formatDateTime, money } from '../../utils/format';
import { shareCard, timelineCard } from '../../utils/share';

type TrialListItem = TrialSession & {
  startsAtLabel: string;
  endsAtLabel: string;
  capacityLabel: string;
  reservationFeeLabel: string;
};

function toTrialItem(item: TrialSession): TrialListItem {
  return {
    ...item,
    startsAtLabel: formatDateTime(item.startsAt),
    endsAtLabel: formatDateTime(item.endsAt),
    capacityLabel: `${item.bookedCount}/${item.capacity}`,
    reservationFeeLabel:
      item.reservationFeeAmount > 0 ? `${money(item.reservationFeeAmount)} 席位保留费` : '免费预约',
  };
}

Page({
  data: {
    loading: true,
    trials: [] as TrialListItem[],
    bannerImageUrl: '',
  },

  onLoad() {
    this.load();
  },

  onShareAppMessage() {
    return shareCard('预约试听 · 成长教室', '/pages/trials/index', this.data.bannerImageUrl);
  },

  onShareTimeline() {
    return timelineCard('预约试听 · 成长教室', '', this.data.bannerImageUrl);
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const home = await loadHome();
      const profile = home.organization.publicProfile;
      const bannerImageUrl =
        profile.bannerImages && profile.bannerImages.length
          ? profile.bannerImages[0]
          : profile.bannerImageUrl || '';
      this.setData({
        loading: false,
        bannerImageUrl,
        trials: home.trialSessions.map(toTrialItem),
      });
    } catch (error) {
      this.setData({ loading: false, trials: [] });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },

  goCourses() {
    wx.switchTab({ url: '/pages/courses/index' });
  },
});
