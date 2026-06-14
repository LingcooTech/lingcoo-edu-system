import { useState } from 'react';

import { PageFrame } from '@/components/layout/PageFrame';
import { ResourceToolbar, type ResourceToolbarAction } from '@/components/shared/ResourceToolbar';
import { InstitutionsPage } from '@/pages/InstitutionsPage';
import { TeachersPage } from '@/pages/TeachersPage';

const tabs = [
  { key: 'teachers', label: '老师' },
  { key: 'institutions', label: '合作方' },
] as const;

export function TeacherResourcesPage() {
  const [tab, setTab] = useState<'teachers' | 'institutions'>('teachers');
  const [action, setAction] = useState<ResourceToolbarAction | null>(null);

  function changeTab(nextTab: typeof tab) {
    setAction(null);
    setTab(nextTab);
  }

  return (
    <PageFrame section="teachers">
      <ResourceToolbar tabs={tabs} activeKey={tab} onTabChange={changeTab} action={action} />
      {tab === 'teachers' ? (
        <TeachersPage embedded onCreateActionChange={setAction} />
      ) : (
        <InstitutionsPage embedded onCreateActionChange={setAction} />
      )}
    </PageFrame>
  );
}
