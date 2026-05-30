import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { publicApi } from '@/api/client';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await publicApi('/public/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setMessage('若该邮箱已注册，验证码已发送。请输入验证码与新密码。');
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await publicApi('/public/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), code: code.trim(), password }),
      });
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Link to="/login" className="mb-6 text-sm text-blue-600">
        ← 返回登录
      </Link>
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">重置密码</h1>
        {step === 'request' ? (
          <form className="mt-4 grid gap-3" onSubmit={requestCode}>
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              type="email"
              placeholder="注册邮箱"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
              发送验证码
            </button>
          </form>
        ) : (
          <form className="mt-4 grid gap-3" onSubmit={resetPassword}>
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              placeholder="验证码"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
            <input
              className="rounded-xl border px-3 py-2 text-sm"
              type="password"
              placeholder="新密码（至少 8 位）"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
            <button className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
              重置密码
            </button>
          </form>
        )}
        {message && <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{message}</div>}
        {error && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      </div>
    </main>
  );
}
