import type { NavigateFunction } from 'react-router-dom';

import type { AuthAccount } from '@/api/client';

export function accountHomePath(account: AuthAccount): string {
  if (account.role === 'admin') return '/admin';
  if (account.role === 'teacher') return '/teacher';
  return '/account';
}

export function sendToAccountHome(account: AuthAccount, navigate: NavigateFunction, replace = false) {
  const path = account.mustChangePassword ? '/change-password' : accountHomePath(account);
  if (path === '/admin') {
    window.location.href = path;
    return;
  }
  navigate(path, { replace });
}
