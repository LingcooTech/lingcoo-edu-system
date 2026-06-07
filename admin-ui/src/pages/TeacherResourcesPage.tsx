import { useState } from 'react';

import { PageFrame } from '@/components/layout/PageFrame';
import { InstitutionsPage } from '@/pages/InstitutionsPage';
import { TeachersPage } from '@/pages/TeachersPage';

export function TeacherResourcesPage() {
  const [tab, setTab] = useState<'teachers' | 'institutions'>('teachers');

  return (
    <PageFrame section="teachers">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={tab === 'teachers' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => setTab('teachers')}
        >
          老师
        </button>
        <button
          type="button"
          className={tab === 'institutions' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => setTab('institutions')}
        >
          合作方
        </button>
      </div>
      {tab === 'teachers' ? <TeachersPage embedded /> : <InstitutionsPage embedded />}
    </PageFrame>
  );
}
