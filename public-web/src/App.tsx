import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AccountPage } from '@/pages/AccountPage';
import { AboutPage } from '@/pages/AboutPage';
import { AuthPage } from '@/pages/AuthPage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { CourseDetailPage } from '@/pages/CourseDetailPage';
import { CourseListPage } from '@/pages/CourseListPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { HomePage } from '@/pages/HomePage';
import { RegisterPage } from '@/pages/RegisterPage';
import { RegisterSuccessPage } from '@/pages/RegisterSuccessPage';
import { TeacherPage } from '@/pages/TeacherPage';
import { TrialListPage } from '@/pages/TrialListPage';
import { captureAttribution } from '@/lib/attribution';

export function App() {
  // Persist QR/UTM attribution on first load so it survives navigation through
  // the funnel (course list → detail → register).
  useEffect(() => {
    captureAttribution();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/courses" element={<CourseListPage />} />
        <Route path="/courses/:slug" element={<CourseDetailPage />} />
        <Route path="/trials" element={<TrialListPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/success" element={<RegisterSuccessPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/teacher" element={<TeacherPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/checkout/:packageId" element={<CheckoutPage />} />
      </Routes>
    </BrowserRouter>
  );
}
