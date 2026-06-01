export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function getInitials(value?: string | null): string {
  const normalized = value?.trim();
  if (!normalized) return 'FD';
  return normalized
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function money(amount: number): string {
  return `¥${(amount / 100).toFixed(2)}`;
}

export function formatDateTime(value?: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
