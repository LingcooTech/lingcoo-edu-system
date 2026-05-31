// Shown when a logged-in non-admin (parent / teacher) lands on /admin.
export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">无访问权限</h1>
      <p className="text-muted-foreground text-sm">该账号不是管理员，无法进入管理后台。</p>
      <a href="/" className="hover:bg-muted mt-2 rounded-lg border px-4 py-2 text-sm">
        返回前台首页
      </a>
    </div>
  );
}
