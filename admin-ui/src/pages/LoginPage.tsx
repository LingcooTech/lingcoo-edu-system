import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { adminLogin } from '@/api/client';

export function LoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!identifier.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const account = await adminLogin(identifier.trim(), password);
      navigate(account.mustChangePassword ? '/change-password' : '/', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center px-5 py-12">
      <form
        onSubmit={submit}
        className="bg-card border-border w-full max-w-sm rounded-2xl border p-7 shadow-sm"
      >
        <div className="text-primary text-xs font-bold tracking-[0.18em]">FD EDU</div>
        <h1 className="text-foreground mt-2 text-2xl font-bold">管理后台登录</h1>
        <p className="text-muted-foreground mt-2 text-sm">仅管理员身份可以进入。</p>
        <label className="mt-6 block text-sm font-semibold">
          邮箱或手机号
          <input
            className="form-input mt-2"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          密码
          <input
            className="form-input mt-2"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
        <button className="btn btn-primary mt-6 w-full" type="submit" disabled={busy}>
          {busy ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  );
}
