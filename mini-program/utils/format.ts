export function money(cents?: number | null): string {
  if (cents === null || cents === undefined) return '可预约体验';
  return `¥${(cents / 100).toFixed(2)}`;
}

export function coursePriceLabel(
  input: {
    packageCount?: number;
    startingPriceAmount?: number | null;
  },
  onlinePackageSalesEnabled?: boolean,
): string {
  if (
    !input.packageCount ||
    input.startingPriceAmount === null ||
    input.startingPriceAmount === undefined
  ) {
    return '可预约体验';
  }
  return onlinePackageSalesEnabled
    ? `${money(input.startingPriceAmount)} 起`
    : `${money(input.startingPriceAmount)} 参考`;
}

export function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

export function navigateToWebPath(path: string): void {
  if (!path || path === '/') {
    wx.switchTab({ url: '/pages/home/index' });
    return;
  }

  if (/^https?:\/\//i.test(path)) {
    wx.setClipboardData({
      data: path,
      success() {
        wx.showToast({ title: '链接已复制', icon: 'success' });
      },
    });
    return;
  }

  if (path === '/courses') {
    wx.switchTab({ url: '/pages/courses/index' });
    return;
  }

  if (path === '/trials') {
    wx.switchTab({ url: '/pages/trials/index' });
    return;
  }

  if (path === '/account') {
    wx.switchTab({ url: '/pages/account/index' });
    return;
  }

  const courseMatch = path.match(/^\/courses\/([^/?#]+)/);
  if (courseMatch) {
    wx.navigateTo({ url: `/pages/course-detail/index?slug=${encodeURIComponent(courseMatch[1])}` });
    return;
  }

  const campaignMatch = path.match(/^\/campaigns\/([^/?#]+)/);
  if (campaignMatch) {
    wx.navigateTo({ url: `/pages/campaign/index?code=${encodeURIComponent(campaignMatch[1])}` });
    return;
  }

  if (path === '/teachers') {
    wx.navigateTo({ url: '/pages/teachers/index' });
    return;
  }

  wx.showToast({ title: '该入口小程序暂未开放', icon: 'none' });
}
