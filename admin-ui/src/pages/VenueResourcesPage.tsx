import { useState } from 'react';

import { PageFrame } from '@/components/layout/PageFrame';
import { CampusesPage } from '@/pages/CampusesPage';
import { ClassroomsPage } from '@/pages/ClassroomsPage';

export function VenueResourcesPage() {
  const [tab, setTab] = useState<'campuses' | 'classrooms'>('campuses');

  return (
    <PageFrame section="campuses">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={tab === 'campuses' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => setTab('campuses')}
        >
          校区
        </button>
        <button
          type="button"
          className={tab === 'classrooms' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => setTab('classrooms')}
        >
          教室
        </button>
      </div>
      {tab === 'campuses' ? <CampusesPage embedded /> : <ClassroomsPage embedded />}
    </PageFrame>
  );
}
