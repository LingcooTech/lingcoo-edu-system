import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';

import { getToken } from '@/api/client';
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

function ProtectedRoute() {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }

  return <Shell />;
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
