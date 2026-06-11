import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AccountPage } from '@/pages/AccountPage';
import { AboutPage } from '@/pages/AboutPage';
import { CampaignLandingPage } from '@/pages/CampaignLandingPage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { CheckInPage } from '@/pages/CheckInPage';
import { CourseDetailPage } from '@/pages/CourseDetailPage';
import { CourseListPage } from '@/pages/CourseListPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { HomePage } from '@/pages/HomePage';
import { RegisterPage } from '@/pages/RegisterPage';
import { RegisterSuccessPage } from '@/pages/RegisterSuccessPage';
import { StoriesPage } from '@/pages/StudentStoriesPage';
import { StoryDetailPage } from '@/pages/StoryDetailPage';
import { TeacherDetailPage } from '@/pages/TeacherDetailPage';
import { TeachersPage } from '@/pages/TeachersPage';
import { TrialDetailPage } from '@/pages/TrialDetailPage';
import { TrialListPage } from '@/pages/TrialListPage';
import { AuthModal } from '@/components/AuthModal';
import { SessionProvider, useSession } from '@/features/session';
import { captureAttribution } from '@/lib/attribution';

// Login/registration is now a modal. `/login` stays as a deep-link entry point
// that opens the modal over the home page.
function LoginRoute() {
  const { openAuth } = useSession();
  useEffect(() => {
    openAuth('login');
  }, [openAuth]);
  return <Navigate to="/" replace />;
}

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

  return null;
}

export function App() {
  // Persist QR/UTM attribution on first load so it survives navigation through
  // the funnel (course list → detail → register).
  useEffect(() => {
    captureAttribution();
  }, []);

  return (
    <BrowserRouter>
      <SessionProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/courses" element={<CourseListPage />} />
          <Route path="/courses/:slug" element={<CourseDetailPage />} />
          <Route path="/trials" element={<TrialListPage />} />
          <Route path="/trials/:trialId" element={<TrialDetailPage />} />
          <Route path="/campaigns/:campaignCode" element={<CampaignLandingPage />} />
          <Route path="/check-in/:sessionId" element={<CheckInPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/register/success" element={<RegisterSuccessPage />} />
          <Route path="/teachers" element={<TeachersPage />} />
          <Route path="/teachers/:teacherId" element={<TeacherDetailPage />} />
          <Route path="/stories" element={<StoriesPage />} />
          <Route path="/stories/:slug" element={<StoryDetailPage />} />
          <Route path="/students" element={<Navigate to="/stories" replace />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/teacher" element={<AccountPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
        </Routes>
        <AuthModal />
      </SessionProvider>
    </BrowserRouter>
  );
}
