import type { LessonAccount } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { tenantId } from '@/lib/foundation';
import { useApiResource } from '@/lib/useApiResource';

export function LessonsPage() {
  const { data } = useApiResource<LessonAccount>(
    `/v1/tenants/${tenantId}/lesson-accounts`,
    'lessonAccounts',
  );

  return (
    <PageFrame section="lessons">
      <DataTable
        columns={[
          {
            key: 'student',
            header: '学员',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.student?.name}</span>
                <span className="cell-subtitle">{row.student?.grade}</span>
              </div>
            ),
          },
          { key: 'course', header: '课程', cell: (row) => row.course?.name ?? '-' },
          { key: 'balance', header: '剩余课时', cell: (row) => `${row.balance} 节` },
        ]}
        data={data}
      />
    </PageFrame>
  );
}
