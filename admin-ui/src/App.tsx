import { useEffect, useState } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { fetchTenants, getToken } from '@/api/client';
import { setActiveTenant } from '@/lib/foundation';
import { Shell } from '@/components/layout/Shell';
import { ClassesPage } from '@/pages/ClassesPage';
import { CoursesPage } from '@/pages/CoursesPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LeadsPage } from '@/pages/LeadsPage';
import { LessonsPage } from '@/pages/LessonsPage';
import { LoginPage } from '@/pages/LoginPage';
import { MarketingPage } from '@/pages/MarketingPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { ResourcesPage } from '@/pages/ResourcesPage';
import { SchedulePage } from '@/pages/SchedulePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StudentsPage } from '@/pages/StudentsPage';
import { TrialsPage } from '@/pages/TrialsPage';

// Resolves the signed-in admin's active tenant before rendering any page.
// Pages read `tenantId` from foundation at render time, so the app must not
// paint a page until a real tenant id is set (otherwise calls go to
// /v1/tenants//… and 404/500).
function TenantGate() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchTenants()
      .then((tenants) => {
        if (tenants.length === 0) {
          setMessage('当前账号未关联任何机构，请联系管理员。');
          setStatus('error');
          return;
        }
        setActiveTenant(tenants[0].id, tenants[0].name);
        setStatus('ready');
      })
      .catch((err: Error) => {
        setMessage(err.message || '加载机构信息失败');
        setStatus('error');
      });
  }, []);

  if (status === 'loading') {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
        加载机构信息...
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-red-600">
        {message}
      </div>
    );
  }

  return <Shell />;
}

function ProtectedRoute() {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }

  return <TenantGate />;
}

const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      path: '/',
      element: <ProtectedRoute />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'leads', element: <LeadsPage /> },
        { path: 'trials', element: <TrialsPage /> },
        { path: 'courses', element: <CoursesPage /> },
        { path: 'students', element: <StudentsPage /> },
        { path: 'classes', element: <ClassesPage /> },
        { path: 'schedule', element: <SchedulePage /> },
        { path: 'lessons', element: <LessonsPage /> },
        { path: 'orders', element: <OrdersPage /> },
        { path: 'resources', element: <ResourcesPage /> },
        { path: 'marketing', element: <MarketingPage /> },
        { path: 'settings', element: <SettingsPage /> },
      ],
    },
  ],
  { basename: '/admin' },
);

export function App() {
  return <RouterProvider router={router} />;
}
