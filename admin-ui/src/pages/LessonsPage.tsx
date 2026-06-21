import type { LessonAccount } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { useApiResource } from '@/lib/useApiResource';

export function LessonsPage() {
  return (
    <PageFrame section="lessons">
      <LessonAccountsPanel />
    </PageFrame>
  );
}

export function LessonAccountsPanel() {
  const { data } = useApiResource<LessonAccount>(
    '/v1/lesson-accounts',
    'lessonAccounts',
  );

  return (
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
  );
}
