import { TABBAR_ICONS } from '../../utils/tabbar';

interface TabBarItem {
  pagePath: string;
  text: string;
  icon: string;
  activeIcon: string;
  active: boolean;
}

Component({
  data: {
    items: [] as TabBarItem[],
    safeAreaStyle: '',
  },

  lifetimes: {
    attached() {
      this.initItems();
      this.updateActiveTab();
    },
  },

  pageLifetimes: {
    show() {
      this.updateActiveTab();
    },
  },

  methods: {
    initItems() {
      const tabbarConfig = [
        {
          pagePath: 'pages/home/index',
          text: '首页',
          icon: TABBAR_ICONS.home.inactive,
          activeIcon: TABBAR_ICONS.home.active,
        },
        {
          pagePath: 'pages/courses/index',
          text: '活动',
          icon: TABBAR_ICONS.course.inactive,
          activeIcon: TABBAR_ICONS.course.active,
        },
        {
          pagePath: 'pages/trials/index',
          text: '预约',
          icon: TABBAR_ICONS.trial.inactive,
          activeIcon: TABBAR_ICONS.trial.active,
        },
        {
          pagePath: 'pages/schedule/index',
          text: '排期',
          icon: TABBAR_ICONS.schedule.inactive,
          activeIcon: TABBAR_ICONS.schedule.active,
        },
        {
          pagePath: 'pages/account/index',
          text: '我的',
          icon: TABBAR_ICONS.account.inactive,
          activeIcon: TABBAR_ICONS.account.active,
        },
      ];

      this.setData({
        items: tabbarConfig.map((item) => ({
          ...item,
          active: false,
        })),
      });

      wx.getSystemInfoSync();
      this.setData({
        safeAreaStyle: `height: env(safe-area-inset-bottom);`,
      });
    },

    updateActiveTab() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      if (!currentPage) return;

      const currentPath = currentPage.route;
      const items = (this.data.items as TabBarItem[]).map((item) => ({
        ...item,
        active: item.pagePath === currentPath,
      }));

      this.setData({ items });
    },

    onTabChange(e: { currentTarget: { dataset: { path?: string } } }) {
      const { path } = e.currentTarget.dataset;
      if (!path) return;

      const pages = getCurrentPages();
      const currentPath = pages[pages.length - 1]?.route;

      if (currentPath === path) return;

      // Navigate to the selected tab
      wx.switchTab({
        url: `/${path}`,
      });
    },
  },
});
