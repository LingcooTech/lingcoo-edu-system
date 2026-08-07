import { ArrowLeft, CalendarDays, GraduationCap } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { PageFrame } from '@/components/layout/PageFrame';
import { AttendancePage } from '@/pages/AttendancePage';
import { SchedulePage } from '@/pages/SchedulePage';

export function AcademicWorkbenchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSessionId = searchParams.get('sessionId') ?? '';

  function openAttendance(sessionId: string) {
    setSearchParams({ sessionId });
  }

  function backToSchedule() {
    setSearchParams({});
  }

  return (
    <PageFrame
      section="teacherWorkbench"
      actions={
        <Link className="btn btn-secondary" to="/academic/students">
          <GraduationCap className="h-4 w-4" />
          学员档案
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="text-primary h-4 w-4" />
          {selectedSessionId ? '当前课次点名' : '课表与排课'}
        </div>
        {selectedSessionId ? (
          <button type="button" className="btn btn-secondary" onClick={backToSchedule}>
            <ArrowLeft className="h-4 w-4" />
            返回课表
          </button>
        ) : null}
      </div>

      {selectedSessionId ? (
        <AttendancePage embedded hideSessionPicker initialSessionId={selectedSessionId} />
      ) : (
        <SchedulePage embedded onOpenAttendance={openAttendance} />
      )}
    </PageFrame>
  );
}
