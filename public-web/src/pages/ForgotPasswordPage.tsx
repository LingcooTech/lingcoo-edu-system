import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { publicApi } from '@/api/client';
import { Layout } from '@/components/Layout';
import { useSeo } from '@/lib/seo';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useSeo({
    title: '重置密码',
  });

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await publicApi('/auth/forgot-password', {
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
      await publicApi('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), code: code.trim(), password }),
      });
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败');
    }
  }

  return (
    <Layout>
      <section className="container-narrow flex min-h-[calc(100vh-280px)] items-center justify-center py-12">
        <div className="pwcard w-full max-w-md p-6">
          <Link to="/login" className="text-brand mb-5 inline-flex text-sm font-medium">
            返回登录
          </Link>
          <h1 className="text-ink text-xl font-bold">重置密码</h1>
          {step === 'request' ? (
            <form className="mt-5 grid gap-3" onSubmit={requestCode}>
              <input
                className="border-line rounded-xl border px-3 py-2.5 text-sm"
                type="email"
                placeholder="注册邮箱"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <button className="pwbtn pwbtn-primary w-full">发送验证码</button>
            </form>
          ) : (
            <form className="mt-5 grid gap-3" onSubmit={resetPassword}>
              <input
                className="border-line rounded-xl border px-3 py-2.5 text-sm"
                placeholder="验证码"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
              <input
                className="border-line rounded-xl border px-3 py-2.5 text-sm"
                type="password"
                placeholder="新密码（至少 8 位）"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
              <button className="pwbtn pwbtn-primary w-full">重置密码</button>
            </form>
          )}
          {message ? <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{message}</div> : null}
          {error ? <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div> : null}
        </div>
      </section>
    </Layout>
  );
}
