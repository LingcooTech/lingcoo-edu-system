import {
  fetchTrialSessions,
  loadHome,
  type Course,
  type PublicCampus,
  type TrialSession,
} from '../../services/api';
import { formatDateTime, money } from '../../utils/format';
import { shareCard, timelineCard } from '../../utils/share';

type TimeFilter = 'next_14' | 'this_week' | 'next_week' | 'all';

type TrialListItem = TrialSession & {
  startsAtLabel: string;
  endsAtLabel: string;
  capacityLabel: string;
  reservationFeeLabel: string;
};

interface FilterOption {
  label: string;
  value: string;
}

const TIME_FILTERS: Array<{ key: TimeFilter; label: string }> = [
  { key: 'next_14', label: '近14天' },
  { key: 'this_week', label: '本周' },
  { key: 'next_week', label: '下周' },
  { key: 'all', label: '全部' },
];

function toTrialItem(item: TrialSession): TrialListItem {
  return {
    ...item,
    startsAtLabel: formatDateTime(item.startsAt),
    endsAtLabel: formatDateTime(item.endsAt),
    capacityLabel: `${item.bookedCount}/${item.capacity}`,
    reservationFeeLabel:
      item.reservationFeeAmount > 0 ? `${money(item.reservationFeeAmount)} 席位保留费` : '免费预约',
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + offset);
  return next;
}

function endOfWeek(date: Date) {
  return endOfDay(addDays(startOfWeek(date), 6));
}

function timeRangeForFilter(filter: TimeFilter, now = new Date()) {
  if (filter === 'this_week') {
    return { from: now, to: endOfWeek(now) };
  }
  if (filter === 'next_week') {
    const from = addDays(startOfWeek(now), 7);
    return { from, to: endOfWeek(from) };
  }
  if (filter === 'next_14') {
    return { from: now, to: endOfDay(addDays(now, 13)) };
  }
  return { from: now, to: null };
}

function courseOptions(courses: Course[]): FilterOption[] {
  return [
    { label: '全部课程', value: '' },
    ...courses.map((course) => ({ label: course.name, value: course.id })),
  ];
}

function campusOptions(campuses: PublicCampus[]): FilterOption[] {
  return [
    { label: '全部校区', value: '' },
    ...campuses.map((campus) => ({ label: campus.name, value: campus.id })),
  ];
}

function filterTrials(
  trials: TrialListItem[],
  filter: {
    timeFilter: TimeFilter;
    courseId: string;
    campusId: string;
    showFull: boolean;
  },
) {
  const range = timeRangeForFilter(filter.timeFilter);
  return trials
    .filter((trial) => {
      const startsAt = new Date(trial.startsAt);
      if (startsAt < range.from) return false;
      if (range.to && startsAt > range.to) return false;
      if (filter.courseId && trial.courseId !== filter.courseId) return false;
      if (filter.campusId && trial.campusId !== filter.campusId) return false;
      if (!filter.showFull && trial.bookedCount >= trial.capacity) return false;
      return true;
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

Page({
  data: {
    loading: true,
    allTrials: [] as TrialListItem[],
    trials: [] as TrialListItem[],
    timeFilters: TIME_FILTERS,
    activeTimeFilter: 'next_14' as TimeFilter,
    courseOptions: [{ label: '全部课程', value: '' }] as FilterOption[],
    campusOptions: [{ label: '全部校区', value: '' }] as FilterOption[],
    selectedCourseIndex: 0,
    selectedCampusIndex: 0,
    showFull: false,
  },

  onLoad() {
    this.load();
  },

  onShareAppMessage() {
    return shareCard('预约试听 · 成长教室', '/pages/trials/index');
  },

  onShareTimeline() {
    return timelineCard('预约试听 · 成长教室', '');
  },

  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const [trialSessions, home] = await Promise.all([
        fetchTrialSessions(),
        loadHome().catch(() => null),
      ]);
      const allTrials = trialSessions.map(toTrialItem);
      const courses = home?.featuredCourses ?? [];
      const campuses = home?.campuses ?? [];
      const nextCourseOptions = courseOptions(courses);
      const nextCampusOptions = campusOptions(campuses);
      const selectedCourseIndex = Math.min(
        this.data.selectedCourseIndex,
        nextCourseOptions.length - 1,
      );
      const selectedCampusIndex = Math.min(
        this.data.selectedCampusIndex,
        nextCampusOptions.length - 1,
      );
      const filter = {
        timeFilter: this.data.activeTimeFilter,
        courseId: nextCourseOptions[selectedCourseIndex]?.value ?? '',
        campusId: nextCampusOptions[selectedCampusIndex]?.value ?? '',
        showFull: this.data.showFull,
      };
      this.setData({
        loading: false,
        allTrials,
        courseOptions: nextCourseOptions,
        campusOptions: nextCampusOptions,
        selectedCourseIndex,
        selectedCampusIndex,
        trials: filterTrials(allTrials, filter),
      });
    } catch (error) {
      this.setData({ loading: false, allTrials: [], trials: [] });
      wx.showToast({
        title: error instanceof Error ? error.message : '加载失败',
        icon: 'none',
      });
    }
  },

  goCourses() {
    wx.switchTab({ url: '/pages/courses/index' });
  },

  onTimeFilterTap(event: { currentTarget: { dataset: { key?: TimeFilter } } }) {
    const key = event.currentTarget.dataset.key;
    if (!key) return;
    const courseOptions = this.data.courseOptions as FilterOption[];
    const campusOptions = this.data.campusOptions as FilterOption[];
    this.setData({
      activeTimeFilter: key,
      trials: filterTrials(this.data.allTrials as TrialListItem[], {
        timeFilter: key,
        courseId: courseOptions[this.data.selectedCourseIndex]?.value ?? '',
        campusId: campusOptions[this.data.selectedCampusIndex]?.value ?? '',
        showFull: Boolean(this.data.showFull),
      }),
    });
  },

  onCourseChange(event: { detail: { value: string } }) {
    const selectedCourseIndex = Number(event.detail.value) || 0;
    const courseOptions = this.data.courseOptions as FilterOption[];
    const campusOptions = this.data.campusOptions as FilterOption[];
    this.setData({
      selectedCourseIndex,
      trials: filterTrials(this.data.allTrials as TrialListItem[], {
        timeFilter: this.data.activeTimeFilter as TimeFilter,
        courseId: courseOptions[selectedCourseIndex]?.value ?? '',
        campusId: campusOptions[this.data.selectedCampusIndex]?.value ?? '',
        showFull: Boolean(this.data.showFull),
      }),
    });
  },

  onCampusChange(event: { detail: { value: string } }) {
    const selectedCampusIndex = Number(event.detail.value) || 0;
    const courseOptions = this.data.courseOptions as FilterOption[];
    const campusOptions = this.data.campusOptions as FilterOption[];
    this.setData({
      selectedCampusIndex,
      trials: filterTrials(this.data.allTrials as TrialListItem[], {
        timeFilter: this.data.activeTimeFilter as TimeFilter,
        courseId: courseOptions[this.data.selectedCourseIndex]?.value ?? '',
        campusId: campusOptions[selectedCampusIndex]?.value ?? '',
        showFull: Boolean(this.data.showFull),
      }),
    });
  },

  onToggleFull() {
    const showFull = !this.data.showFull;
    const courseOptions = this.data.courseOptions as FilterOption[];
    const campusOptions = this.data.campusOptions as FilterOption[];
    this.setData({
      showFull,
      trials: filterTrials(this.data.allTrials as TrialListItem[], {
        timeFilter: this.data.activeTimeFilter as TimeFilter,
        courseId: courseOptions[this.data.selectedCourseIndex]?.value ?? '',
        campusId: campusOptions[this.data.selectedCampusIndex]?.value ?? '',
        showFull,
      }),
    });
  },
});
