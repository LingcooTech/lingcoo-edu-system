import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { changeParentPassword, getParentToken } from '@/api/client';
import { Layout } from '@/components/Layout';
import { useSession } from '@/features/session';
import { sendToAccountHome } from '@/lib/auth-redirect';

// First-login forced password change (accounts provisioned with a default
// password = phone's last 6 digits land here until they set a new one).
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { refresh } = useSession();
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
      const profile = await refresh();
      if (profile) {
        sendToAccountHome(profile, navigate, true);
      } else {
        navigate('/login', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <section className="container-narrow flex min-h-[calc(100vh-280px)] items-center justify-center py-12">
        <div className="pwcard w-full max-w-md p-6">
          <h1 className="text-ink text-xl font-bold">设置新密码</h1>
          <p className="text-muted mt-1 text-sm">为了账号安全，请在首次登录时设置新密码。</p>
          <form className="mt-5 grid gap-3" onSubmit={submit}>
            <input
              className="border-line rounded-xl border px-3 py-2.5 text-sm"
              type="password"
              placeholder="当前密码（默认为手机号后 6 位）"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
            <input
              className="border-line rounded-xl border px-3 py-2.5 text-sm"
              type="password"
              placeholder="新密码（至少 8 位）"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
            />
            <button type="submit" className="pwbtn pwbtn-primary mt-1 w-full" disabled={submitting}>
              {submitting ? '处理中...' : '设置新密码'}
            </button>
            {error ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div> : null}
          </form>
        </div>
      </section>
    </Layout>
  );
}
