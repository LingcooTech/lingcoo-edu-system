import { useState } from 'react';

import { PageFrame } from '@/components/layout/PageFrame';
import { ResourceToolbar, type ResourceToolbarAction } from '@/components/shared/ResourceToolbar';
import { CampusesPage } from '@/pages/CampusesPage';
import { ClassroomsPage } from '@/pages/ClassroomsPage';

const tabs = [
  { key: 'campuses', label: '校区' },
  { key: 'classrooms', label: '教室' },
] as const;

export function VenueResourcesPage() {
  const [tab, setTab] = useState<'campuses' | 'classrooms'>('campuses');
  const [action, setAction] = useState<ResourceToolbarAction | null>(null);

  function changeTab(nextTab: typeof tab) {
    setAction(null);
    setTab(nextTab);
  }

  return (
    <PageFrame section="campuses">
      <ResourceToolbar tabs={tabs} activeKey={tab} onTabChange={changeTab} action={action} />
      {tab === 'campuses' ? (
        <CampusesPage embedded onCreateActionChange={setAction} />
      ) : (
        <ClassroomsPage embedded onCreateActionChange={setAction} />
      )}
    </PageFrame>
  );
}
