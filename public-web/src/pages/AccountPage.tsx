import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, Receipt, Shield, Wallet } from 'lucide-react';

import {
  fetchChildren,
  fetchParentLessonAccounts,
  fetchParentOrders,
  fetchParentProfile,
  getParentToken,
  parentLogout,
  publicApi,
  type AuthAccount,
  type ChildStudent,
  type ParentLessonAccount,
  type ParentOrder,
} from '@/api/client';
import { money } from '@/lib/utils';

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  refunded: '已退款',
  cancelled: '已取消',
};

export function AccountPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AuthAccount | null>(null);
  const [children, setChildren] = useState<ChildStudent[]>([]);
  const [accounts, setAccounts] = useState<ParentLessonAccount[]>([]);
  const [orders, setOrders] = useState<ParentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');

  useEffect(() => {
    if (!getParentToken()) {
      navigate('/login');
      return;
    }
    Promise.all([
      fetchParentProfile(),
      fetchChildren().catch(() => []),
      fetchParentLessonAccounts().catch(() => []),
      fetchParentOrders().catch(() => []),
    ])
      .then(([profileResult, childrenResult, accountsResult, ordersResult]) => {
        if (!profileResult) {
          navigate('/login');
          return;
        }
        if (profileResult.mustChangePassword) {
          navigate('/change-password');
          return;
        }
        setProfile(profileResult);
        setChildren(childrenResult);
        setAccounts(accountsResult);
        setOrders(ordersResult);
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  async function logout() {
    await parentLogout();
    navigate('/');
  }

  async function verifyEmail() {
    setVerifyMessage('');
    try {
      await publicApi('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      const updated = await fetchParentProfile();
      setProfile(updated);
      setVerifyMessage('邮箱验证成功');
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : '验证失败');
    }
  }

  if (loading) {
    return <main className="px-5 py-10 text-center text-sm text-slate-500">加载中...</main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">家长中心</h1>
          <p className="mt-1 text-sm text-slate-500">
            {profile?.displayName} · {profile?.email ?? profile?.phone}
          </p>
        </div>
        <button
          onClick={logout}
          className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm text-slate-600"
        >
          <LogOut className="h-4 w-4" />
          退出
        </button>
      </div>

      {profile?.role === 'admin' && (
        <a
          href="/admin"
          className="mt-5 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-700"
        >
          <Shield className="h-4 w-4" />
          进入管理后台
        </a>
      )}

      {profile && profile.email && !profile.emailVerified && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-800">邮箱待验证</div>
          <p className="mt-1 text-xs text-amber-700">
            注册时已向 {profile.email} 发送验证码（若未配置邮件服务，请联系机构获取）。
          </p>
          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-xl border px-3 py-2 text-sm"
              placeholder="6 位验证码"
              value={verifyCode}
              onChange={(event) => setVerifyCode(event.target.value)}
            />
            <button
              onClick={verifyEmail}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
            >
              验证
            </button>
          </div>
          {verifyMessage && <div className="mt-2 text-xs text-amber-700">{verifyMessage}</div>}
        </div>
      )}

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <BookOpen className="h-4 w-4 text-blue-600" />
          我的孩子
        </div>
        {children.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">
            暂未关联孩子。请联系机构，将您的账号与学员档案关联。
          </div>
        ) : (
          <div className="grid gap-2">
            {children.map((child) => (
              <div key={child.id} className="rounded-2xl border bg-white p-4">
                <div className="text-sm font-semibold">{child.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {child.grade}
                  {child.school ? ` · ${child.school}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Wallet className="h-4 w-4 text-blue-600" />
          课时余额
        </div>
        {accounts.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">暂无课时账户。</div>
        ) : (
          <div className="grid gap-2">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-2xl border bg-white p-4"
              >
                <div className="text-sm font-semibold">{account.student?.name ?? '学员'}</div>
                <div className="text-sm font-semibold text-blue-700">剩余 {account.balance} 课时</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Receipt className="h-4 w-4 text-blue-600" />
          我的订单
        </div>
        {orders.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-slate-500">暂无订单。</div>
        ) : (
          <div className="grid gap-2">
            {orders.map((order) => (
              <div key={order.id} className="rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{money(order.amount)}</div>
                  <div className="text-xs text-slate-500">
                    {ORDER_STATUS_LABEL[order.status] ?? order.status}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {order.orderNo} · {order.lessonCount} 课时
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
