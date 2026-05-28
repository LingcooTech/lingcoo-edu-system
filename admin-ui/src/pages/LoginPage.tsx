import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { login } from '@/api/client';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@fd-edu.local');
  const [password, setPassword] = useState('admin123456');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    }
  }

  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center px-4">
      <form className="resource-card w-full max-w-sm p-6" onSubmit={submit}>
        <div className="eyebrow">fd-edu-stack</div>
        <h1 className="mt-2 text-2xl font-semibold">管理员登录</h1>
        <p className="text-muted-foreground mt-1 text-sm">默认演示账号已填入，可直接登录。</p>
        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="text-sm font-medium">邮箱</span>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">密码</span>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </div>
        {error && <div className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <button className="bg-primary text-primary-foreground mt-5 w-full rounded-lg px-3 py-2 text-sm font-medium">
          登录
        </button>
      </form>
    </div>
  );
}
