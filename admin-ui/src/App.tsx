import { useEffect, useState } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { fetchMe, getToken, type AuthAccount } from '@/api/client';
import { Shell } from '@/components/layout/Shell';
import { AccountsPage } from '@/pages/AccountsPage';
import { AttendancePage } from '@/pages/AttendancePage';
import { CampusesPage } from '@/pages/CampusesPage';
import { ClassesPage } from '@/pages/ClassesPage';
import { ClassroomsPage } from '@/pages/ClassroomsPage';
import { CourseResourcesPage } from '@/pages/CourseResourcesPage';
import { CoursesPage } from '@/pages/CoursesPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { GuardiansPage } from '@/pages/GuardiansPage';
import { InstitutionAboutPage } from '@/pages/InstitutionAboutPage';
import { InstitutionHomePage } from '@/pages/InstitutionHomePage';
import { LeadsPage } from '@/pages/LeadsPage';
import { LessonsPage } from '@/pages/LessonsPage';
import { MarketingPage } from '@/pages/MarketingPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { PackagesPage } from '@/pages/PackagesPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SchedulePage } from '@/pages/SchedulePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StudentsPage } from '@/pages/StudentsPage';
import { TeacherResourcesPage } from '@/pages/TeacherResourcesPage';
import { TeachersPage } from '@/pages/TeachersPage';
import { TodoPage } from '@/pages/TodoPage';
import { TrialsPage } from '@/pages/TrialsPage';
import { VenueResourcesPage } from '@/pages/VenueResourcesPage';

type GateState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'ok'; account: AuthAccount };

// /admin has no login page of its own. The gate verifies the shared session
// (cookie/token set by the public front door) and only admits role=admin;
// no token bounces to the public login, a non-admin sees a Forbidden page.
function ProtectedRoute() {
  const [state, setState] = useState<GateState>({ status: 'loading' });

  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/login?redirect=/admin';
      return;
    }
    fetchMe()
      .then((account) => {
        if (account && account.role === 'admin') {
          setState({ status: 'ok', account });
        } else {
          setState({ status: 'forbidden' });
        }
      })
      .catch(() => {
        window.location.href = '/login?redirect=/admin';
      });
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
        加载中...
      </div>
    );
  }
  if (state.status === 'forbidden') {
    return <ForbiddenPage />;
  }
  return <Shell account={state.account} />;
}

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <ProtectedRoute />,
      children: [
        // 业务概览
        { index: true, element: <DashboardPage /> },
        { path: 'overview/dashboard', element: <DashboardPage /> },
        { path: 'reports', element: <ReportsPage /> },
        { path: 'overview/reports', element: <ReportsPage /> },
        { path: 'overview/todos', element: <TodoPage /> },
        // 机构主页
        { path: 'institution', element: <InstitutionHomePage /> },
        { path: 'institution/about', element: <InstitutionAboutPage /> },
        // 教学资源
        { path: 'resources/venues', element: <VenueResourcesPage /> },
        { path: 'resources/classrooms', element: <ClassroomsPage /> },
        { path: 'resources/teachers', element: <TeacherResourcesPage /> },
        { path: 'resources/courses', element: <CourseResourcesPage /> },
        { path: 'resources/packages', element: <PackagesPage /> },
        // 招生转化
        { path: 'admissions/marketing', element: <MarketingPage /> },
        { path: 'admissions/leads', element: <LeadsPage /> },
        { path: 'admissions/trials', element: <TrialsPage /> },
        // 教务管理
        { path: 'academic/students', element: <StudentsPage /> },
        { path: 'academic/classes', element: <ClassesPage /> },
        { path: 'academic/schedule', element: <SchedulePage /> },
        { path: 'academic/attendance', element: <AttendancePage /> },
        // 运营管理
        { path: 'operations/orders', element: <OrdersPage /> },
        { path: 'operations/lessons', element: <LessonsPage /> },
        { path: 'operations/accounts', element: <AccountsPage /> },
        { path: 'operations/guardians', element: <GuardiansPage /> },
        // 系统设置
        { path: 'system/brand', element: <SettingsPage /> },
        { path: 'system/integrations', element: <SettingsPage /> },
        // Legacy routes
        { path: 'leads', element: <LeadsPage /> },
        { path: 'trials', element: <TrialsPage /> },
        { path: 'marketing', element: <MarketingPage /> },
        { path: 'courses', element: <CoursesPage /> },
        { path: 'packages', element: <PackagesPage /> },
        { path: 'students', element: <StudentsPage /> },
        { path: 'guardians', element: <GuardiansPage /> },
        { path: 'classes', element: <ClassesPage /> },
        { path: 'schedule', element: <SchedulePage /> },
        { path: 'attendance', element: <AttendancePage /> },
        { path: 'lessons', element: <LessonsPage /> },
        { path: 'teachers', element: <TeachersPage /> },
        { path: 'classrooms', element: <ClassroomsPage /> },
        { path: 'campuses', element: <CampusesPage /> },
        { path: 'orders', element: <OrdersPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'accounts', element: <AccountsPage /> },
      ],
    },
  ],
  { basename: '/admin' },
);

export function App() {
  return <RouterProvider router={router} />;
}
