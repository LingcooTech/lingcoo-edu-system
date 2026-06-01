import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  DoorOpen,
  GraduationCap,
  Home,
  LayoutDashboard,
  Megaphone,
  PieChart,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

export const adminSections = [
  {
    key: 'overview',
    label: '业务概览',
    path: '/overview/dashboard',
    icon: LayoutDashboard,
    items: [
      { key: 'dashboard', label: '经营看板', path: '/overview/dashboard', icon: LayoutDashboard },
      { key: 'reports', label: '数据报表', path: '/overview/reports', icon: PieChart },
      { key: 'todos', label: '待办事项', path: '/overview/todos', icon: CheckSquare },
    ],
  },
  {
    key: 'institution',
    label: '机构主页',
    path: '/institution',
    icon: Home,
    items: [],
  },
  {
    key: 'resources',
    label: '教学资源',
    path: '/resources/venues',
    icon: BookOpen,
    items: [
      { key: 'venues', label: '场地资源', path: '/resources/venues', icon: Building2 },
      { key: 'teachers', label: '教师资源', path: '/resources/teachers', icon: GraduationCap },
      { key: 'courseResources', label: '课程资源', path: '/resources/courses', icon: BookOpen },
    ],
  },
  {
    key: 'admissions',
    label: '招生转化',
    path: '/admissions/marketing',
    icon: Megaphone,
    items: [
      { key: 'marketing', label: '营销活动', path: '/admissions/marketing', icon: Megaphone },
      { key: 'leads', label: '线索跟进', path: '/admissions/leads', icon: Users },
      { key: 'trials', label: '试听转化', path: '/admissions/trials', icon: CalendarCheck },
    ],
  },
  {
    key: 'academic',
    label: '教务管理',
    path: '/academic/students',
    icon: CalendarDays,
    items: [
      { key: 'students', label: '学员档案', path: '/academic/students', icon: GraduationCap },
      { key: 'classes', label: '班级排课', path: '/academic/classes', icon: CalendarDays },
      { key: 'schedule', label: '排课总览', path: '/academic/schedule', icon: CalendarDays },
      { key: 'attendance', label: '签到消课', path: '/academic/attendance', icon: ClipboardCheck },
    ],
  },
  {
    key: 'operations',
    label: '运营管理',
    path: '/operations/orders',
    icon: BarChart3,
    items: [
      { key: 'orders', label: '订单收款', path: '/operations/orders', icon: ReceiptText },
      { key: 'lessons', label: '课时账户', path: '/operations/lessons', icon: BarChart3 },
      { key: 'accounts', label: '用户账号', path: '/operations/accounts', icon: ShieldCheck },
    ],
  },
  {
    key: 'system',
    label: '系统设置',
    path: '/system/brand',
    icon: Settings,
    items: [
      { key: 'brandSettings', label: '品牌设置', path: '/system/brand', icon: Settings },
      { key: 'integrations', label: '接口配置', path: '/system/integrations', icon: DoorOpen },
    ],
  },
] as const;

export const pageMeta: Record<string, { title: string; description: string; eyebrow: string }> = {
  dashboard: {
    eyebrow: 'Overview',
    title: '经营看板',
    description: '查看招生、试听、收入、课时和今日课程。',
  },
  reports: {
    eyebrow: 'Reports',
    title: '数据报表',
    description: '招生漏斗、收入与课消报表，按渠道 / 活动复盘 ROI。',
  },
  todos: {
    eyebrow: 'Todo',
    title: '待办事项',
    description: '集中处理待联系线索、待跟进事项和今日试听课。',
  },
  institutionHome: {
    eyebrow: 'Institution',
    title: '机构主页',
    description: '维护对外展示的机构主体、介绍内容、亮点承诺和品牌基础信息。',
  },
  marketing: {
    eyebrow: 'Admissions',
    title: '营销活动',
    description: '管理渠道、活动和活动二维码，持续获取可追踪的线索。',
  },
  leads: {
    eyebrow: 'Admissions',
    title: '线索跟进',
    description: '跟进来自渠道和活动的线索，记录每个阶段的沟通与转化反馈。',
  },
  trials: {
    eyebrow: 'Admissions',
    title: '试听转化',
    description: '管理试听课、试听报名、签到核销与转化效果。',
  },
  courses: {
    eyebrow: 'Resource',
    title: '课程资源',
    description: '维护课程产品、适龄、简介和公开端展示状态。',
  },
  packages: {
    eyebrow: 'Resource',
    title: '课时包',
    description: '维护对外售卖的课时包：课时数、价格与关联课程。',
  },
  students: {
    eyebrow: 'Academic',
    title: '学员档案',
    description: '管理孩子档案、家长信息和课时余额。',
  },
  guardians: {
    eyebrow: 'Operations',
    title: '家长用户',
    description: '维护家长联系人档案、名下孩子与家长账号。',
  },
  classes: {
    eyebrow: 'Academic',
    title: '班级排课',
    description: '维护正式教学班、老师、教室和班级容量。',
  },
  schedule: {
    eyebrow: 'Academic',
    title: '排课总览',
    description: '查看课次、老师教室占用和签到入口。',
  },
  attendance: {
    eyebrow: 'Academic',
    title: '签到消课总览',
    description: '后台总览老师/家长签到结果，并支持管理员手动补签、核销和课时流水校正。',
  },
  lessons: {
    eyebrow: 'Operations',
    title: '课时账户',
    description: '查看课时余额与课时流水，确保消课可追溯。',
  },
  teachers: {
    eyebrow: 'Resource',
    title: '教师资源',
    description: '维护授课老师档案，用于排课与考勤。',
  },
  classrooms: {
    eyebrow: 'Resource',
    title: '教室资源',
    description: '维护各校区教室与容量，用于排课占用与冲突检测。',
  },
  campuses: {
    eyebrow: 'Resource',
    title: '场地资源',
    description: '维护校区、地址和教学场地基础信息。',
  },
  orders: {
    eyebrow: 'Operations',
    title: '订单收款',
    description: '手动登记收款、购买课时并生成课时入账。',
  },
  settings: {
    eyebrow: 'System',
    title: '系统设置',
    description: '机构品牌、支付、SMTP、短信验证码、七牛云等系统配置入口。',
  },
  accounts: {
    eyebrow: 'Operations',
    title: '用户账号',
    description: '管理管理员、老师和学员家长账号与角色。',
  },
};
