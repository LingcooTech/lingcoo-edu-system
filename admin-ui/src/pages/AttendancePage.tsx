import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  Users,
  WalletCards,
} from 'lucide-react';

import { api, apiPatch, apiPost } from '@/api/client';
import type {
  AttendanceRecord,
  AttendanceLessonSource,
  AttendanceStatus,
  ClassSession,
  SessionRosterEntry,
} from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useToast } from '@/components/shared/Toast';
import { formatPackageLessonBalance } from '@/lib/lesson-balance';
import { useApiResource } from '@/lib/useApiResource';

interface AttendanceDraft {
  status: AttendanceStatus;
  note: string;
  deductLesson: boolean;
  courseContractId: string;
}

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: '到课' },
  { value: 'late', label: '迟到' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '未到' },
];

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '到课',
  late: '迟到',
  leave: '请假',
  absent: '未到',
  makeup: '到课',
  trial: '到课',
};

function editableAttendanceStatus(status: AttendanceStatus): AttendanceStatus {
  return status === 'makeup' || status === 'trial' ? 'present' : status;
}

function defaultDraft(): AttendanceDraft {
  return { status: 'present', note: '', deductLesson: true, courseContractId: '' };
}

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function shortDateLabel(key: string) {
  const date = new Date(`${key}T00:00:00`);
  return {
    date: `${date.getMonth() + 1}/${date.getDate()}`,
    weekday: new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date),
  };
}

function sessionTimeLabel(session: ClassSession) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${formatter.format(new Date(session.startsAt))}–${formatter.format(new Date(session.endsAt))}`;
}

function sessionStatusLabel(status: string) {
  if (status === 'scheduled') return '待上课';
  if (status === 'completed') return '已完成';
  if (status === 'cancelled') return '已取消';
  return status;
}

function statusButtonClass(status: AttendanceStatus, selected: boolean) {
  if (!selected) return 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
  if (status === 'present') return 'border-emerald-500 bg-emerald-50 text-emerald-700';
  if (status === 'late') return 'border-orange-500 bg-orange-50 text-orange-700';
  if (status === 'leave') return 'border-amber-500 bg-amber-50 text-amber-700';
  return 'border-red-500 bg-red-50 text-red-700';
}

export function AttendancePage({
  embedded = false,
  initialSessionId = '',
  hideSessionPicker = false,
}: {
  embedded?: boolean;
  initialSessionId?: string;
  hideSessionPicker?: boolean;
} = {}) {
  const toast = useToast();
  const { data: sessions, setData: setSessions } = useApiResource<ClassSession>(
    '/v1/class-sessions',
    'classSessions',
  );
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [roster, setRoster] = useState<SessionRosterEntry[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [lessonSourcesByStudentId, setLessonSourcesByStudentId] = useState<
    Record<string, AttendanceLessonSource[]>
  >({});
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [loading, setLoading] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState('');
  const [sourcePickerStudentId, setSourcePickerStudentId] = useState('');

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
      ),
    [sessions],
  );

  const sessionDateKeys = useMemo(
    () => Array.from(new Set(sortedSessions.map((session) => dateKey(session.startsAt)))),
    [sortedSessions],
  );

  const selectedDateSessions = useMemo(
    () => sortedSessions.filter((session) => dateKey(session.startsAt) === selectedDateKey),
    [selectedDateKey, sortedSessions],
  );

  const visibleDateKeys = useMemo(() => {
    if (sessionDateKeys.length <= 7) return sessionDateKeys;
    const selectedIndex = Math.max(0, sessionDateKeys.indexOf(selectedDateKey));
    const start = Math.min(Math.max(0, selectedIndex - 3), sessionDateKeys.length - 7);
    return sessionDateKeys.slice(start, start + 7);
  }, [selectedDateKey, sessionDateKeys]);

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
      statuses[editableAttendanceStatus(record.status)]++;
    });
    const lessonDeducted = records.reduce(
      (sum, record) => sum + (record.lessonDelta < 0 ? -record.lessonDelta : 0),
      0,
    );
    return { total, signed, statuses, lessonDeducted };
  }, [roster, records]);

  useEffect(() => {
    if (initialSessionId && sessions.some((session) => session.id === initialSessionId)) {
      setSessionId(initialSessionId);
      return;
    }
    if (!sessionId && sessions.length > 0) {
      const now = Date.now();
      const selectableSessions = sortedSessions.filter((session) => session.status !== 'cancelled');
      const bestSession =
        selectableSessions.find((session) => new Date(session.endsAt).getTime() >= now) ??
        selectableSessions.at(-1) ??
        sortedSessions[0];
      setSessionId(bestSession.id);
      setSelectedDateKey(dateKey(bestSession.startsAt));
    }
  }, [initialSessionId, sessionId, sessions, sortedSessions]);

  useEffect(() => {
    if (selectedSession) setSelectedDateKey(dateKey(selectedSession.startsAt));
  }, [selectedSession]);

  useEffect(() => {
    if (!selectedSession) {
      setRoster([]);
      setRecords([]);
      setLessonSourcesByStudentId({});
      setDrafts({});
      return;
    }
    setSourcePickerStudentId('');
    setLoading(true);
    Promise.all([
      api<{ roster: SessionRosterEntry[] }>(`/v1/class-sessions/${selectedSession.id}/roster`),
      api<{ attendanceRecords: AttendanceRecord[] }>(
        `/v1/class-sessions/${selectedSession.id}/attendance`,
      ),
      api<{ lessonSourcesByStudentId: Record<string, AttendanceLessonSource[]> }>(
        `/v1/class-sessions/${selectedSession.id}/attendance-sources`,
      ),
    ])
      .then(([rosterPayload, attendancePayload, sourcePayload]) => {
        setRoster(rosterPayload.roster);
        setRecords(attendancePayload.attendanceRecords);
        setLessonSourcesByStudentId(sourcePayload.lessonSourcesByStudentId);
        const nextDrafts: Record<string, AttendanceDraft> = {};
        rosterPayload.roster.forEach((entry) => {
          const existing = attendancePayload.attendanceRecords.find(
            (record) => record.studentId === entry.studentId,
          );
          const lessonSources = (
            sourcePayload.lessonSourcesByStudentId[entry.studentId] ?? []
          ).filter((source) => source.courseId === entry.billingCourseId);
          const requiredLessonUnits = selectedSession.lessonUnits ?? 1;
          const selectedSource =
            lessonSources.find(
              (source) =>
                source.id === entry.billingCourseContractId &&
                source.remainingLessonCount >= requiredLessonUnits,
            ) ?? lessonSources.find((source) => source.remainingLessonCount >= requiredLessonUnits);
          nextDrafts[entry.studentId] = existing
            ? {
                status: editableAttendanceStatus(existing.status),
                note: existing.note ?? '',
                deductLesson: existing.lessonDelta < 0,
                courseContractId: existing.courseContractId ?? '',
              }
            : {
                ...defaultDraft(),
                courseContractId: selectedSource?.id ?? '',
              };
        });
        setDrafts(nextDrafts);
      })
      .catch((err) => {
        setRoster([]);
        setRecords([]);
        setLessonSourcesByStudentId({});
        setDrafts({});
        toast.error(err instanceof Error ? err.message : '加载点名数据失败');
      })
      .finally(() => setLoading(false));
  }, [selectedSession, toast]);

  function updateDraft(studentId: string, patch: Partial<AttendanceDraft>) {
    setDrafts((current) => ({
      ...current,
      [studentId]: { ...(current[studentId] ?? defaultDraft()), ...patch },
    }));
  }

  function refreshLessonSources(selectedSessionId: string) {
    void api<{ lessonSourcesByStudentId: Record<string, AttendanceLessonSource[]> }>(
      `/v1/class-sessions/${selectedSessionId}/attendance-sources`,
    )
      .then((payload) => setLessonSourcesByStudentId(payload.lessonSourcesByStudentId))
      .catch(() => undefined);
  }

  function selectDate(key: string) {
    setSelectedDateKey(key);
    const sessionsOnDate = sortedSessions.filter((session) => dateKey(session.startsAt) === key);
    const firstSelectable =
      sessionsOnDate.find((session) => session.status !== 'cancelled') ?? sessionsOnDate[0];
    if (firstSelectable) setSessionId(firstSelectable.id);
  }

  function navigateDate(direction: -1 | 1) {
    const currentIndex = sessionDateKeys.indexOf(selectedDateKey);
    const nextKey = sessionDateKeys[currentIndex + direction];
    if (nextKey) selectDate(nextKey);
  }

  function jumpToNearestToday() {
    const today = dateKey(new Date());
    const exact = sessionDateKeys.find((key) => key === today);
    if (exact) {
      selectDate(exact);
      return;
    }
    const next = sessionDateKeys.find((key) => key > today) ?? sessionDateKeys.at(-1);
    if (next) selectDate(next);
  }

  async function submitRosterEntry(entry: SessionRosterEntry) {
    if (!selectedSession) return;
    const draft = drafts[entry.studentId] ?? defaultDraft();
    const existing = recordByStudentId.get(entry.studentId);
    setSavingStudentId(entry.studentId);
    try {
      if (existing) {
        const { attendanceRecord } = await apiPatch<{
          attendanceRecord: AttendanceRecord;
        }>(`/v1/class-sessions/${selectedSession.id}/attendance/${entry.studentId}`, {
          status: draft.status,
          note: draft.note.trim() || undefined,
          deductLesson: draft.status === 'absent' ? draft.deductLesson : undefined,
          courseContractId: draft.courseContractId || null,
        });
        setRecords((current) =>
          current.map((record) => (record.id === attendanceRecord.id ? attendanceRecord : record)),
        );
        refreshLessonSources(selectedSession.id);
        toast.success('点名结果已修改，课时流水已校正');
        return;
      }

      const { attendanceRecords } = await apiPost<{ attendanceRecords: AttendanceRecord[] }>(
        `/v1/class-sessions/${selectedSession.id}/attendance`,
        {
          records: [
            {
              studentId: entry.studentId,
              status: draft.status,
              note: draft.note.trim() || undefined,
              deductLesson: draft.status === 'absent' ? draft.deductLesson : undefined,
              courseContractId: draft.courseContractId || null,
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
      refreshLessonSources(selectedSession.id);
      toast.success('补点/核销已提交，课时流水已更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSavingStudentId('');
    }
  }

  return (
    <PageFrame
      section="attendance"
      headerClassName={embedded ? 'hidden' : undefined}
      contentClassName={embedded ? 'pt-0' : undefined}
    >
      <div className={hideSessionPicker ? 'hidden' : 'resource-card mb-4 overflow-hidden'}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              选择点名课次
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              先按日期定位，再直接点击当天课次
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary px-2.5"
              aria-label="上一个有课日期"
              disabled={sessionDateKeys.indexOf(selectedDateKey) <= 0}
              onClick={() => navigateDate(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" className="btn btn-secondary" onClick={jumpToNearestToday}>
              今天附近
            </button>
            <button
              type="button"
              className="btn btn-secondary px-2.5"
              aria-label="下一个有课日期"
              disabled={sessionDateKeys.indexOf(selectedDateKey) >= sessionDateKeys.length - 1}
              onClick={() => navigateDate(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {sessionDateKeys.length === 0 ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">暂无可点名课次</div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto border-b bg-slate-50/70 px-4 py-3">
              {visibleDateKeys.map((key) => {
                const label = shortDateLabel(key);
                const sessionsOnDate = sortedSessions.filter(
                  (session) => dateKey(session.startsAt) === key,
                );
                const pendingCount = sessionsOnDate.filter(
                  (session) => session.status === 'scheduled',
                ).length;
                const selected = key === selectedDateKey;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`min-w-20 rounded-xl border px-3 py-2 text-center transition ${
                      selected
                        ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                    onClick={() => selectDate(key)}
                  >
                    <span className="block text-xs opacity-80">{label.weekday}</span>
                    <span className="mt-0.5 block text-base font-semibold">{label.date}</span>
                    <span className="mt-0.5 block text-[11px] opacity-80">
                      {pendingCount > 0
                        ? `${pendingCount} 节待点`
                        : `${sessionsOnDate.length} 节课`}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {selectedDateSessions.map((session) => {
                const selected = session.id === sessionId;
                return (
                  <button
                    key={session.id}
                    type="button"
                    className={`rounded-xl border p-3 text-left transition ${
                      selected
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                        : session.status === 'cancelled'
                          ? 'border-slate-200 bg-slate-50 opacity-60'
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                    }`}
                    onClick={() => setSessionId(session.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                          <Clock3 className="h-4 w-4 text-blue-600" />
                          {sessionTimeLabel(session)}
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-800">
                          {session.class?.name ?? session.course?.name ?? '临时课次'}
                        </div>
                      </div>
                      <StatusPill
                        tone={statusToTone(session.status)}
                        label={sessionStatusLabel(session.status)}
                      />
                    </div>
                    <div className="text-muted-foreground mt-2 line-clamp-1 text-xs">
                      {session.topic || '未填写课程主题'}
                    </div>
                    <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {session.teacher?.name ?? '未排老师'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {session.classroom?.name ?? '未排教室'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {selectedSession && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="resource-card p-4">
            <div className="text-muted-foreground text-xs">总学员数</div>
            <div className="mt-2 text-2xl font-semibold">{attendanceSummary.total}</div>
          </div>
          <div className="resource-card p-4">
            <div className="text-muted-foreground text-xs">已点名</div>
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
            <div className="text-muted-foreground text-xs">迟到</div>
            <div className="mt-2 text-2xl font-semibold text-orange-600">
              {attendanceSummary.statuses.late}
            </div>
          </div>
          <div className="resource-card p-4">
            <div className="text-muted-foreground text-xs">请假</div>
            <div className="mt-2 text-2xl font-semibold text-amber-600">
              {attendanceSummary.statuses.leave}
            </div>
          </div>
          <div className="resource-card p-4">
            <div className="text-muted-foreground text-xs">未到</div>
            <div className="mt-2 text-2xl font-semibold text-red-600">
              {attendanceSummary.statuses.absent}
            </div>
          </div>
        </div>
      )}

      <div className="resource-card">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-semibold">后台点名与消课</div>
          <div className="text-muted-foreground mt-1 text-xs">
            后台用于查看和修正点名结果。到课、迟到固定扣 1
            课时；未到可单独选择是否扣课；请假不扣课时。历史补课、试听记录按到课兼容统计。
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
              const requiredLessonUnits = selectedSession?.lessonUnits ?? 1;
              const lessonSources = (lessonSourcesByStudentId[entry.studentId] ?? []).filter(
                (source) =>
                  source.studentId === entry.studentId && source.courseId === entry.billingCourseId,
              );
              const automaticLessonSource = lessonSources.find(
                (source) => source.remainingLessonCount >= requiredLessonUnits,
              );
              const configuredLessonSource = lessonSources.find(
                (source) =>
                  source.id === entry.billingCourseContractId &&
                  source.remainingLessonCount >= requiredLessonUnits,
              );
              const recommendedLessonSource = configuredLessonSource ?? automaticLessonSource;
              const currentSourceMissing = Boolean(
                record?.lessonSource &&
                !lessonSources.some((source) => source.id === record.lessonSource?.id),
              );
              const selectedLessonSource = draft.courseContractId
                ? (lessonSources.find((source) => source.id === draft.courseContractId) ??
                  (record?.lessonSource?.id === draft.courseContractId
                    ? record.lessonSource
                    : null))
                : recommendedLessonSource;
              const canOverrideLessonSource = lessonSources.length > 1 || currentSourceMissing;
              const sourcePickerOpen =
                canOverrideLessonSource && sourcePickerStudentId === entry.studentId;
              return (
                <div
                  key={`${entry.source}-${entry.id}`}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[0.9fr_1.25fr_1.35fr_1.1fr_auto]"
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
                  <div className="grid grid-cols-4 gap-1" aria-label="点名状态">
                    {STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={draft.status === option.value}
                        className={`rounded-lg border px-1.5 py-2 text-xs font-medium transition ${statusButtonClass(
                          option.value,
                          draft.status === option.value,
                        )}`}
                        onClick={() => updateDraft(entry.studentId, { status: option.value })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      disabled={!canOverrideLessonSource}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition ${
                        sourcePickerOpen
                          ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100'
                          : canOverrideLessonSource
                            ? 'border-slate-200 bg-white hover:border-blue-300'
                            : 'cursor-default border-slate-200 bg-slate-50'
                      }`}
                      onClick={() => {
                        if (canOverrideLessonSource) {
                          setSourcePickerStudentId(sourcePickerOpen ? '' : entry.studentId);
                        }
                      }}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
                          <WalletCards className="h-3.5 w-3.5 text-blue-600" />
                          {lessonSources.length === 0 ? '无可用课时包' : '扣课课时包'}
                        </span>
                        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                          {selectedLessonSource
                            ? `${selectedLessonSource.packageName ?? selectedLessonSource.title} · 余额 ${formatPackageLessonBalance(selectedLessonSource.remainingLessonCount, selectedLessonSource.lessonCount)}`
                            : lessonSources.length > 0
                              ? `${lessonSources[0].packageName ?? lessonSources[0].title} · 余额不足，不可扣课`
                              : '请先为学员配置可用课时包'}
                        </span>
                      </span>
                      {canOverrideLessonSource ? (
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-slate-400 transition ${sourcePickerOpen ? 'rotate-180' : ''}`}
                        />
                      ) : lessonSources.length === 1 && recommendedLessonSource ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : null}
                    </button>
                    {sourcePickerOpen && canOverrideLessonSource ? (
                      <div className="mt-2 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
                        {currentSourceMissing && record?.lessonSource ? (
                          <button
                            type="button"
                            className="w-full rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-left text-xs text-amber-800"
                            onClick={() => {
                              updateDraft(entry.studentId, {
                                courseContractId: record.lessonSource?.id ?? '',
                              });
                              setSourcePickerStudentId('');
                            }}
                          >
                            <span className="block font-medium">
                              {record.lessonSource.packageName ?? record.lessonSource.title}
                            </span>
                            <span className="mt-0.5 block opacity-75">当前历史扣课来源</span>
                          </button>
                        ) : null}
                        {lessonSources.map((source) => (
                          <button
                            key={source.id}
                            type="button"
                            disabled={source.remainingLessonCount < requiredLessonUnits}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-45 ${
                              draft.courseContractId === source.id
                                ? 'border-blue-400 bg-blue-50 text-blue-700'
                                : 'border-transparent bg-white text-slate-700 hover:border-blue-200'
                            }`}
                            onClick={() => {
                              updateDraft(entry.studentId, { courseContractId: source.id });
                              setSourcePickerStudentId('');
                            }}
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium">
                                {source.packageName ?? source.title}
                              </span>
                              <span className="mt-0.5 block opacity-75">
                                余额{' '}
                                {formatPackageLessonBalance(
                                  source.remainingLessonCount,
                                  source.lessonCount,
                                )}
                                {source.endsAt
                                  ? ` · ${new Date(source.endsAt).toLocaleDateString('zh-CN')} 到期`
                                  : ''}
                              </span>
                            </span>
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">
                              {source.billingType === 'period'
                                ? source.id === recommendedLessonSource?.id
                                  ? '周期卡 · 推荐'
                                  : '周期卡'
                                : source.id === recommendedLessonSource?.id
                                  ? '推荐'
                                  : '课时包'}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {canOverrideLessonSource ? (
                      <div className="text-muted-foreground mt-1 text-[11px]">
                        仅显示该学员当前课程下实际拥有的课时包；可切换扣课来源
                      </div>
                    ) : lessonSources.length === 1 && recommendedLessonSource ? (
                      <div className="text-muted-foreground mt-1 text-[11px]">
                        已定位到该学员当前可用课时包
                      </div>
                    ) : lessonSources.length === 1 ? (
                      <div className="mt-1 text-[11px] text-amber-600">
                        该课时包余额不足，本课次不能从此来源扣课
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <input
                      className="form-input"
                      placeholder="备注"
                      value={draft.note}
                      onChange={(event) =>
                        updateDraft(entry.studentId, { note: event.target.value })
                      }
                    />
                    {draft.status === 'absent' ? (
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={draft.deductLesson}
                          onChange={(event) =>
                            updateDraft(entry.studentId, {
                              deductLesson: event.target.checked,
                            })
                          }
                        />
                        未到扣 1 课时
                      </label>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                    {record ? (
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        已点名 · {STATUS_LABEL[record.status]}
                        {record.status === 'absent' && record.lessonDelta === 0 ? ' · 未扣课' : ''}
                        {record.lessonDelta < 0
                          ? ` · ${record.lessonSource?.packageName ?? record.lessonSource?.title ?? '其他课时余额'}`
                          : ''}
                      </span>
                    ) : null}
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
                      {record ? '保存修改' : '补点/核销'}
                    </button>
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
