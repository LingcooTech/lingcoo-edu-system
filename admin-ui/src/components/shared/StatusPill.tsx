import { cn } from '@/lib/utils';

type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

const toneStyles: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
  neutral: 'bg-muted text-muted-foreground',
};

const dotStyles: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-muted-foreground/50',
};

const statusLabels: Record<string, string> = {
  active: '启用',
  suspended: '停用',
  inactive: '停用',
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
  open: '开放中',
  closed: '已关闭',
  cancelled: '已取消',
  scheduled: '已排课',
  completed: '已完成',
  recruiting: '招生中',
  paused: '已暂停',
  pending: '待处理',
  paid: '已支付',
  refunded: '已退款',
  new: '待联系',
  contacted: '初步沟通',
  trial_booked: '预约试听',
  trial_attended: '试听结束',
  follow_up: '订单跟进',
  course_delivery: '课程交付',
  invalid: '无效',
  present: '到课',
  leave: '请假',
  absent: '缺勤',
  makeup: '补课',
  trial: '试听',
};

export function statusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

export function StatusPill({
  tone,
  label,
  className,
}: {
  tone: Tone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-medium',
        toneStyles[tone],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotStyles[tone])} />
      {statusLabel(label)}
    </span>
  );
}

export function statusToTone(status: string): Tone {
  if (
    ['active', 'paid', 'course_delivery', 'published', 'completed', 'open', 'present'].includes(
      status,
    )
  )
    return 'ok';
  if (['new', 'trial_booked', 'follow_up', 'scheduled', 'pending', 'recruiting'].includes(status))
    return 'warn';
  if (['invalid', 'cancelled', 'archived', 'absent', 'refunded'].includes(status)) return 'danger';
  if (['contacted', 'trial_attended'].includes(status)) return 'info';
  return 'neutral';
}
