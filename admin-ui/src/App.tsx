import { useEffect, useState } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

import { fetchMe, getToken, type AuthAccount } from '@/api/client';
import { Shell } from '@/components/layout/Shell';
import { AccountsPage } from '@/pages/AccountsPage';
import { AttendancePage } from '@/pages/AttendancePage';
import { CampusesPage } from '@/pages/CampusesPage';
import { ClassesPage } from '@/pages/ClassesPage';
import { ClassroomsPage } from '@/pages/ClassroomsPage';
import { CrmPage } from '@/pages/CrmPage';
import { CoursesPage } from '@/pages/CoursesPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ForbiddenPage } from '@/pages/ForbiddenPage';
import { GuardiansPage } from '@/pages/GuardiansPage';
import { LessonsPage } from '@/pages/LessonsPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { PackagesPage } from '@/pages/PackagesPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SchedulePage } from '@/pages/SchedulePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StudentsPage } from '@/pages/StudentsPage';
import { TeachersPage } from '@/pages/TeachersPage';
import { TrialsPage } from '@/pages/TrialsPage';

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
        // 经营
        { index: true, element: <DashboardPage /> },
        { path: 'reports', element: <ReportsPage /> },
        // 招生获客
        { path: 'crm', element: <CrmPage /> },
        { path: 'leads', element: <CrmPage /> },
        { path: 'trials', element: <TrialsPage /> },
        { path: 'marketing', element: <CrmPage /> },
        // 课程商品
        { path: 'courses', element: <CoursesPage /> },
        { path: 'packages', element: <PackagesPage /> },
        // 教务
        { path: 'students', element: <StudentsPage /> },
        { path: 'guardians', element: <GuardiansPage /> },
        { path: 'classes', element: <ClassesPage /> },
        { path: 'schedule', element: <SchedulePage /> },
        { path: 'attendance', element: <AttendancePage /> },
        { path: 'lessons', element: <LessonsPage /> },
        // 教学资源
        { path: 'teachers', element: <TeachersPage /> },
        { path: 'classrooms', element: <ClassroomsPage /> },
        { path: 'campuses', element: <CampusesPage /> },
        // 财务与系统
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
