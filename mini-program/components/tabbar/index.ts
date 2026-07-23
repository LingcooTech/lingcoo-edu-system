import { TABBAR_ICONS } from '../../utils/tabbar';
import { fetchMe, hasToken } from '../../services/api';

interface TabBarItem {
  pagePath: string;
  text: string;
  icon: string;
  activeIcon: string;
  active: boolean;
}

Component({
  properties: {
    role: {
      type: String,
      value: '',
      observer() {
        this.initItems();
        this.updateActiveTab();
      },
    },
  },

  data: {
    items: [] as TabBarItem[],
    safeAreaStyle: '',
  },

  lifetimes: {
    attached() {
      this.initItems();
      this.updateActiveTab();
      void this.resolveRole();
    },
  },

  pageLifetimes: {
    show() {
      this.updateActiveTab();
    },
  },

  methods: {
    initItems() {
      const publicTabbarConfig = [
        {
          pagePath: 'pages/home/index',
          text: '首页',
          icon: TABBAR_ICONS.home.inactive,
          activeIcon: TABBAR_ICONS.home.active,
        },
        {
          pagePath: 'pages/courses/index',
          text: '课程',
          icon: TABBAR_ICONS.course.inactive,
          activeIcon: TABBAR_ICONS.course.active,
        },
        {
          pagePath: 'pages/trials/index',
          text: '试听',
          icon: TABBAR_ICONS.trial.inactive,
          activeIcon: TABBAR_ICONS.trial.active,
        },
        {
          pagePath: 'pages/schedule/index',
          text: '课表',
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
      const teacherTabbarConfig = [
        {
          pagePath: 'pages/teacher-workbench/index',
          text: '工作',
          icon: TABBAR_ICONS.work.inactive,
          activeIcon: TABBAR_ICONS.work.active,
        },
        {
          pagePath: 'pages/account/index',
          text: '我的',
          icon: TABBAR_ICONS.account.inactive,
          activeIcon: TABBAR_ICONS.account.active,
        },
      ];
      const tabbarConfig =
        this.properties.role === 'teacher' ? teacherTabbarConfig : publicTabbarConfig;

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

    async resolveRole() {
      if (this.properties.role || !hasToken()) return;
      try {
        const { account } = await fetchMe();
        if (!account || account.role !== 'teacher') return;
        this.setData({ role: account.role });
        this.initItems();
        this.updateActiveTab();
      } catch {
        // Guests and expired sessions keep the public navigation.
      }
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

      if (path === 'pages/teacher-workbench/index') {
        wx.navigateTo({
          url: `/${path}`,
          fail: () => wx.redirectTo({ url: `/${path}` }),
        });
        return;
      }

      wx.switchTab({
        url: `/${path}`,
      });
    },
  },
});
