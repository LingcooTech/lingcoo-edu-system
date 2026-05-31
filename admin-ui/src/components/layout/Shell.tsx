import { Outlet } from 'react-router-dom';

import type { AuthAccount } from '@/api/client';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Shell({ account }: { account: AuthAccount }) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <div className="flex min-h-screen min-w-0 flex-col">
        <Topbar account={account} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
