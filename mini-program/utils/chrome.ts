export type ChromeState = {
  customNavStyle: string;
  heroStyle: string;
  navLogoStyle: string;
};

export function createChromeState(offset = 16): ChromeState {
  try {
    const system = wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    const windowWidth = system.windowWidth || 375;
    const statusBarHeight = system.statusBarHeight || 44;
    const menuTop = menu.top || statusBarHeight + 4;
    const menuHeight = menu.height || 32;
    const menuBottom = menu.bottom || menuTop + menuHeight;
    const menuLeft = menu.left || windowWidth - 96;
    const rightReserved = Math.max(118, windowWidth - menuLeft + 12);
    const logoWidth = Math.max(120, Math.min(220, menuLeft - 28));
    return {
      customNavStyle: `top: ${menuTop}px; height: ${menuHeight}px; padding-right: ${rightReserved}px;`,
      heroStyle: `padding-top: ${menuBottom + offset}px;`,
      navLogoStyle: `width: ${logoWidth}px; height: ${menuHeight}px;`,
    };
  } catch {
    return {
      customNavStyle: 'top: 44px; height: 32px; padding-right: 120px;',
      heroStyle: `padding-top: ${96 + offset}px;`,
      navLogoStyle: 'width: 220px; height: 32px;',
    };
  }
}
