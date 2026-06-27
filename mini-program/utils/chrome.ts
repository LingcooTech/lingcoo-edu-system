export type ChromeState = {
  customNavStyle: string;
  customNavInnerStyle: string;
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
    const navBarHeight = menuHeight + 2 * Math.max(0, menuTop - statusBarHeight);
    const totalNavHeight = statusBarHeight + navBarHeight;
    const rightReserved = Math.max(118, windowWidth - menuLeft + 12);
    const logoMaxWidth = Math.max(96, Math.min(168, menuLeft - 40));
    const logoHeight = Math.max(20, Math.round(menuHeight * 0.78));
    return {
      customNavStyle: `height: ${totalNavHeight}px; padding-top: ${menuTop}px; padding-right: ${rightReserved}px;`,
      customNavInnerStyle: `height: ${menuHeight}px;`,
      heroStyle: `padding-top: ${totalNavHeight + offset}px;`,
      navLogoStyle: `height: ${logoHeight}px; max-width: ${logoMaxWidth}px;`,
    };
  } catch {
    return {
      customNavStyle: 'height: 88px; padding-top: 48px; padding-right: 120px;',
      customNavInnerStyle: 'height: 32px;',
      heroStyle: `padding-top: ${96 + offset}px;`,
      navLogoStyle: 'height: 25px; max-width: 168px;',
    };
  }
}
