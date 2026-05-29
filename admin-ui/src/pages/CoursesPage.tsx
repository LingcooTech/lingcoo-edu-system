import type { Course, CoursePackage } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { tenantId } from '@/lib/foundation';
import { money } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

export function CoursesPage() {
  const { data: courses } = useApiResource<Course>(`/v1/tenants/${tenantId}/courses`, 'courses');
  const { data: packages } = useApiResource<CoursePackage>(
    `/v1/tenants/${tenantId}/course-packages`,
    'coursePackages',
  );

  return (
    <PageFrame section="courses">
      <DataTable
        columns={[
          {
            key: 'name',
            header: '课程',
            cell: (row) => (
              <div className="cell-stack">
                <span className="cell-title">{row.name}</span>
                <span className="cell-subtitle">{row.summary}</span>
              </div>
            ),
          },
          { key: 'category', header: '分类', cell: (row) => row.category },
          { key: 'age', header: '适龄', cell: (row) => row.ageRange },
          { key: 'lessons', header: '课时', cell: (row) => `${row.lessonCount} 节` },
          { key: 'price', header: '价格', cell: (row) => money(row.priceAmount) },
          {
            key: 'status',
            header: '状态',
            cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
          },
        ]}
        data={courses}
      />

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">课时包</h2>
        <DataTable
          columns={[
            {
              key: 'name',
              header: '课时包',
              cell: (row) => (
                <div className="cell-stack">
                  <span className="cell-title">{row.name}</span>
                  <span className="cell-subtitle">{row.description}</span>
                </div>
              ),
            },
            { key: 'lessons', header: '课时', cell: (row) => `${row.lessonCount} 节` },
            { key: 'price', header: '价格', cell: (row) => money(row.priceAmount) },
            {
              key: 'status',
              header: '状态',
              cell: (row) => <StatusPill tone={statusToTone(row.status)} label={row.status} />,
            },
          ]}
          data={packages}
        />
      </div>
    </PageFrame>
  );
}
