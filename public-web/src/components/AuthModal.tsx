import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Modal } from './Modal';
import { useSession } from '@/features/session';
import type { AuthAccount } from '@/api/client';
import { sendToAccountHome } from '@/lib/auth-redirect';

/**
 * Login / register as a modal (replaces the standalone /login page). Lives at
 * the app root and is driven by the session store's `authOpen` / `authMode`.
 */
export function AuthModal() {
  const navigate = useNavigate();
  const { authOpen, authMode, closeAuth, login, register } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>(authMode);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Adopt the mode requested by whoever opened the modal, and clear transient
  // state each time it opens.
  useEffect(() => {
    if (authOpen) {
      setMode(authMode);
      setError('');
      setPassword('');
    }
  }, [authOpen, authMode]);

  function afterAuth(account: AuthAccount) {
    setPassword('');
    sendToAccountHome(account, navigate);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'login') {
        afterAuth(await login(identifier.trim(), password));
      } else {
        afterAuth(
          await register({
            email: email.trim(),
            password,
            displayName: displayName.trim(),
            phone: phone.trim() || undefined,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  }

  function goForgotPassword() {
    closeAuth();
    navigate('/forgot-password');
  }

  return (
    <Modal open={authOpen} onClose={closeAuth} title={mode === 'login' ? '登录' : '注册'}>
      <div className="bg-paper flex gap-2 rounded-full p-1 text-sm font-medium">
        <button
          type="button"
          className={`flex-1 rounded-full py-2 ${mode === 'login' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
          onClick={() => setMode('login')}
        >
          登录
        </button>
        <button
          type="button"
          className={`flex-1 rounded-full py-2 ${mode === 'register' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
          onClick={() => setMode('register')}
        >
          注册
        </button>
      </div>

      <form className="mt-5 grid gap-3" onSubmit={submit}>
        {mode === 'register' && (
          <input
            className="border-line rounded-xl border px-3 py-2.5 text-sm"
            placeholder="家长姓名"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        )}
        {mode === 'login' ? (
          <input
            className="border-line rounded-xl border px-3 py-2.5 text-sm"
            placeholder="邮箱或手机号"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        ) : (
          <input
            className="border-line rounded-xl border px-3 py-2.5 text-sm"
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        )}
        <input
          className="border-line rounded-xl border px-3 py-2.5 text-sm"
          type="password"
          placeholder={mode === 'register' ? '密码（至少 8 位）' : '密码'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={mode === 'register' ? 8 : 1}
        />
        {mode === 'register' && (
          <input
            className="border-line rounded-xl border px-3 py-2.5 text-sm"
            placeholder="手机号（可选）"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        )}
        <button type="submit" className="pwbtn pwbtn-primary mt-1 w-full" disabled={submitting}>
          {submitting ? '处理中...' : mode === 'login' ? '登录' : '注册'}
        </button>
        {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}
      </form>

      {mode === 'login' && (
        <button
          type="button"
          onClick={goForgotPassword}
          className="text-muted mt-4 block w-full text-center text-xs"
        >
          忘记密码？
        </button>
      )}
    </Modal>
  );
}
