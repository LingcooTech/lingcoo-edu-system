import { CalendarCheck, List, Plus, Repeat } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { PageFrame } from '@/components/layout/PageFrame';
import { Drawer } from '@/components/shared/Drawer';
import { AttendancePage } from '@/pages/AttendancePage';
import { SchedulePage } from '@/pages/SchedulePage';

export function AcademicWorkbenchPage() {
  const [attendanceSessionId, setAttendanceSessionId] = useState('');
  const [scheduleAction, setScheduleAction] = useState<{
    type: 'create' | 'batch';
    key: number;
  } | null>(null);

  function openAttendance(sessionId: string) {
    setAttendanceSessionId(sessionId);
  }

  function requestScheduleAction(type: 'create' | 'batch') {
    setScheduleAction({ type, key: Date.now() });
  }

  return (
    <PageFrame
      section="teacherWorkbench"
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAttendanceSessionId('')}
          >
            <List className="h-4 w-4" />
            课表
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => requestScheduleAction('batch')}
          >
            <Repeat className="h-4 w-4" />
            快捷排课
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => requestScheduleAction('create')}
          >
            <Plus className="h-4 w-4" />
            新增课次
          </button>
          <Link className="btn btn-secondary" to="/academic/attendance">
            <CalendarCheck className="h-4 w-4" />
            点名
          </Link>
        </div>
      }
    >
      <SchedulePage
        embedded
        hideActions
        actionRequest={scheduleAction}
        onOpenAttendance={openAttendance}
      />

      <Drawer
        open={Boolean(attendanceSessionId)}
        onClose={() => setAttendanceSessionId('')}
        title="课次点名"
        description="当前课次点名、扣课课包和课时核销"
        panelClassName="!w-[min(96vw,1280px)]"
        contentClassName="bg-slate-50/60"
      >
        {attendanceSessionId ? (
          <AttendancePage embedded hideSessionPicker initialSessionId={attendanceSessionId} />
        ) : null}
      </Drawer>
    </PageFrame>
  );
}
