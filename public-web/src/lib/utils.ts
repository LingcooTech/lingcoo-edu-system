export function money(amount: number): string {
  const yuan = amount / 100;
  return Number.isInteger(yuan) ? `¥${yuan.toFixed(0)}` : `¥${yuan.toFixed(2)}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
