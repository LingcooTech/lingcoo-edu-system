import {
  fetchAdminOverview,
  searchAdminData,
  type AdminOverview,
  type AdminSearchResult,
} from '../../services/api';

type AdminTab = 'overview' | 'search' | 'orders' | 'students';

const TABS: Array<{ key: AdminTab; label: string }> = [
  { key: 'overview', label: '总览' },
  { key: 'search', label: '搜索' },
  { key: 'orders', label: '订单' },
  { key: 'students', label: '学员' },
];

const STATUS_LABEL: Record<string, string> = {
  scheduled: '已排课',
  in_progress: '进行中',
  completed: '已完成',
  pending: '待支付',
  unpaid: '未支付',
  pending_payment: '待支付',
  paid: '已支付',
  cancelled: '已取消',
  canceled: '已取消',
  refunded: '已退款',
  reserved: '已保留',
  expired: '已过期',
  draft: '草稿',
  published: '已发布',
  recruiting: '招生中',
  active: '正常',
  inactive: '停用',
  paused: '暂停',
  archived: '归档',
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function statusLabel(value: string) {
  return STATUS_LABEL[value] || '未知状态';
}

function toOverviewView(overview: AdminOverview | null) {
  if (!overview) return null;
  return {
    ...overview,
    recentOrders: overview.recentOrders.map((item) => ({
      ...item,
      statusLabel: statusLabel(item.status),
      createdAtLabel: formatDateTime(item.createdAt),
    })),
    recentStudents: overview.recentStudents.map((item) => ({
      ...item,
      statusLabel: statusLabel(item.status),
      createdAtLabel: formatDateTime(item.createdAt),
    })),
    upcomingSessions: overview.upcomingSessions.map((item) => ({
      ...item,
      statusLabel: statusLabel(item.status),
      timeLabel: `${formatDateTime(item.startsAt)}-${pad(new Date(item.endsAt).getHours())}:${pad(
        new Date(item.endsAt).getMinutes(),
      )}`,
    })),
  };
}

function toSearchView(result: AdminSearchResult | null) {
  if (!result) return null;
  return {
    ...result,
    students: result.students.map((item) => ({
      ...item,
      statusLabel: statusLabel(item.status),
    })),
    orders: result.orders.map((item) => ({
      ...item,
      statusLabel: statusLabel(item.status),
      createdAtLabel: formatDateTime(item.createdAt),
    })),
  };
}

Component({
  data: {
    loading: true,
    searching: false,
    activeTab: 'overview' as AdminTab,
    tabs: TABS.map((item) => ({
      ...item,
      className: item.key === 'overview' ? 'admin-tab active' : 'admin-tab',
    })),
    overview: null as ReturnType<typeof toOverviewView>,
    keyword: '',
    searchResult: null as ReturnType<typeof toSearchView>,
  },

  lifetimes: {
    attached() {
      this.refresh();
    },
  },

  methods: {
    async refresh() {
      this.setData({ loading: true });
      try {
        const overview = await fetchAdminOverview();
        this.setData({ overview: toOverviewView(overview), loading: false });
      } catch (error) {
        this.setData({ loading: false });
        wx.showToast({
          title: error instanceof Error ? error.message : '看板加载失败',
          icon: 'none',
        });
      }
    },

    switchTab(event: { currentTarget: { dataset: { tab?: AdminTab } } }) {
      const tab = event.currentTarget.dataset.tab;
      if (!tab || tab === this.data.activeTab) return;
      this.setData({
        activeTab: tab,
        tabs: TABS.map((item) => ({
          ...item,
          className: item.key === tab ? 'admin-tab active' : 'admin-tab',
        })),
      });
    },

    onKeywordInput(event: { detail: { value: string } }) {
      this.setData({ keyword: event.detail.value });
    },

    async submitSearch() {
      const keyword = String(this.data.keyword || '').trim();
      if (!keyword) {
        wx.showToast({ title: '请输入关键词', icon: 'none' });
        return;
      }
      this.setData({ searching: true });
      try {
        const result = await searchAdminData(keyword);
        this.setData({ searchResult: toSearchView(result) });
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '搜索失败', icon: 'none' });
      } finally {
        this.setData({ searching: false });
      }
    },
  },
});
