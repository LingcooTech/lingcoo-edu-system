import { useState } from 'react';

import { PageFrame } from '@/components/layout/PageFrame';
import { ResourceToolbar, type ResourceToolbarAction } from '@/components/shared/ResourceToolbar';
import { CoursesPage } from '@/pages/CoursesPage';
import { CourseSeriesPage } from '@/pages/CourseSeriesPage';
import { PackagesPage } from '@/pages/PackagesPage';

const tabs = [
  { key: 'series', label: '课程系列' },
  { key: 'courses', label: '课程' },
  { key: 'packages', label: '课时包' },
] as const;

export function CourseResourcesPage() {
  const [tab, setTab] = useState<'series' | 'courses' | 'packages'>('courses');
  const [action, setAction] = useState<ResourceToolbarAction | null>(null);

  function changeTab(nextTab: typeof tab) {
    setAction(null);
    setTab(nextTab);
  }

  return (
    <PageFrame section="courses">
      <ResourceToolbar tabs={tabs} activeKey={tab} onTabChange={changeTab} action={action} />
      {tab === 'series' ? (
        <CourseSeriesPage embedded onCreateActionChange={setAction} />
      ) : tab === 'courses' ? (
        <CoursesPage embedded onCreateActionChange={setAction} />
      ) : (
        <PackagesPage embedded onCreateActionChange={setAction} />
      )}
    </PageFrame>
  );
}
