import { useState } from 'react';

import { PageFrame } from '@/components/layout/PageFrame';
import { ResourceToolbar, type ResourceToolbarAction } from '@/components/shared/ResourceToolbar';
import { CoursesPage } from '@/pages/CoursesPage';
import { PackagesPage } from '@/pages/PackagesPage';

const tabs = [
  { key: 'courses', label: '课程' },
  { key: 'packages', label: '课时包' },
] as const;

export function CourseResourcesPage() {
  const [tab, setTab] = useState<'courses' | 'packages'>('courses');
  const [action, setAction] = useState<ResourceToolbarAction | null>(null);

  function changeTab(nextTab: typeof tab) {
    setAction(null);
    setTab(nextTab);
  }

  return (
    <PageFrame section="courses">
      <ResourceToolbar tabs={tabs} activeKey={tab} onTabChange={changeTab} action={action} />
      {tab === 'courses' ? (
        <CoursesPage embedded onCreateActionChange={setAction} />
      ) : (
        <PackagesPage embedded onCreateActionChange={setAction} />
      )}
    </PageFrame>
  );
}
