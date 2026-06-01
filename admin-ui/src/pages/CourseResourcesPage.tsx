import { useState } from 'react';

import { PageFrame } from '@/components/layout/PageFrame';
import { CoursesPage } from '@/pages/CoursesPage';
import { PackagesPage } from '@/pages/PackagesPage';

export function CourseResourcesPage() {
  const [tab, setTab] = useState<'courses' | 'packages'>('courses');

  return (
    <PageFrame section="courses">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={tab === 'courses' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => setTab('courses')}
        >
          课程
        </button>
        <button
          type="button"
          className={tab === 'packages' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => setTab('packages')}
        >
          课时包
        </button>
      </div>
      {tab === 'courses' ? <CoursesPage embedded /> : <PackagesPage embedded />}
    </PageFrame>
  );
}
