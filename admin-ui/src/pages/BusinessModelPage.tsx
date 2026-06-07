import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { fetchOrganization, saveOrganization } from '@/api/client';
import type { BusinessModelSettings } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';

const DEFAULT_BUSINESS_MODEL: BusinessModelSettings = {
  onlinePackageSalesEnabled: true,
  manualPackageGrantEnabled: true,
  packagePriceDisplayEnabled: true,
  seatReservationFeeEnabled: false,
};

export function BusinessModelPage() {
  const [businessModel, setBusinessModel] = useState<BusinessModelSettings>(DEFAULT_BUSINESS_MODEL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchOrganization()
      .then((organization) =>
        setBusinessModel(organization.businessModel ?? DEFAULT_BUSINESS_MODEL),
      )
      .catch((err: Error) => setMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function submitBusinessModel(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const updated = await saveOrganization({ businessModel });
      setBusinessModel(updated.businessModel ?? DEFAULT_BUSINESS_MODEL);
      setMessage('业务开关已保存');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame section="businessModel">
      <form className="resource-card p-5" onSubmit={submitBusinessModel}>
        {loading ? (
          <p className="text-muted-foreground text-sm">加载中...</p>
        ) : (
          <>
            <div>
              <div className="text-sm font-semibold">业务开关</div>
              <p className="text-muted-foreground mt-1 text-sm">
                通过开关组合控制公开端购买、价格展示、试听占位费和线下课时管理能力。
              </p>
            </div>
            <div className="mt-4 grid gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={businessModel.onlinePackageSalesEnabled}
                  onChange={(event) =>
                    setBusinessModel({
                      ...businessModel,
                      onlinePackageSalesEnabled: event.target.checked,
                    })
                  }
                />
                允许公开端在线购买长期课时包
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={businessModel.manualPackageGrantEnabled}
                  onChange={(event) =>
                    setBusinessModel({
                      ...businessModel,
                      manualPackageGrantEnabled: event.target.checked,
                    })
                  }
                />
                允许后台线下收款后手动添加课时包
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={businessModel.packagePriceDisplayEnabled}
                  onChange={(event) =>
                    setBusinessModel({
                      ...businessModel,
                      packagePriceDisplayEnabled: event.target.checked,
                    })
                  }
                />
                公开展示正式课程/课时包参考价格
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={businessModel.seatReservationFeeEnabled}
                  onChange={(event) =>
                    setBusinessModel({
                      ...businessModel,
                      seatReservationFeeEnabled: event.target.checked,
                    })
                  }
                />
                启用试听/公开课占位费
              </label>
            </div>
            {message && <p className="text-muted-foreground mt-4 text-sm">{message}</p>}
            <button className="btn btn-primary mt-4" disabled={saving}>
              {saving ? '保存中...' : '保存业务开关'}
            </button>
          </>
        )}
      </form>
    </PageFrame>
  );
}
