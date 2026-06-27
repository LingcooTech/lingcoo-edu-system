import { fetchParentCalendar, hasToken } from '../../services/api';
import { createChromeState } from '../../utils/chrome';
import { toCalendarEventItem, type CalendarEventItem } from '../../utils/parent-center';
import { shareCard, timelineCard } from '../../utils/share';

type WeekDayItem = {
  key: string;
  weekday: string;
  day: string;
  dateLabel: string;
  isoDate: string;
  selected: boolean;
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthDay(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekStart(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function sameDate(value: string, isoDate: string) {
  return dateKey(new Date(value)) === isoDate;
}

function buildWeek(selectedDate: Date): WeekDayItem[] {
  const start = weekStart(selectedDate);
  const selectedKey = dateKey(selectedDate);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const key = dateKey(date);
    return {
      key,
      weekday: WEEKDAYS[date.getDay()],
      day: String(date.getDate()),
      dateLabel: `${monthDay(date)}（周${WEEKDAYS[date.getDay()]}）`,
      isoDate: key,
      selected: key === selectedKey,
    };
  });
}

function selectedDateLabel(weekDays: WeekDayItem[]) {
  return weekDays.find((item) => item.selected)?.dateLabel || '';
}

Page({
  data: {
    loading: false,
    needLogin: false,
    selectedIsoDate: dateKey(new Date()),
    selectedDateLabel: '',
    weekDays: [] as WeekDayItem[],
    events: [] as CalendarEventItem[],
    selectedEvents: [] as CalendarEventItem[],
    heroStyle: createChromeState(18).heroStyle,
  },

  onLoad() {
    this.setData({ heroStyle: createChromeState(18).heroStyle });
    this.resetWeek(new Date());
  },

  onShow() {
    this.load();
  },

  onShareAppMessage() {
    return shareCard('课表 · 成长教室', '/pages/schedule/index');
  },

  onShareTimeline() {
    return timelineCard('课表 · 成长教室', '');
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  resetWeek(date: Date) {
    const weekDays = buildWeek(date);
    this.setData({
      selectedIsoDate: dateKey(date),
      selectedDateLabel: selectedDateLabel(weekDays),
      weekDays,
    });
  },

  async load() {
    if (!hasToken()) {
      this.setData({ needLogin: true, loading: false, events: [], selectedEvents: [] });
      return;
    }

    const selectedDate = new Date(`${this.data.selectedIsoDate}T00:00:00`);
    const from = weekStart(selectedDate).toISOString();
    const to = endOfDay(addDays(weekStart(selectedDate), 6)).toISOString();
    this.setData({ loading: true, needLogin: false });
    try {
      const events = (await fetchParentCalendar({ from, to }))
        .map(toCalendarEventItem)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
      this.setData({
        events,
        selectedEvents: events.filter((event) => sameDate(event.startsAt, this.data.selectedIsoDate)),
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({
        title: error instanceof Error ? error.message : '课表加载失败',
        icon: 'none',
      });
    }
  },

  onSelectDate(event: { currentTarget: { dataset: { isoDate?: string } } }) {
    const isoDate = event.currentTarget.dataset.isoDate;
    if (!isoDate) return;
    const date = new Date(`${isoDate}T00:00:00`);
    const weekDays = buildWeek(date);
    const events = this.data.events as CalendarEventItem[];
    this.setData({
      selectedIsoDate: isoDate,
      selectedDateLabel: selectedDateLabel(weekDays),
      weekDays,
      selectedEvents: events.filter((item) => sameDate(item.startsAt, isoDate)),
    });
  },

  goLogin() {
    wx.switchTab({ url: '/pages/account/index' });
  },
});
