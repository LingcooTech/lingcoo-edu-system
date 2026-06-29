Page({
  onPullDownRefresh() {
    const panel = this.selectComponent('#teacherWorkbench') as
      | { refresh?: () => Promise<void> }
      | null;
    Promise.resolve(panel?.refresh?.()).finally(() => wx.stopPullDownRefresh());
  },
});
