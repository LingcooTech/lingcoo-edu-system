import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { api } from '@/api/client';
import type { Course } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';
import { formatDateTime } from '@/lib/utils';

interface StudentAttendanceStat {
  studentId: string;
  name: string;
  total: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  makeup: number;
  trial: number;
}

interface SessionRecord {
  session: { id: string; topic: string; startsAt: string; status: string };
  total: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  makeup: number;
  trial: number;
}

interface CourseAttendanceSummary {
  course: Course;
  sessionCount: number;
  studentStats: StudentAttendanceStat[];
  sessionRecords: SessionRecord[];
  summary: {
    totalSessions: number;
    totalRecords: number;
    uniqueStudents: number;
  };
}

type TabType = 'sessions' | 'students';

function displayedPresent(row: Pick<StudentAttendanceStat, 'present' | 'makeup' | 'trial'>) {
  return row.present + row.makeup + row.trial;
}

export function CourseAttendanceSummaryPage() {
  const toast = useToast();
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const [courseId, setCourseId] = useState('');
  const [summaryData, setSummaryData] = useState<CourseAttendanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('sessions');

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => course.status !== 'archived');
  }, [courses]);

  useEffect(() => {
    if (!courseId) {
      setSummaryData(null);
      return;
    }

    setLoading(true);
    api<CourseAttendanceSummary>(`/v1/courses/${courseId}/attendance-summary`)
      .then((data) => setSummaryData(data))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : '加载课程出勤数据失败');
        setSummaryData(null);
      })
      .finally(() => setLoading(false));
  }, [courseId, toast]);

  return (
    <PageFrame section="courseAttendance">
      <div className="resource-card mb-4 p-4">
        <label className="form-label">选择课程</label>
        <select
          className="form-input"
          value={courseId}
          onChange={(event) => setCourseId(event.target.value)}
        >
          <option value="">请选择课程</option>
          {filteredCourses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </select>
      </div>

      {summaryData && (
        <>
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <strong>统计说明：</strong>仅统计有出勤记录的课次和学员。共有{' '}
            <strong>{summaryData.summary.totalSessions}</strong>{' '}
            次课完成了点名。历史补课、试听记录按到课统计。
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="resource-card p-4">
              <div className="text-muted-foreground text-xs">总课次</div>
              <div className="mt-2 text-2xl font-semibold">{summaryData.summary.totalSessions}</div>
            </div>
            <div className="resource-card p-4">
              <div className="text-muted-foreground text-xs">参加学员</div>
              <div className="mt-2 text-2xl font-semibold text-blue-600">
                {summaryData.summary.uniqueStudents}
              </div>
            </div>
            <div className="resource-card p-4">
              <div className="text-muted-foreground text-xs">总点名</div>
              <div className="mt-2 text-2xl font-semibold text-green-600">
                {summaryData.summary.totalRecords}
              </div>
            </div>
            <div className="resource-card p-4">
              <div className="text-muted-foreground text-xs">平均出勤率</div>
              <div className="mt-2 text-2xl font-semibold">
                {summaryData.summary.totalSessions > 0
                  ? (
                      ((summaryData.summary.totalRecords /
                        (summaryData.summary.uniqueStudents * summaryData.summary.totalSessions)) *
                        100) |
                      0
                    ).toFixed(1)
                  : 0}
                %
              </div>
            </div>
          </div>

          <div className="resource-card">
            <div className="border-b px-4 py-3">
              <div className="flex gap-4">
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === 'sessions'
                      ? 'border-primary text-foreground border-b-2'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('sessions')}
                >
                  课程进度 ({summaryData.summary.totalSessions} 次课)
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === 'students'
                      ? 'border-primary text-foreground border-b-2'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveTab('students')}
                >
                  学员出勤 ({summaryData.summary.uniqueStudents} 人)
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载中...
              </div>
            ) : activeTab === 'sessions' ? (
              <DataTable
                columns={[
                  {
                    key: 'session',
                    header: '课次信息',
                    cell: (row: SessionRecord) => (
                      <div className="cell-stack">
                        <span className="cell-title">{row.session.topic}</span>
                        <span className="cell-subtitle">
                          {formatDateTime(row.session.startsAt)}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'total',
                    header: '到课人数',
                    cell: (row: SessionRecord) => (
                      <div className="text-center">
                        <span className="text-lg font-semibold text-green-600">
                          {displayedPresent(row)}
                        </span>
                        <span className="text-muted-foreground text-xs">/ {row.total}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'late',
                    header: '迟到',
                    cell: (row: SessionRecord) => (
                      <span className="font-medium text-orange-600">{row.late}</span>
                    ),
                  },
                  {
                    key: 'leave',
                    header: '请假',
                    cell: (row: SessionRecord) => (
                      <span className="font-medium text-amber-600">{row.leave}</span>
                    ),
                  },
                  {
                    key: 'absent',
                    header: '未到',
                    cell: (row: SessionRecord) => (
                      <span className="font-medium text-red-600">{row.absent}</span>
                    ),
                  },
                  {
                    key: 'rate',
                    header: '出勤率',
                    cell: (row: SessionRecord) => (
                      <span className="font-medium">
                        {row.total > 0
                          ? (((displayedPresent(row) + row.late) / row.total) * 100) | 0
                          : 0}
                        %
                      </span>
                    ),
                  },
                ]}
                data={summaryData.sessionRecords}
              />
            ) : (
              <DataTable
                columns={[
                  {
                    key: 'name',
                    header: '学员姓名',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="font-medium">{row.name}</span>
                    ),
                  },
                  {
                    key: 'total',
                    header: '总点名',
                    cell: (row: StudentAttendanceStat) => (
                      <div className="text-center">
                        <span className="text-lg font-semibold text-blue-600">{row.total}</span>
                        <span className="text-muted-foreground text-xs">
                          / {summaryData.summary.totalSessions}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: 'present',
                    header: '到课',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="font-medium text-green-600">{displayedPresent(row)}</span>
                    ),
                  },
                  {
                    key: 'late',
                    header: '迟到',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="font-medium text-orange-600">{row.late}</span>
                    ),
                  },
                  {
                    key: 'leave',
                    header: '请假',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="font-medium text-amber-600">{row.leave}</span>
                    ),
                  },
                  {
                    key: 'absent',
                    header: '未到',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="font-medium text-red-600">{row.absent}</span>
                    ),
                  },
                  {
                    key: 'rate',
                    header: '出勤率',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="font-medium">
                        {summaryData.summary.totalSessions > 0
                          ? ((row.total / summaryData.summary.totalSessions) * 100) | 0
                          : 0}
                        %
                      </span>
                    ),
                  },
                ]}
                data={summaryData.studentStats}
              />
            )}
          </div>
        </>
      )}

      {!loading && !summaryData && courseId && (
        <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
          该课程没有已完成点名的课次。请检查：
          <div className="mt-2 space-y-1 text-xs">
            <div>• 该课程是否已排课</div>
            <div>• 已排课次是否已标记为"已完成"</div>
            <div>• 已完成课次是否已进行点名</div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
