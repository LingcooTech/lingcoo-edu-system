import {
  fetchParentCalendar,
  fetchPublicCalendar,
  hasToken,
  type ParentCalendarEvent,
  type PublicCalendarEvent,
} from '../../services/api';
import { shareCard, timelineCard } from '../../utils/share';

type WeekDayItem = {
  key: string;
  weekday: string;
  day: string;
  dateLabel: string;
  isoDate: string;
  selected: boolean;
};

type ScheduleEventItem = {
  id: string;
  type: 'class_session' | 'trial_session';
  title: string;
  courseName: string;
  startsAt: string;
  startsAtLabel: string;
  badge: string;
  meta: string;
  url: string;
  highlighted: boolean;
  studentNames: string;
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

function timeLabel(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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

function groupStudentNames(events: ParentCalendarEvent[]) {
  return events.reduce((map, item) => {
    const current = map.get(item.sessionId) ?? [];
    if (!current.includes(item.student.name)) {
      current.push(item.student.name);
    }
    map.set(item.sessionId, current);
    return map;
  }, new Map<string, string[]>());
}

function toScheduleEventItem(
  item: PublicCalendarEvent,
  studentNamesBySessionId: Map<string, string[]>,
): ScheduleEventItem {
  const isTrial = item.type === 'trial_session';
  const studentNames = item.sessionId ? studentNamesBySessionId.get(item.sessionId) || [] : [];
  const time = `${timeLabel(item.startsAt)}-${timeLabel(item.endsAt)}`;
  const courseName = item.course?.name || '课程';
  const location =
    item.classroom?.name || item.campus?.name || item.campus?.address || (isTrial ? '校区待确认' : '教室待确认');
  const className = item.class?.name || '';
  const capacityText =
    isTrial && typeof item.capacity === 'number'
      ? ` · ${item.bookedCount || 0}/${item.capacity}人`
      : '';

  return {
    id: `${item.type}:${item.id}`,
    type: item.type,
    title: item.title,
    courseName,
    startsAt: item.startsAt,
    startsAtLabel: time,
    badge: isTrial ? '试听' : studentNames.length > 0 ? '我的课程' : '班课',
    meta: isTrial ? `${location}${capacityText}` : [className, location].filter(Boolean).join(' · '),
    url: isTrial
      ? `/pages/trial-detail/index?id=${encodeURIComponent(item.trialSessionId || item.id)}`
      : item.course?.slug
        ? `/pages/course-detail/index?slug=${encodeURIComponent(item.course.slug)}`
        : '',
    highlighted: studentNames.length > 0,
    studentNames: studentNames.join('、'),
  };
}

Page({
  data: {
    loading: false,
    selectedIsoDate: dateKey(new Date()),
    selectedDateLabel: '',
    weekDays: [] as WeekDayItem[],
    events: [] as ScheduleEventItem[],
    selectedEvents: [] as ScheduleEventItem[],
  },

  onLoad() {
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
    const selectedDate = new Date(`${this.data.selectedIsoDate}T00:00:00`);
    const from = weekStart(selectedDate).toISOString();
    const to = endOfDay(addDays(weekStart(selectedDate), 6)).toISOString();
    this.setData({ loading: true });
    try {
      const publicEvents = await fetchPublicCalendar({ from, to });
      let parentEvents: ParentCalendarEvent[] = [];
      if (hasToken()) {
        parentEvents = await fetchParentCalendar({ from, to }).catch(() => []);
      }
      const studentNamesBySessionId = groupStudentNames(parentEvents);
      const events = publicEvents
        .map((event) => toScheduleEventItem(event, studentNamesBySessionId))
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
      this.setData({
        events,
        selectedEvents: events.filter((event) => sameDate(event.startsAt, this.data.selectedIsoDate)),
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false, events: [], selectedEvents: [] });
      wx.showToast({
        title: error instanceof Error ? error.message : '课表加载失败',
        icon: 'none',
      });
    }
  },

  async setSelectedDate(date: Date) {
    const weekDays = buildWeek(date);
    this.setData({
      selectedIsoDate: dateKey(date),
      selectedDateLabel: selectedDateLabel(weekDays),
      weekDays,
    });
    await this.load();
  },

  onSelectDate(event: { currentTarget: { dataset: { isoDate?: string } } }) {
    const isoDate = event.currentTarget.dataset.isoDate;
    if (!isoDate) return;
    const date = new Date(`${isoDate}T00:00:00`);
    const weekDays = buildWeek(date);
    const events = this.data.events as ScheduleEventItem[];
    this.setData({
      selectedIsoDate: isoDate,
      selectedDateLabel: selectedDateLabel(weekDays),
      weekDays,
      selectedEvents: events.filter((item) => sameDate(item.startsAt, isoDate)),
    });
  },

  onPreviousWeek() {
    this.setSelectedDate(addDays(new Date(`${this.data.selectedIsoDate}T00:00:00`), -7));
  },

  onCurrentWeek() {
    this.setSelectedDate(new Date());
  },

  onNextWeek() {
    this.setSelectedDate(addDays(new Date(`${this.data.selectedIsoDate}T00:00:00`), 7));
  },

  onOpenEvent(event: { currentTarget: { dataset: { url?: string } } }) {
    const url = event.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  },
});
