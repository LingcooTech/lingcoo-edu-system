import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  DoorOpen,
  FileText,
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
    label: '前台页面',
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
      { key: 'contentMarketing', label: '内容营销', path: '/admissions/content', icon: FileText },
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
      {
        key: 'businessModel',
        label: '业务开关',
        path: '/operations/business-model',
        icon: Settings,
      },
      { key: 'contracts', label: '正式课程档案', path: '/operations/contracts', icon: FileText },
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

export const pageMeta: Record<string, { title: string; eyebrow: string }> = {
  dashboard: {
    eyebrow: 'Overview',
    title: '经营看板',
  },
  reports: {
    eyebrow: 'Reports',
    title: '数据报表',
  },
  todos: {
    eyebrow: 'Todo',
    title: '待办事项',
  },
  institutionPages: {
    eyebrow: 'Institution',
    title: '前台页面',
  },
  institution: {
    eyebrow: 'Institution',
    title: '前台页面',
  },
  institutionHome: {
    eyebrow: 'Institution',
    title: '首页内容',
  },
  institutionAbout: {
    eyebrow: 'Institution',
    title: '关于我们',
  },
  marketing: {
    eyebrow: 'Admissions',
    title: '营销活动',
  },
  contentMarketing: {
    eyebrow: 'Admissions',
    title: '内容营销',
  },
  leads: {
    eyebrow: 'Admissions',
    title: '线索跟进',
  },
  trials: {
    eyebrow: 'Admissions',
    title: '试听转化',
  },
  courses: {
    eyebrow: 'Resource',
    title: '课程资源',
  },
  packages: {
    eyebrow: 'Resource',
    title: '课时包',
  },
  students: {
    eyebrow: 'Academic',
    title: '学员档案',
  },
  guardians: {
    eyebrow: 'Operations',
    title: '家长用户',
  },
  classes: {
    eyebrow: 'Academic',
    title: '班级排课',
  },
  schedule: {
    eyebrow: 'Academic',
    title: '排课总览',
  },
  attendance: {
    eyebrow: 'Academic',
    title: '签到消课总览',
  },
  lessons: {
    eyebrow: 'Operations',
    title: '课时账户',
  },
  teachers: {
    eyebrow: 'Resource',
    title: '教师资源',
  },
  institutions: {
    eyebrow: 'Resource',
    title: '合作方',
  },
  classrooms: {
    eyebrow: 'Resource',
    title: '教室资源',
  },
  campuses: {
    eyebrow: 'Resource',
    title: '场地资源',
  },
  orders: {
    eyebrow: 'Operations',
    title: '订单收款',
  },
  businessModel: {
    eyebrow: 'Operations',
    title: '业务开关',
  },
  contracts: {
    eyebrow: 'Operations',
    title: '正式课程档案',
  },
  settings: {
    eyebrow: 'System',
    title: '系统设置',
  },
  brandSettings: {
    eyebrow: 'System',
    title: '品牌设置',
  },
  integrations: {
    eyebrow: 'System',
    title: '接口配置',
  },
  accounts: {
    eyebrow: 'Operations',
    title: '用户账号',
  },
};
