import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { api } from '@/api/client';
import type { Course } from '@/api/types';
import { PageFrame } from '@/components/layout/PageFrame';
import { DataTable } from '@/components/shared/DataTable';
import { useToast } from '@/components/shared/Toast';
import { useApiResource } from '@/lib/useApiResource';

interface StudentAttendanceStat {
  studentId: string;
  total: number;
  present: number;
  absent: number;
  leave: number;
  makeup: number;
  trial: number;
}

interface CourseAttendanceSummary {
  course: Course;
  sessions: Array<{ id: string; topic: string; startsAt: string; status: string }>;
  sessionCount: number;
  studentStats: StudentAttendanceStat[];
  summary: {
    totalSessions: number;
    totalRecords: number;
    uniqueStudents: number;
  };
}

export function CourseAttendanceSummaryPage() {
  const toast = useToast();
  const { data: courses } = useApiResource<Course>('/v1/courses', 'courses');
  const [courseId, setCourseId] = useState('');
  const [summaryData, setSummaryData] = useState<CourseAttendanceSummary | null>(null);
  const [loading, setLoading] = useState(false);

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
              <div className="text-muted-foreground text-xs">总签到</div>
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
              <div className="text-sm font-semibold">学员出勤详情</div>
              <div className="text-muted-foreground mt-1 text-xs">
                共 {summaryData.summary.totalSessions} 次课，统计学员出勤情况
              </div>
            </div>
            {loading ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载中...
              </div>
            ) : (
              <DataTable
                columns={[
                  {
                    key: 'studentId',
                    header: '学员 ID',
                    cell: (row) => row.studentId.slice(0, 8),
                  },
                  {
                    key: 'total',
                    header: '总签到',
                    cell: (row: StudentAttendanceStat) => (
                      <div className="flex items-center gap-1">
                        <span>{row.total}</span>
                        <span className="text-muted-foreground text-xs">/ {summaryData.summary.totalSessions}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'present',
                    header: '到课',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="text-green-600">{row.present}</span>
                    ),
                  },
                  {
                    key: 'absent',
                    header: '缺勤',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="text-red-600">{row.absent}</span>
                    ),
                  },
                  {
                    key: 'leave',
                    header: '请假',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="text-amber-600">{row.leave}</span>
                    ),
                  },
                  {
                    key: 'makeup',
                    header: '补课',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="text-purple-600">{row.makeup}</span>
                    ),
                  },
                  {
                    key: 'trial',
                    header: '试听',
                    cell: (row: StudentAttendanceStat) => (
                      <span className="text-gray-600">{row.trial}</span>
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
          该课程没有已完成的课次
        </div>
      )}
    </PageFrame>
  );
}
