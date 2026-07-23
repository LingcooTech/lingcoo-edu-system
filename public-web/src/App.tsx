import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AboutPage } from '@/pages/AboutPage';
import { CampaignLandingPage } from '@/pages/CampaignLandingPage';
import { CheckInPage } from '@/pages/CheckInPage';
import { CourseDetailPage } from '@/pages/CourseDetailPage';
import { CourseListPage } from '@/pages/CourseListPage';
import { HomePage } from '@/pages/HomePage';
import { InstitutionDetailPage } from '@/pages/InstitutionDetailPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { RegisterSuccessPage } from '@/pages/RegisterSuccessPage';
import { StoriesPage } from '@/pages/StudentStoriesPage';
import { StoryDetailPage } from '@/pages/StoryDetailPage';
import { TeacherDetailPage } from '@/pages/TeacherDetailPage';
import { TeachersPage } from '@/pages/TeachersPage';
import { TrialDetailPage } from '@/pages/TrialDetailPage';
import { TrialListPage } from '@/pages/TrialListPage';
import { captureAttribution } from '@/lib/attribution';

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
        <Route path="/institutions/:institutionId" element={<InstitutionDetailPage />} />
        <Route path="/stories" element={<StoriesPage />} />
        <Route path="/stories/:slug" element={<StoryDetailPage />} />
        <Route path="/students" element={<Navigate to="/stories" replace />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/" replace />} />
        <Route path="/account" element={<Navigate to="/" replace />} />
        <Route path="/teacher" element={<Navigate to="/" replace />} />
        <Route path="/change-password" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
