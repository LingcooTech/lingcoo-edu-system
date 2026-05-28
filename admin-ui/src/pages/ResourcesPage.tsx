import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { tenantId } from '@/lib/foundation';
import { useApiResource } from '@/lib/useApiResource';

interface Teacher {
  id: string;
  name: string;
  phone: string;
  specialties: string[];
}

interface Classroom {
  id: string;
  name: string;
  capacity: number;
}

export function ResourcesPage() {
  const teachers = useApiResource<Teacher>(`/v1/tenants/${tenantId}/teachers`, 'teachers');
  const classrooms = useApiResource<Classroom>(`/v1/tenants/${tenantId}/classrooms`, 'classrooms');

  return (
    <PageFrame section="resources">
      <div className="grid gap-5 xl:grid-cols-2">
        <DataTable
          columns={[
            { key: 'name', header: '老师', cell: (row) => row.name },
            { key: 'phone', header: '电话', cell: (row) => row.phone },
            { key: 'spec', header: '擅长', cell: (row) => row.specialties.join('、') },
          ]}
          data={teachers.data}
        />
        <DataTable
          columns={[
            { key: 'name', header: '教室', cell: (row) => row.name },
            { key: 'capacity', header: '容量', cell: (row) => `${row.capacity} 人` },
          ]}
          data={classrooms.data}
        />
      </div>
    </PageFrame>
  );
}
