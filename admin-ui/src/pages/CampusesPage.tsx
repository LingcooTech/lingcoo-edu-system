import { Plus } from 'lucide-react';

import type { Campus } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { useApiResource } from '@/lib/useApiResource';

export function CampusesPage() {
  // GET /v1/campuses 列表读可用；新增 / 编辑待后端接口开放。
  const { data } = useApiResource<Campus>('/v1/campuses', 'campuses');

  return (
    <PageFrame
      section="campuses"
      actions={
        <button
          type="button"
          className="btn btn-primary"
          disabled
          title="新增校区待后端接口开放"
        >
          <Plus className="h-4 w-4" />
          新增校区
        </button>
      }
    >
      <DataTable
        columns={[
          { key: 'name', header: '校区', cell: (row) => row.name },
          { key: 'address', header: '地址', cell: (row) => row.address ?? '-' },
        ]}
        data={data}
        emptyMessage="暂无校区数据（新增 / 编辑待后端接口开放）"
      />
    </PageFrame>
  );
}
