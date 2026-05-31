import { logout, type AuthAccount } from '@/api/client';

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  teacher: '老师',
  parent: '家长',
};

export function Topbar({ account }: { account: AuthAccount }) {
  return (
    <header className="bg-background/95 sticky top-0 z-10 flex h-14 items-center justify-between border-b px-4 backdrop-blur">
      <div>
        <div className="text-sm font-medium">机构管理后台</div>
        <div className="text-muted-foreground text-xs">教务运营控制台</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-medium">{account.displayName}</div>
          <div className="text-muted-foreground text-xs">
            {ROLE_LABEL[account.role] ?? account.role}
          </div>
        </div>
        <button
          className="hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
          onClick={async () => {
            await logout();
            // Back to the public front door (shared login entry).
            window.location.href = '/login';
          }}
        >
          退出
        </button>
      </div>
    </header>
  );
}
