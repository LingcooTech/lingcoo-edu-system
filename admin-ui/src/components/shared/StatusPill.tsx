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
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none',
        toneStyles[tone],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotStyles[tone])} />
      {label}
    </span>
  );
}

export function statusToTone(status: string): Tone {
  if (['active', 'paid', 'published', 'completed', 'open', 'present'].includes(status)) return 'ok';
  if (['new', 'trial_booked', 'follow_up', 'scheduled', 'pending', 'recruiting'].includes(status))
    return 'warn';
  if (['invalid', 'cancelled', 'archived', 'absent', 'refunded'].includes(status)) return 'danger';
  if (['contacted', 'trial_attended'].includes(status)) return 'info';
  return 'neutral';
}
