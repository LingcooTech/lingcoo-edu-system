import { useEffect, useState } from 'react';

import { api } from '@/api/client';
import type { AuditLog } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { Drawer } from '@/components/shared/Drawer';
import { Field, FieldRow } from '@/components/shared/FormField';

type AuditResponse = {
  auditLogs: AuditLog[];
  facets: { actions: string[]; resourceTypes: string[] };
};

function metaValue(meta: Record<string, unknown>, key: string) {
  const item = meta[key];
  return item === undefined || item === null ? '-' : String(item);
}

export function AuditLogsPage() {
  const [data, setData] = useState<AuditResponse>({
    auditLogs: [],
    facets: { actions: [], resourceTypes: [] },
  });
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  useEffect(() => {
    const query = new URLSearchParams({ limit: '500' });
    if (search.trim()) query.set('search', search.trim());
    if (action) query.set('action', action);
    if (resourceType) query.set('resourceType', resourceType);
    const timer = window.setTimeout(() => {
      setLoading(true);
      api<AuditResponse>(`/v1/audit-logs?${query.toString()}`)
        .then(setData)
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [action, resourceType, search]);

  return (
    <PageFrame section="auditLogs">
      <div className="mb-4 rounded-lg border bg-white p-4">
        <FieldRow>
          <Field label="搜索">
            <input
              className="form-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="动作、对象、摘要或编号"
            />
          </Field>
          <Field label="动作">
            <select
              className="form-input"
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              <option value="">全部动作</option>
              {data.facets.actions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="对象">
            <select
              className="form-input"
              value={resourceType}
              onChange={(event) => setResourceType(event.target.value)}
            >
              <option value="">全部对象</option>
              {data.facets.resourceTypes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </Field>
        </FieldRow>
      </div>
      <DataTable
        columns={[
          {
            key: 'time',
            header: '时间',
            cell: (row) => new Date(row.createdAt).toLocaleString('zh-CN'),
          },
          {
            key: 'action',
            header: '动作',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.action}</span>
                <span className="cell-subtitle">{row.summary ?? '-'}</span>
              </div>
            ),
          },
          { key: 'actor', header: '操作人', cell: (row) => row.actor?.displayName ?? '系统' },
          { key: 'institution', header: '机构', cell: (row) => row.institution?.name ?? '全局' },
          {
            key: 'resource',
            header: '对象',
            cell: (row) => (
              <button
                type="button"
                className="text-left text-sm font-medium text-blue-700 hover:underline"
                onClick={() => setSelected(row)}
              >
                {row.resourceType}
                {row.resourceId ? ` · ${row.resourceId}` : ''}
              </button>
            ),
          },
          {
            key: 'balance',
            header: '课时变动',
            cell: (row) =>
              row.action.startsWith('lesson.movement.')
                ? `${metaValue(row.meta, 'units')} · ${metaValue(row.meta, 'balanceBefore')} → ${metaValue(row.meta, 'balanceAfter')}`
                : '-',
          },
        ]}
        data={data.auditLogs}
        emptyMessage={loading ? '正在加载审计日志...' : '暂无审计日志'}
      />
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="审计详情"
        description={selected?.summary ?? undefined}
        panelClassName="max-w-3xl"
        footer={
          <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>
            关闭
          </button>
        }
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <AuditField label="时间" value={new Date(selected.createdAt).toLocaleString('zh-CN')} />
              <AuditField label="结果" value={selected.outcome} />
              <AuditField label="动作" value={selected.action} />
              <AuditField label="操作人" value={selected.actor?.displayName ?? '系统'} />
              <AuditField label="机构" value={selected.institution?.name ?? '全局'} />
              <AuditField label="请求编号" value={selected.requestId ?? '-'} mono />
              <AuditField label="对象类型" value={selected.resourceType} />
              <AuditField label="对象编号" value={selected.resourceId ?? '-'} mono />
            </dl>
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-semibold">完整元数据</p>
              <pre className="max-h-[55vh] overflow-auto rounded-md border bg-stone-950 p-4 text-xs leading-5 whitespace-pre-wrap text-stone-100">
                {JSON.stringify(selected.meta, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Drawer>
    </PageFrame>
  );
}

function AuditField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-semibold">{label}</dt>
      <dd className={mono ? 'mt-1 break-all font-mono text-xs' : 'mt-1 break-words'}>{value}</dd>
    </div>
  );
}
