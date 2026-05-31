import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { api, apiPost } from '@/api/client';
import type {
  AttendanceRecord,
  AttendanceStatus,
  ClassSession,
  Student,
} from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { formatDateTime } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

interface Enrollment {
  id: string;
  studentId: string;
  student?: Student;
}

interface AttendanceDraft {
  status: AttendanceStatus;
  note: string;
}

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: '到课' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '缺勤' },
  { value: 'makeup', label: '补课' },
  { value: 'trial', label: '试听' },
];

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '到课',
  leave: '请假',
  absent: '缺勤',
  makeup: '补课',
  trial: '试听',
};

function defaultDraft(): AttendanceDraft {
  return { status: 'present', note: '' };
}

export function AttendancePage() {
  const toast = useToast();
  const { data: sessions, setData: setSessions } = useApiResource<ClassSession>(
    '/v1/class-sessions',
    'classSessions',
  );
  const [sessionId, setSessionId] = useState('');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessions, sessionId],
  );

  const recordByStudentId = useMemo(
    () => new Map(records.map((record) => [record.studentId, record])),
    [records],
  );

  useEffect(() => {
    if (!sessionId && sessions.length > 0) {
      setSessionId(sessions.find((session) => session.status !== 'cancelled')?.id ?? sessions[0].id);
    }
  }, [sessionId, sessions]);

  useEffect(() => {
    if (!selectedSession) {
      setEnrollments([]);
      setRecords([]);
      setDrafts({});
      return;
    }
    setLoading(true);
    Promise.all([
      api<{ enrollments: Enrollment[] }>(`/v1/classes/${selectedSession.classId}/enrollments`),
      api<{ attendanceRecords: AttendanceRecord[] }>(
        `/v1/class-sessions/${selectedSession.id}/attendance`,
      ),
    ])
      .then(([enrollmentPayload, attendancePayload]) => {
        setEnrollments(enrollmentPayload.enrollments);
        setRecords(attendancePayload.attendanceRecords);
        const nextDrafts: Record<string, AttendanceDraft> = {};
        enrollmentPayload.enrollments.forEach((enrollment) => {
          const existing = attendancePayload.attendanceRecords.find(
            (record) => record.studentId === enrollment.studentId,
          );
          nextDrafts[enrollment.studentId] = existing
            ? { status: existing.status, note: existing.note ?? '' }
            : defaultDraft();
        });
        setDrafts(nextDrafts);
      })
      .catch((err) => {
        setEnrollments([]);
        setRecords([]);
        setDrafts({});
        toast.error(err instanceof Error ? err.message : '加载签到数据失败');
      })
      .finally(() => setLoading(false));
  }, [selectedSession, toast]);

  function updateDraft(studentId: string, patch: Partial<AttendanceDraft>) {
    setDrafts((current) => ({
      ...current,
      [studentId]: { ...(current[studentId] ?? defaultDraft()), ...patch },
    }));
  }

  async function submit() {
    if (!selectedSession) return;
    const pending = enrollments
      .filter((enrollment) => !recordByStudentId.has(enrollment.studentId))
      .map((enrollment) => ({
        studentId: enrollment.studentId,
        status: drafts[enrollment.studentId]?.status ?? 'present',
        note: drafts[enrollment.studentId]?.note?.trim() || undefined,
      }));

    if (pending.length === 0) {
      toast.show('该课次已完成签到');
      return;
    }

    setSaving(true);
    try {
      const { attendanceRecords } = await apiPost<{ attendanceRecords: AttendanceRecord[] }>(
        `/v1/class-sessions/${selectedSession.id}/attendance`,
        { records: pending },
      );
      setRecords((current) => {
        const byStudentId = new Map(current.map((record) => [record.studentId, record]));
        attendanceRecords.forEach((record) => byStudentId.set(record.studentId, record));
        return Array.from(byStudentId.values());
      });
      setSessions(
        sessions.map((session) =>
          session.id === selectedSession.id ? { ...session, status: 'completed' } : session,
        ),
      );
      toast.success('签到已提交，课时流水已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交签到失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame
      section="attendance"
      actions={
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={!selectedSession || loading || saving || enrollments.length === 0}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          提交签到
        </button>
      }
    >
      <div className="resource-card mb-4 p-4">
        <label className="form-label">选择课次</label>
        <select
          className="form-input"
          value={sessionId}
          onChange={(event) => setSessionId(event.target.value)}
        >
          <option value="">请选择课次</option>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {formatDateTime(session.startsAt)} · {session.class?.name ?? '班级'} · {session.topic}
            </option>
          ))}
        </select>
        {selectedSession && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <StatusPill tone={statusToTone(selectedSession.status)} label={selectedSession.status} />
            <span className="text-muted-foreground">
              {selectedSession.teacher?.name ?? '老师'} · {selectedSession.classroom?.name ?? '教室'}
            </span>
          </div>
        )}
      </div>

      <div className="resource-card">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">学员签到</div>
          <div className="text-muted-foreground mt-1 text-xs">
            到课、缺勤、补课会扣 1 课时；请假和试听不扣课时。已签到记录不会重复扣课时。
          </div>
        </div>
        {loading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : enrollments.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center text-sm">
            {selectedSession ? '该班级暂无学员' : '请先选择课次'}
          </div>
        ) : (
          <div className="divide-y">
            {enrollments.map((enrollment) => {
              const student = enrollment.student;
              const record = recordByStudentId.get(enrollment.studentId);
              const draft = drafts[enrollment.studentId] ?? defaultDraft();
              return (
                <div
                  key={enrollment.id}
                  className="grid gap-3 px-4 py-3 lg:grid-cols-[1.1fr_1fr_1.2fr_auto]"
                >
                  <div className="cell-stack">
                    <span className="cell-title">{student?.name ?? '学员'}</span>
                    <span className="cell-subtitle">{student?.grade ?? '-'}</span>
                  </div>
                  <select
                    className="form-input"
                    value={draft.status}
                    disabled={Boolean(record)}
                    onChange={(event) =>
                      updateDraft(enrollment.studentId, {
                        status: event.target.value as AttendanceStatus,
                      })
                    }
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="form-input"
                    placeholder="备注"
                    value={draft.note}
                    disabled={Boolean(record)}
                    onChange={(event) =>
                      updateDraft(enrollment.studentId, { note: event.target.value })
                    }
                  />
                  <div className="flex items-center justify-start lg:justify-end">
                    {record ? (
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        已签到 · {STATUS_LABEL[record.status]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">待签到</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
