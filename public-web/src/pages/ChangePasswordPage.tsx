import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { changeParentPassword, fetchParentProfile, getParentToken } from '@/api/client';

// First-login forced password change (accounts provisioned with a default
// password = phone's last 6 digits land here until they set a new one).
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getParentToken()) {
      navigate('/login');
    }
  }, [navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await changeParentPassword(currentPassword, newPassword);
      const profile = await fetchParentProfile();
      if (profile?.role === 'admin') {
        window.location.href = '/admin';
      } else if (profile?.role === 'teacher') {
        navigate('/teacher');
      } else {
        navigate('/account');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">设置新密码</h1>
        <p className="mt-1 text-sm text-slate-500">
          为了账号安全，请在首次登录时设置新密码。
        </p>
        <form className="mt-4 grid gap-3" onSubmit={submit}>
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            type="password"
            placeholder="当前密码（默认为手机号后 6 位）"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            type="password"
            placeholder="新密码（至少 8 位）"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={8}
          />
          <button
            className="mt-1 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? '处理中...' : '设置新密码'}
          </button>
          {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        </form>
      </div>
    </main>
  );
}
