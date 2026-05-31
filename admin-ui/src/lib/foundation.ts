import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Contact,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Package,
  PieChart,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

// 分组 / 归类 / 顺序只在此处定义一处，Sidebar 数据驱动渲染，调整菜单只改这里。
export const adminSections = [
  {
    group: '经营',
    items: [
      { key: 'dashboard', label: '概览', path: '/', icon: LayoutDashboard },
      { key: 'reports', label: '报表', path: '/reports', icon: PieChart },
    ],
  },
  {
    group: '招生获客',
    items: [
      { key: 'leads', label: '线索', path: '/leads', icon: Users },
      { key: 'trials', label: '试听课', path: '/trials', icon: Megaphone },
      { key: 'marketing', label: '渠道活动', path: '/marketing', icon: Megaphone },
    ],
  },
  {
    group: '课程商品',
    items: [
      { key: 'courses', label: '课程', path: '/courses', icon: BookOpen },
      { key: 'packages', label: '课时包', path: '/packages', icon: Package },
    ],
  },
  {
    group: '教务',
    items: [
      { key: 'students', label: '学员', path: '/students', icon: GraduationCap },
      { key: 'guardians', label: '家长', path: '/guardians', icon: Contact },
      { key: 'classes', label: '班级', path: '/classes', icon: CalendarDays },
      { key: 'schedule', label: '排课', path: '/schedule', icon: CalendarDays },
      { key: 'attendance', label: '签到消课', path: '/attendance', icon: ClipboardCheck },
      { key: 'lessons', label: '课时账户', path: '/lessons', icon: BarChart3 },
    ],
  },
  {
    group: '教学资源',
    items: [
      { key: 'teachers', label: '老师', path: '/teachers', icon: GraduationCap },
      { key: 'classrooms', label: '教室', path: '/classrooms', icon: DoorOpen },
      { key: 'campuses', label: '校区', path: '/campuses', icon: Building2 },
    ],
  },
  {
    group: '财务与系统',
    items: [
      { key: 'orders', label: '订单收款', path: '/orders', icon: ReceiptText },
      { key: 'settings', label: '机构资料', path: '/settings', icon: Settings },
      { key: 'accounts', label: '账号与角色', path: '/accounts', icon: ShieldCheck },
    ],
  },
] as const;

export const pageMeta: Record<string, { title: string; description: string; eyebrow: string }> = {
  dashboard: {
    eyebrow: 'Dashboard',
    title: '经营概览',
    description: '查看招生、试听、收入、课时和今日课程。',
  },
  reports: {
    eyebrow: 'Reports',
    title: '经营报表',
    description: '招生漏斗、收入与课消报表，按渠道 / 活动复盘 ROI。',
  },
  leads: {
    eyebrow: 'CRM',
    title: '线索管理',
    description: '跟进扫码报名、试听预约和转化状态。',
  },
  trials: {
    eyebrow: 'Trial',
    title: '试听课',
    description: '管理试听课、报名名额与到课转化。',
  },
  marketing: {
    eyebrow: 'Marketing',
    title: '渠道活动',
    description: '管理渠道、活动二维码与扫码报名的转化漏斗。',
  },
  courses: {
    eyebrow: 'Catalog',
    title: '课程管理',
    description: '维护课程产品、适龄、简介和公开端展示状态。课程通过课时包售卖。',
  },
  packages: {
    eyebrow: 'Catalog',
    title: '课时包',
    description: '维护对外售卖的课时包：课时数、价格与关联课程。',
  },
  students: {
    eyebrow: 'People',
    title: '学员管理',
    description: '管理孩子档案、家长信息和课时余额。',
  },
  guardians: {
    eyebrow: 'People',
    title: '家长管理',
    description: '维护家长（联系人）档案、名下孩子与家长账号。',
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
  attendance: {
    eyebrow: 'Attendance',
    title: '签到消课',
    description: '按课次签到、按状态扣减课时并写入课时流水。',
  },
  lessons: {
    eyebrow: 'Lesson',
    title: '课时账户',
    description: '查看课时余额与课时流水，确保消课可追溯。',
  },
  teachers: {
    eyebrow: 'Resource',
    title: '老师管理',
    description: '维护授课老师档案，用于排课与考勤。',
  },
  classrooms: {
    eyebrow: 'Resource',
    title: '教室管理',
    description: '维护各校区教室与容量，用于排课占用与冲突检测。',
  },
  campuses: {
    eyebrow: 'Resource',
    title: '校区管理',
    description: '查看机构校区列表。新增 / 编辑校区待后端接口开放。',
  },
  orders: {
    eyebrow: 'Finance',
    title: '订单与收款',
    description: '手动登记收款、购买课时并生成课时入账。',
  },
  settings: {
    eyebrow: 'Settings',
    title: '机构资料',
    description: '机构、品牌、支付、SMTP 与七牛等系统配置入口。',
  },
  accounts: {
    eyebrow: 'Identity',
    title: '账号与角色',
    description: '管理管理员 / 老师 / 家长账号与角色（统一身份）。',
  },
};
