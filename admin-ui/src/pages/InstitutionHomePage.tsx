import { useEffect, useState } from 'react';

import { fetchOrganization } from '@/api/client';
import type { OrganizationSettings } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';

export function InstitutionHomePage() {
  const [organization, setOrganization] = useState<OrganizationSettings | null>(null);

  useEffect(() => {
    fetchOrganization().then(setOrganization).catch(console.error);
  }, []);

  const profile = organization?.publicProfile;
  const branding = organization?.branding;

  return (
    <PageFrame section="institutionHome">
      <section
        className="overflow-hidden rounded-lg border bg-white"
        style={{
          backgroundColor: branding?.backgroundColor || undefined,
          color: branding?.textColor || undefined,
        }}
      >
        <div className="grid gap-8 p-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex min-h-72 flex-col justify-center">
            <div className="text-muted-foreground text-sm">{organization?.name ?? '机构名称'}</div>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight">
              {organization?.brandName ?? '机构品牌名称'}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7">
              {profile?.headline || '这里展示机构对外主页的首屏标题。'}
            </p>
            <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-6">
              {profile?.introduction || '在系统设置中完善机构介绍后，这里会同步展示。'}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {(profile?.highlights.length
                ? profile.highlights
                : ['教学特色', '师资优势', '服务承诺']
              ).map((item) => (
                <span key={item} className="rounded-full border bg-white/80 px-3 py-1 text-sm">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg border bg-white/80 p-5">
            <div className="text-sm font-semibold">机构信息</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">电话</span>
                <span>{organization?.phone || '-'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">地址</span>
                <span className="text-right">{organization?.address || '-'}</span>
              </div>
            </div>
            <div className="mt-6 text-sm font-semibold">承诺</div>
            <div className="mt-3 space-y-2">
              {(profile?.promises.length
                ? profile.promises
                : ['透明课消', '安全环境', '及时反馈']
              ).map((item) => (
                <div key={item} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
