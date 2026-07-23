import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { changeAdminPassword } from '@/api/client';

export function AdminChangePasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setError('新密码至少 8 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await changeAdminPassword(currentPassword, newPassword);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '密码修改失败');
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
        <h1 className="text-foreground text-2xl font-bold">设置新密码</h1>
        <p className="text-muted-foreground mt-2 text-sm">首次登录需要先修改初始密码。</p>
        <label className="mt-6 block text-sm font-semibold">
          当前密码
          <input
            className="form-input mt-2"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          新密码
          <input
            className="form-input mt-2"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          确认新密码
          <input
            className="form-input mt-2"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
        {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}
        <button className="btn btn-primary mt-6 w-full" type="submit" disabled={busy}>
          {busy ? '保存中...' : '保存并进入后台'}
        </button>
      </form>
    </main>
  );
}
