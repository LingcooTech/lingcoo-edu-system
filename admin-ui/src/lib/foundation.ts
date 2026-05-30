import {
  BarChart3,
  BookOpen,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  ReceiptText,
  Settings,
  Users,
} from 'lucide-react';

// Active tenant, resolved at runtime from GET /v1/tenants after login (see the
// TenantGate in App.tsx). These are mutable module bindings: pages import
// `tenantId` and read it at render time, and ES module live bindings mean they
// observe the resolved value once the gate has set it — so no per-page wiring
// is needed. Empty until the gate runs; the gate blocks rendering until then.
export let tenantId = '';
export let tenantName = '';

export function setActiveTenant(id: string, name = '') {
  tenantId = id;
  tenantName = name;
}

export const adminSections = [
  {
    group: '经营',
    items: [
      { key: 'dashboard', label: '概览', path: '/', icon: LayoutDashboard },
      { key: 'leads', label: '线索', path: '/leads', icon: Users },
      { key: 'trials', label: '公开课', path: '/trials', icon: Megaphone },
    ],
  },
  {
    group: '教学',
    items: [
      { key: 'courses', label: '课程', path: '/courses', icon: BookOpen },
      { key: 'students', label: '学员', path: '/students', icon: GraduationCap },
      { key: 'classes', label: '班级', path: '/classes', icon: CalendarDays },
      { key: 'schedule', label: '排课', path: '/schedule', icon: CalendarDays },
      { key: 'lessons', label: '课时', path: '/lessons', icon: BarChart3 },
    ],
  },
  {
    group: '运营',
    items: [
      { key: 'orders', label: '订单', path: '/orders', icon: ReceiptText },
      { key: 'resources', label: '老师教室', path: '/resources', icon: Users },
      { key: 'marketing', label: '营销获客', path: '/marketing', icon: Megaphone },
      { key: 'settings', label: '设置', path: '/settings', icon: Settings },
    ],
  },
] as const;

export const pageMeta: Record<string, { title: string; description: string; eyebrow: string }> = {
  dashboard: {
    eyebrow: 'Dashboard',
    title: '经营概览',
    description: '查看招生、试听、收入、课时和今日课程。',
  },
  leads: {
    eyebrow: 'CRM',
    title: '线索管理',
    description: '跟进扫码报名、试听预约和转化状态。',
  },
  trials: {
    eyebrow: 'Trial',
    title: '公开课 / 试听课',
    description: '管理引流课、公开课报名和到课转化。',
  },
  courses: {
    eyebrow: 'Catalog',
    title: '课程管理',
    description: '维护课程产品、价格、课时数和公开端展示状态。',
  },
  students: {
    eyebrow: 'People',
    title: '学员管理',
    description: '管理孩子档案、家长信息和课时余额。',
  },
  classes: {
    eyebrow: 'Class',
    title: '班级管理',
    description: '维护正式教学班、老师、教室和班级容量。',
  },
  schedule: {
    eyebrow: 'Schedule',
    title: '排课日历',
    description: '查看课次、老师教室占用和签到入口。',
  },
  lessons: {
    eyebrow: 'Lesson',
    title: '课时账户',
    description: '查看课时余额与课时流水，确保消课可追溯。',
  },
  orders: {
    eyebrow: 'Finance',
    title: '订单与收款',
    description: '手动登记收款、购买课时并生成课时入账。',
  },
  resources: {
    eyebrow: 'Resource',
    title: '老师与教室',
    description: '维护老师、教室和教学资源基础数据。',
  },
  marketing: {
    eyebrow: 'Marketing',
    title: '营销获客',
    description: '管理渠道、活动二维码与扫码报名的转化漏斗。',
  },
  settings: {
    eyebrow: 'Settings',
    title: '机构设置',
    description: '机构、校区、成员和品牌配置的入口。',
  },
};
