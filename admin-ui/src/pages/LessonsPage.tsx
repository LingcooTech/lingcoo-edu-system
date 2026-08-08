import type { CourseContract } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { formatPackageLessonBalance } from '@/lib/lesson-balance';
import { useApiResource } from '@/lib/useApiResource';

export function LessonsPage() {
  return (
    <PageFrame section="lessons">
      <LessonAccountsPanel />
    </PageFrame>
  );
}

export function LessonAccountsPanel() {
  const { data } = useApiResource<CourseContract>('/v1/course-contracts', 'courseContracts');

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
        {
          key: 'package',
          header: '课时包',
          cell: (row) => (
            <div className="cell-stack">
              <span className="cell-title">{row.package?.name ?? row.title}</span>
              <span className="cell-subtitle">
                {row.package?.billingType === 'period' ? '周期卡' : '课时包'}
                {row.endsAt ? ` · ${new Date(row.endsAt).toLocaleDateString('zh-CN')} 到期` : ''}
              </span>
            </div>
          ),
        },
        {
          key: 'consumed',
          header: '消费情况',
          cell: (row) => {
            const consumed = Math.max(row.lessonCount - row.remainingLessonCount, 0);
            return `${consumed} / ${row.lessonCount} 节`;
          },
        },
        {
          key: 'balance',
          header: '课包余额（剩余/总数）',
          cell: (row) => formatPackageLessonBalance(row.remainingLessonCount, row.lessonCount),
        },
        {
          key: 'status',
          header: '状态',
          cell: (row) =>
            row.status === 'active' ? '进行中' : row.status === 'completed' ? '已用完' : '已取消',
        },
      ]}
      data={data}
    />
  );
}
