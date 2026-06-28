Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    showBack: {
      type: Boolean,
      value: false,
    },
    transparent: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    navStyle: 'height: 88px; padding-top: 48px; padding-right: 120px;',
    navInnerStyle: 'height: 32px;',
    navTitleStyle: 'top: 48px; height: 32px;',
  },

  lifetimes: {
    attached() {
      this.setData(createNavState());
    },
  },

  methods: {
    onBack() {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.switchTab({
            url: '/pages/home/index',
            fail: () => wx.redirectTo({ url: '/pages/home/index' }),
          });
        },
      });
    },
  },
});

function createNavState() {
  try {
    const system = wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    const windowWidth = system.windowWidth || 375;
    const statusBarHeight = system.statusBarHeight || 44;
    const menuTop = menu.top || statusBarHeight + 4;
    const menuHeight = menu.height || 32;
    const menuLeft = menu.left || windowWidth - 96;
    const navBarHeight = menuHeight + 2 * Math.max(0, menuTop - statusBarHeight);
    const totalNavHeight = statusBarHeight + navBarHeight;
    const rightReserved = Math.max(118, windowWidth - menuLeft + 12);
    return {
      navStyle: `height: ${totalNavHeight}px; padding-top: ${menuTop}px; padding-right: ${rightReserved}px;`,
      navInnerStyle: `height: ${menuHeight}px;`,
      navTitleStyle: `top: ${menuTop}px; height: ${menuHeight}px;`,
    };
  } catch {
    return {
      navStyle: 'height: 88px; padding-top: 48px; padding-right: 120px;',
      navInnerStyle: 'height: 32px;',
      navTitleStyle: 'top: 48px; height: 32px;',
    };
  }
}
