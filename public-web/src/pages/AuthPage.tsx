import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

import { parentLogin, parentRegister } from '@/api/client';

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/account';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'login') {
        const { account } = await parentLogin(identifier.trim(), password);
        if (account.mustChangePassword) {
          navigate('/change-password');
        } else if (account.role === 'admin') {
          // Admins continue into the back office — /admin is a separate app
          // under the same origin sharing the login cookie.
          window.location.href = '/admin';
        } else if (account.role === 'teacher') {
          navigate(redirectTo === '/account' ? '/teacher' : redirectTo);
        } else {
          navigate(redirectTo);
        }
      } else {
        await parentRegister({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          phone: phone.trim() || undefined,
        });
        navigate(redirectTo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Link to="/" className="mb-6 text-sm text-blue-600">
        ← 返回首页
      </Link>
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex gap-2 rounded-xl bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            className={`flex-1 rounded-lg py-2 ${mode === 'login' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            onClick={() => setMode('login')}
          >
            登录
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-2 ${mode === 'register' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            onClick={() => setMode('register')}
          >
            注册
          </button>
        </div>

        <form className="mt-5 grid gap-3" onSubmit={submit}>
          {mode === 'register' && (
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="家长姓名"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          )}
          {mode === 'login' ? (
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="邮箱或手机号"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          ) : (
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          )}
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            type="password"
            placeholder={mode === 'register' ? '密码（至少 8 位）' : '密码'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={mode === 'register' ? 8 : 1}
          />
          {mode === 'register' && (
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="手机号（可选）"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
          <button
            className="mt-1 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
          {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        </form>

        {mode === 'login' && (
          <Link to="/forgot-password" className="mt-4 block text-center text-xs text-slate-500">
            忘记密码？
          </Link>
        )}
      </div>
    </main>
  );
}
