import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { api, apiPost } from '@/api/client';
import type {
  AttendanceRecord,
  AttendanceStatus,
  ClassSession,
  SessionRosterEntry,
} from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { formatDateTime } from '@/lib/utils';
import { useApiResource } from '@/lib/useApiResource';

interface AttendanceDraft {
  status: AttendanceStatus;
  note: string;
}

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: '到课' },
  { value: 'late', label: '迟到' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '缺勤' },
  { value: 'makeup', label: '补课' },
  { value: 'trial', label: '试听' },
];

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '到课',
  late: '迟到',
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
  const [roster, setRoster] = useState<SessionRosterEntry[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [loading, setLoading] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState('');

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessions, sessionId],
  );

  const recordByStudentId = useMemo(
    () => new Map(records.map((record) => [record.studentId, record])),
    [records],
  );

  const attendanceSummary = useMemo(() => {
    const total = roster.length;
    const signed = records.length;
    const statuses: Record<AttendanceStatus, number> = {
      present: 0,
      late: 0,
      leave: 0,
      absent: 0,
      makeup: 0,
      trial: 0,
    };
    records.forEach((record) => {
      statuses[record.status]++;
    });
    const lessonDeducted = statuses.present + statuses.late + statuses.absent + statuses.makeup;
    return { total, signed, statuses, lessonDeducted };
  }, [roster, records]);

  useEffect(() => {
    if (!sessionId && sessions.length > 0) {
      setSessionId(
        sessions.find((session) => session.status !== 'cancelled')?.id ?? sessions[0].id,
      );
    }
  }, [sessionId, sessions]);

  useEffect(() => {
    if (!selectedSession) {
      setRoster([]);
      setRecords([]);
      setDrafts({});
      return;
    }
    setLoading(true);
    Promise.all([
      api<{ roster: SessionRosterEntry[] }>(`/v1/class-sessions/${selectedSession.id}/roster`),
      api<{ attendanceRecords: AttendanceRecord[] }>(
        `/v1/class-sessions/${selectedSession.id}/attendance`,
      ),
    ])
      .then(([rosterPayload, attendancePayload]) => {
        setRoster(rosterPayload.roster);
        setRecords(attendancePayload.attendanceRecords);
        const nextDrafts: Record<string, AttendanceDraft> = {};
        rosterPayload.roster.forEach((entry) => {
          const existing = attendancePayload.attendanceRecords.find(
            (record) => record.studentId === entry.studentId,
          );
          nextDrafts[entry.studentId] = existing
            ? { status: existing.status, note: existing.note ?? '' }
            : defaultDraft();
        });
        setDrafts(nextDrafts);
      })
      .catch((err) => {
        setRoster([]);
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

  async function submitRosterEntry(entry: SessionRosterEntry) {
    if (!selectedSession || recordByStudentId.has(entry.studentId)) return;
    const draft = drafts[entry.studentId] ?? defaultDraft();
    setSavingStudentId(entry.studentId);
    try {
      const { attendanceRecords } = await apiPost<{ attendanceRecords: AttendanceRecord[] }>(
        `/v1/class-sessions/${selectedSession.id}/attendance`,
        {
          records: [
            {
              studentId: entry.studentId,
              status: draft.status,
              note: draft.note.trim() || undefined,
            },
          ],
        },
      );
      setRecords((current) => {
        const byStudentId = new Map(current.map((record) => [record.studentId, record]));
        attendanceRecords.forEach((record) => byStudentId.set(record.studentId, record));
        const nextRecords = Array.from(byStudentId.values());
        const checkedInStudentIds = new Set(nextRecords.map((record) => record.studentId));
        if (roster.length > 0 && roster.every((item) => checkedInStudentIds.has(item.studentId))) {
          setSessions(
            sessions.map((session) =>
              session.id === selectedSession.id ? { ...session, status: 'completed' } : session,
            ),
          );
        }
        return nextRecords;
      });
      toast.success('补签/核销已提交，课时流水已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSavingStudentId('');
    }
  }

  return (
    <PageFrame section="attendance">
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
            <StatusPill
              tone={statusToTone(selectedSession.status)}
              label={selectedSession.status}
            />
            <span className="text-muted-foreground">
              {selectedSession.teacher?.name ?? '老师'} ·{' '}
              {selectedSession.classroom?.name ?? '教室'}
            </span>
          </div>
        )}
      </div>

      {selectedSession && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="resource-card p-4">
            <div className="text-muted-foreground text-xs">总学员数</div>
            <div className="mt-2 text-2xl font-semibold">{attendanceSummary.total}</div>
          </div>
          <div className="resource-card p-4">
            <div className="text-muted-foreground text-xs">已签到</div>
            <div className="mt-2 text-2xl font-semibold text-blue-600">
              {attendanceSummary.signed}
            </div>
          </div>
          <div className="resource-card p-4">
            <div className="text-muted-foreground text-xs">到课</div>
            <div className="mt-2 text-2xl font-semibold text-green-600">
              {attendanceSummary.statuses.present}
            </div>
          </div>
          <div className="resource-card p-4">
            <div className="text-muted-foreground text-xs">缺勤</div>
            <div className="mt-2 text-2xl font-semibold text-red-600">
              {attendanceSummary.statuses.absent}
            </div>
          </div>
          <div className="resource-card p-4">
            <div className="text-muted-foreground text-xs">请假 / 补课 / 试听</div>
            <div className="mt-2 text-2xl font-semibold text-amber-600">
              {attendanceSummary.statuses.leave +
                attendanceSummary.statuses.makeup +
                attendanceSummary.statuses.trial}
            </div>
          </div>
        </div>
      )}

      <div className="resource-card">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">后台补签与核销</div>
          <div className="text-muted-foreground mt-1 text-xs">
            老师端用于老师到岗打卡，家长端用于学员到课确认；后台用于总览、补签和异常核销。到课、迟到、缺勤、补课会扣
            1 课时；请假和试听不扣课时。
          </div>
        </div>
        {loading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : roster.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center text-sm">
            {selectedSession ? '该课次暂无学员' : '请先选择课次'}
          </div>
        ) : (
          <div className="divide-y">
            {roster.map((entry) => {
              const student = entry.student;
              const record = recordByStudentId.get(entry.studentId);
              const draft = drafts[entry.studentId] ?? defaultDraft();
              return (
                <div
                  key={`${entry.source}-${entry.id}`}
                  className="grid gap-3 px-4 py-3 lg:grid-cols-[1.1fr_1fr_1.2fr_auto]"
                >
                  <div className="cell-stack">
                    <span className="cell-title flex items-center gap-2">
                      {student?.name ?? '学员'}
                      {entry.source === 'temporary' && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                          临时
                        </span>
                      )}
                    </span>
                    <span className="cell-subtitle">
                      {student?.grade ?? '-'}
                      {entry.source === 'temporary' && entry.billingCourse
                        ? ` · 扣 ${entry.billingCourse.name}`
                        : ''}
                    </span>
                  </div>
                  <select
                    className="form-input"
                    value={draft.status}
                    disabled={Boolean(record)}
                    onChange={(event) =>
                      updateDraft(entry.studentId, {
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
                    onChange={(event) => updateDraft(entry.studentId, { note: event.target.value })}
                  />
                  <div className="flex items-center justify-start lg:justify-end">
                    {record ? (
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        已签到 · {STATUS_LABEL[record.status]}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary px-3 py-1.5"
                        disabled={!selectedSession || loading || savingStudentId !== ''}
                        onClick={() => submitRosterEntry(entry)}
                      >
                        {savingStudentId === entry.studentId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        补签/核销
                      </button>
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
