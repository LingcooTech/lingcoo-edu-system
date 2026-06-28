import {
  fetchParentCalendar,
  fetchPublicCalendar,
  hasToken,
  type ParentCalendarEvent,
  type PublicCalendarEvent,
} from '../../services/api';
import { shareCard, timelineCard } from '../../utils/share';

type CalendarDayItem = {
  key: string;
  day: string;
  isoDate: string;
  currentMonth: boolean;
  selected: boolean;
  today: boolean;
  eventCount: number;
  hasTrial: boolean;
  hasMine: boolean;
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

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function dateLabel(date: Date): string {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}（周${weekdays[date.getDay()]}）`;
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

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function weekStart(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function calendarStart(date: Date) {
  const firstDay = monthStart(date);
  const day = firstDay.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(firstDay, mondayOffset);
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function sameDate(value: string, isoDate: string) {
  return dateKey(new Date(value)) === isoDate;
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
    item.classroom?.name ||
    item.campus?.name ||
    item.campus?.address ||
    (isTrial ? '校区待确认' : '教室待确认');
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

function buildMonthDays(
  activeMonth: Date,
  selectedIsoDate: string,
  events: ScheduleEventItem[],
): CalendarDayItem[] {
  const start = calendarStart(activeMonth);
  const todayKey = dateKey(new Date());
  const eventMap = events.reduce((map, item) => {
    const key = dateKey(new Date(item.startsAt));
    const current = map.get(key) ?? { count: 0, hasTrial: false, hasMine: false };
    current.count += 1;
    current.hasTrial = current.hasTrial || item.type === 'trial_session';
    current.hasMine = current.hasMine || item.highlighted;
    map.set(key, current);
    return map;
  }, new Map<string, { count: number; hasTrial: boolean; hasMine: boolean }>());

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    const key = dateKey(date);
    const summary = eventMap.get(key);
    return {
      key,
      day: String(date.getDate()),
      isoDate: key,
      currentMonth: date.getMonth() === activeMonth.getMonth(),
      selected: key === selectedIsoDate,
      today: key === todayKey,
      eventCount: summary?.count || 0,
      hasTrial: summary?.hasTrial || false,
      hasMine: summary?.hasMine || false,
    };
  });
}

function buildWeekDays(
  selectedDate: Date,
  activeMonth: Date,
  selectedIsoDate: string,
  events: ScheduleEventItem[],
): CalendarDayItem[] {
  const start = weekStart(selectedDate);
  const todayKey = dateKey(new Date());
  const eventMap = events.reduce((map, item) => {
    const key = dateKey(new Date(item.startsAt));
    const current = map.get(key) ?? { count: 0, hasTrial: false, hasMine: false };
    current.count += 1;
    current.hasTrial = current.hasTrial || item.type === 'trial_session';
    current.hasMine = current.hasMine || item.highlighted;
    map.set(key, current);
    return map;
  }, new Map<string, { count: number; hasTrial: boolean; hasMine: boolean }>());

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const key = dateKey(date);
    const summary = eventMap.get(key);
    return {
      key,
      day: String(date.getDate()),
      isoDate: key,
      currentMonth: date.getMonth() === activeMonth.getMonth(),
      selected: key === selectedIsoDate,
      today: key === todayKey,
      eventCount: summary?.count || 0,
      hasTrial: summary?.hasTrial || false,
      hasMine: summary?.hasMine || false,
    };
  });
}

Page({
  data: {
    loading: false,
    calendarExpanded: false,
    selectedIsoDate: dateKey(new Date()),
    selectedDateLabel: dateLabel(new Date()),
    monthLabel: monthLabel(new Date()),
    weekdays: WEEKDAYS,
    weekDays: [] as CalendarDayItem[],
    calendarDays: [] as CalendarDayItem[],
    activeMonth: dateKey(monthStart(new Date())),
    events: [] as ScheduleEventItem[],
    selectedEvents: [] as ScheduleEventItem[],
  },

  onLoad() {
    const today = new Date();
    this.setData({
      activeMonth: dateKey(monthStart(today)),
      weekDays: buildWeekDays(today, monthStart(today), dateKey(today), []),
      calendarDays: buildMonthDays(today, dateKey(today), []),
    });
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

  async load() {
    const activeMonth = new Date(`${this.data.activeMonth}T00:00:00`);
    const fromDate = calendarStart(activeMonth);
    const toDate = endOfDay(addDays(fromDate, 41));
    const from = fromDate.toISOString();
    const to = toDate.toISOString();
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
      const selectedDate = new Date(`${this.data.selectedIsoDate}T00:00:00`);
      this.setData({
        events,
        selectedEvents: events.filter((event) => sameDate(event.startsAt, this.data.selectedIsoDate)),
        weekDays: buildWeekDays(selectedDate, activeMonth, this.data.selectedIsoDate, events),
        calendarDays: buildMonthDays(activeMonth, this.data.selectedIsoDate, events),
        selectedDateLabel: dateLabel(selectedDate),
        monthLabel: monthLabel(activeMonth),
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

  async setActiveMonth(date: Date, selectedDate = date) {
    this.setData({
      activeMonth: dateKey(monthStart(date)),
      selectedIsoDate: dateKey(selectedDate),
      selectedDateLabel: dateLabel(selectedDate),
      monthLabel: monthLabel(date),
      events: [],
      selectedEvents: [],
      weekDays: buildWeekDays(selectedDate, monthStart(date), dateKey(selectedDate), []),
      calendarDays: buildMonthDays(date, dateKey(selectedDate), []),
    });
    await this.load();
  },

  onSelectDate(event: { currentTarget: { dataset: { isoDate?: string } } }) {
    const isoDate = event.currentTarget.dataset.isoDate;
    if (!isoDate) return;
    const date = new Date(`${isoDate}T00:00:00`);
    const activeMonth = new Date(`${this.data.activeMonth}T00:00:00`);
    if (date.getMonth() !== activeMonth.getMonth() || date.getFullYear() !== activeMonth.getFullYear()) {
      this.setActiveMonth(monthStart(date), date);
      return;
    }
    const events = this.data.events as ScheduleEventItem[];
    this.setData({
      selectedIsoDate: isoDate,
      selectedDateLabel: dateLabel(date),
      weekDays: buildWeekDays(date, activeMonth, isoDate, events),
      calendarDays: buildMonthDays(activeMonth, isoDate, events),
      selectedEvents: events.filter((item) => sameDate(item.startsAt, isoDate)),
    });
  },

  onToggleCalendar() {
    this.setData({ calendarExpanded: !this.data.calendarExpanded });
  },

  onPreviousMonth() {
    const activeMonth = new Date(`${this.data.activeMonth}T00:00:00`);
    this.setActiveMonth(addMonths(activeMonth, -1));
  },

  onCurrentMonth() {
    const today = new Date();
    this.setActiveMonth(monthStart(today), today);
  },

  onNextMonth() {
    const activeMonth = new Date(`${this.data.activeMonth}T00:00:00`);
    this.setActiveMonth(addMonths(activeMonth, 1));
  },

  onOpenEvent(event: { currentTarget: { dataset: { url?: string } } }) {
    const url = event.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  },
});
