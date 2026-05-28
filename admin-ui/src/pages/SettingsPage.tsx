import { PageFrame } from '@/components/layout/PageFrame';

export function SettingsPage() {
  return (
    <PageFrame section="settings">
      <div className="resource-card p-5">
        <div className="text-sm font-semibold">商业化设置预留</div>
        <p className="text-muted-foreground mt-2 text-sm">
          机构、校区、成员、角色权限、品牌配置和套餐授权会在商业化阶段进入这里。 这些入口已经在 UI
          信息架构中预先占位，避免后续重构后台壳层。
        </p>
      </div>
    </PageFrame>
  );
}
