import { clearToken } from '@/api/client';

export function Topbar() {
  return (
    <header className="bg-background/95 sticky top-0 z-10 flex h-14 items-center justify-between border-b px-4 backdrop-blur">
      <div>
        <div className="text-sm font-medium">美智优品成长教室</div>
        <div className="text-muted-foreground text-xs">tenant_demo / 一里城校区</div>
      </div>
      <button
        className="hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
        onClick={() => {
          clearToken();
          window.location.href = '/login';
        }}
      >
        退出
      </button>
    </header>
  );
}
