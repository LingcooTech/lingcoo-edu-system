import { StatusPill } from '@/components/shared/StatusPill';

/**
 * 占位页统一外观：一段"规划中"说明 + 该页将做什么 + 由哪一后续步骤交付。
 * 信息架构(本步)只铺菜单 / 路由 / 骨架，真实功能由后续步骤填充。
 */
export function ComingSoon({
  summary,
  points,
  deliveredBy,
}: {
  summary: string;
  points: string[];
  deliveredBy: string;
}) {
  return (
    <div className="resource-card max-w-2xl p-6 sm:p-8">
      <StatusPill tone="info" label="规划中" />
      <p className="text-foreground mt-3 text-sm leading-relaxed">{summary}</p>
      <ul className="text-muted-foreground mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-5 border-t pt-4 text-xs">{deliveredBy}</p>
    </div>
  );
}
