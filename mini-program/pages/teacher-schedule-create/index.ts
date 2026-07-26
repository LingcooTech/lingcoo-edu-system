import {
  addTeacherClassSessionStudent,
  createTeacherClassSession,
  fetchTeacherClass,
  fetchTeacherClassSession,
  fetchTeacherSchedulingOptions,
  removeTeacherClassSessionStudent,
  searchTeacherStudents,
  updateTeacherClassSession,
  type TeacherClass,
  type TeacherSessionDetail,
  type TeacherSchedulingOptions,
  type TeacherStudentSearchItem,
} from '../../services/api';

type PickerEvent = {
  currentTarget: { dataset: Record<string, string | undefined> };
  detail: { value: string };
};
type InputEvent = { detail: { value: string } };
type TapEvent = { currentTarget: { dataset: Record<string, string | undefined> } };

type StudentRow = TeacherStudentSearchItem & {
  selected: boolean;
  enrollmentMode: 'class' | 'session_only';
  balanceLabel: string;
  searchText: string;
  selectable: boolean;
  canRemove: boolean;
  billingOptions: BillingOption[];
  billingIndex: number;
  billingCourseId: string;
};

type ClassStudentRow = TeacherClass['students'][number] & {
  selected: boolean;
  balanceLabel: string;
  canRemove: boolean;
  billingOptions: BillingOption[];
  billingIndex: number;
  billingCourseId: string;
};

type BillingOption = {
  id: string;
  label: string;
  balance: number;
};

const SESSION_STATUS_OPTIONS = [
  { value: 'scheduled' as const, label: '待上课' },
  { value: 'completed' as const, label: '已完成' },
  { value: 'cancelled' as const, label: '已取消' },
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function defaultTime() {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 90 * 60 * 1000);
  return {
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
  };
}

function toIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}

function billingOptions(student?: TeacherStudentSearchItem): BillingOption[] {
  return (student?.lessonAccounts ?? []).map((account) => ({
    id: account.courseId,
    label: `${account.courseName} · 余 ${account.balance}`,
    balance: account.balance,
  }));
}

function resolveBillingSelection(options: BillingOption[], preferredCourseId = '') {
  const billingIndex = Math.max(
    options.findIndex((option) => option.id === preferredCourseId),
    0,
  );
  return {
    billingIndex,
    billingCourseId: options[billingIndex]?.id ?? '',
    balanceLabel: options.length > 0 ? String(options[billingIndex]?.balance ?? '-') : '无可用档案',
  };
}

Page({
  data: {
    loading: true,
    saving: false,
    sessionId: '',
    editing: false,
    editable: true,
    canEditStatus: false,
    sessionDetail: null as TeacherSessionDetail | null,
    sessionStatusOptions: SESSION_STATUS_OPTIONS,
    sessionStatusIndex: 0,
    initialRosterStudentIds: [] as string[],
    initialBillingCourseByStudentId: {} as Record<string, string>,
    initialEnrollmentModeByStudentId: {} as Record<string, 'class' | 'session_only'>,
    requestedClassId: '',
    options: null as TeacherSchedulingOptions | null,
    modeOptions: [] as Array<{ key: 'class' | 'ad_hoc'; label: string }>,
    modeIndex: 0,
    classIndex: 0,
    courseIndex: 0,
    classDisplayName: '',
    courseDisplayName: '',
    classroomDisplayName: '',
    classroomIndex: 0,
    date: defaultTime().date,
    startTime: defaultTime().startTime,
    endTime: defaultTime().endTime,
    topic: '',
    lessonUnits: 1,
    keyword: '',
    studentLoading: false,
    classStudents: [] as ClassStudentRow[],
    selectedClassStudentIds: [] as string[],
    allOtherStudents: [] as StudentRow[],
    students: [] as StudentRow[],
    selectedOtherStudentIds: [] as string[],
    selectedCount: 0,
    totalStudents: 0,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const sessionId = String(query.sessionId || '');
    this.setData({
      sessionId,
      editing: Boolean(sessionId),
      requestedClassId: String(query.classId || ''),
    });
    this.loadOptions();
  },

  async loadOptions() {
    this.setData({ loading: true, error: '' });
    try {
      const [options, sessionDetail] = await Promise.all([
        fetchTeacherSchedulingOptions(),
        this.data.sessionId ? fetchTeacherClassSession(this.data.sessionId) : Promise.resolve(null),
      ]);
      const modeOptions: Array<{ key: 'class' | 'ad_hoc'; label: string }> = [];
      if (options.permissions.createClassSession && options.classes.length > 0) {
        modeOptions.push({ key: 'class', label: '正式班级课次' });
      }
      if (options.permissions.createAdHocSession) {
        modeOptions.push({ key: 'ad_hoc', label: '临时课次' });
      }
      if (sessionDetail?.class && !modeOptions.some((mode) => mode.key === 'class')) {
        modeOptions.push({ key: 'class', label: '正式班级课次' });
      }
      if (
        sessionDetail &&
        !sessionDetail.class &&
        !modeOptions.some((mode) => mode.key === 'ad_hoc')
      ) {
        modeOptions.push({ key: 'ad_hoc', label: '临时课次' });
      }
      if (modeOptions.length === 0) {
        throw new Error('当前账号尚未开通排课权限');
      }
      const requestedClassId = sessionDetail?.class?.id || this.data.requestedClassId;
      const requestedClassIndex = options.classes.findIndex(
        (classGroup) => classGroup.id === requestedClassId,
      );
      const classModeIndex = modeOptions.findIndex((mode) => mode.key === 'class');
      const adHocModeIndex = modeOptions.findIndex((mode) => mode.key === 'ad_hoc');
      const courseIndex = sessionDetail
        ? Math.max(
            options.courses.findIndex((course) => course.id === sessionDetail.course.id),
            0,
          )
        : 0;
      const classroomIndex = sessionDetail
        ? Math.max(
            options.classrooms.findIndex(
              (classroom) => classroom.id === sessionDetail.session.classroomId,
            ),
            0,
          )
        : 0;
      const sessionStart = sessionDetail ? new Date(sessionDetail.session.startsAt) : null;
      const sessionEnd = sessionDetail ? new Date(sessionDetail.session.endsAt) : null;
      const initialBillingCourseByStudentId = Object.fromEntries(
        (sessionDetail?.roster ?? []).map((student) => [student.id, student.billingCourseId]),
      );
      const initialEnrollmentModeByStudentId = Object.fromEntries(
        (sessionDetail?.roster ?? []).map((student) => [
          student.id,
          student.source === 'enrollment' ? 'class' : 'session_only',
        ]),
      ) as Record<string, 'class' | 'session_only'>;
      this.setData({
        options,
        modeOptions,
        modeIndex: sessionDetail
          ? sessionDetail.class
            ? Math.max(classModeIndex, 0)
            : Math.max(adHocModeIndex, 0)
          : requestedClassIndex >= 0 && classModeIndex >= 0
            ? classModeIndex
            : 0,
        classIndex: requestedClassIndex >= 0 ? requestedClassIndex : 0,
        courseIndex,
        classDisplayName: sessionDetail?.class?.name ?? '',
        courseDisplayName: sessionDetail?.course.name ?? '',
        classroomDisplayName: sessionDetail?.classroom?.name ?? '',
        classroomIndex,
        sessionDetail,
        editable: sessionDetail?.canEdit ?? true,
        canEditStatus: sessionDetail?.canEditStatus ?? false,
        sessionStatusIndex: sessionDetail
          ? Math.max(
              SESSION_STATUS_OPTIONS.findIndex(
                (option) => option.value === sessionDetail.session.status,
              ),
              0,
            )
          : 0,
        initialRosterStudentIds: (sessionDetail?.roster ?? []).map((student) => student.id),
        initialBillingCourseByStudentId,
        initialEnrollmentModeByStudentId,
        ...(sessionDetail && sessionStart && sessionEnd
          ? {
              date: `${sessionStart.getFullYear()}-${pad(sessionStart.getMonth() + 1)}-${pad(
                sessionStart.getDate(),
              )}`,
              startTime: `${pad(sessionStart.getHours())}:${pad(sessionStart.getMinutes())}`,
              endTime: `${pad(sessionEnd.getHours())}:${pad(sessionEnd.getMinutes())}`,
              topic: sessionDetail.session.topic,
              lessonUnits: sessionDetail.session.lessonUnits ?? 1,
            }
          : {}),
        loading: false,
      });
      if (!sessionDetail) this.applyModeDefaults();
      await this.loadStudents();
    } catch (error) {
      this.setData({
        loading: false,
        error: error instanceof Error ? error.message : '排课信息加载失败',
      });
    }
  },

  currentMode(): 'class' | 'ad_hoc' {
    return this.data.modeOptions[this.data.modeIndex]?.key ?? 'class';
  },

  currentCourseId() {
    const options = this.data.options;
    if (!options) return '';
    const sessionDetail = this.data.sessionDetail as TeacherSessionDetail | null;
    if (this.data.editing && sessionDetail) {
      return sessionDetail.course.id;
    }
    if (this.currentMode() === 'class') {
      return options.classes[this.data.classIndex]?.courseId ?? '';
    }
    return options.courses[this.data.courseIndex]?.id ?? '';
  },

  applyModeDefaults() {
    const options = this.data.options;
    if (!options) return;
    if (this.currentMode() === 'class') {
      const classGroup = options.classes[this.data.classIndex];
      const classroomIndex = Math.max(
        options.classrooms.findIndex(
          (item: TeacherSchedulingOptions['classrooms'][number]) =>
            item.id === classGroup?.classroomId,
        ),
        0,
      );
      this.setData({ classroomIndex, topic: classGroup?.course?.name ?? classGroup?.name ?? '' });
    } else {
      this.setData({ topic: options.courses[this.data.courseIndex]?.name ?? '' });
    }
  },

  async changeMode(event: PickerEvent) {
    this.setData({
      modeIndex: Number(event.detail.value),
      keyword: '',
      classStudents: [],
      selectedClassStudentIds: [],
      allOtherStudents: [],
      students: [],
      selectedOtherStudentIds: [],
      selectedCount: 0,
      totalStudents: 0,
    });
    this.applyModeDefaults();
    await this.loadStudents();
  },

  async changeClass(event: PickerEvent) {
    this.setData({
      classIndex: Number(event.detail.value),
      keyword: '',
      classStudents: [],
      selectedClassStudentIds: [],
      allOtherStudents: [],
      students: [],
      selectedOtherStudentIds: [],
      selectedCount: 0,
      totalStudents: 0,
    });
    this.applyModeDefaults();
    await this.loadStudents();
  },

  async changeCourse(event: PickerEvent) {
    this.setData({
      courseIndex: Number(event.detail.value),
      keyword: '',
      classStudents: [],
      selectedClassStudentIds: [],
      allOtherStudents: [],
      students: [],
      selectedOtherStudentIds: [],
      selectedCount: 0,
      totalStudents: 0,
    });
    this.applyModeDefaults();
    await this.loadStudents();
  },

  changeClassroom(event: PickerEvent) {
    this.setData({ classroomIndex: Number(event.detail.value) });
  },

  changeDate(event: PickerEvent) {
    this.setData({ date: event.detail.value });
  },

  changeStartTime(event: PickerEvent) {
    this.setData({ startTime: event.detail.value });
  },

  changeEndTime(event: PickerEvent) {
    this.setData({ endTime: event.detail.value });
  },

  changeTopic(event: InputEvent) {
    this.setData({ topic: event.detail.value });
  },

  changeKeyword(event: InputEvent) {
    this.setData({ keyword: event.detail.value });
  },

  applyStudentSearch() {
    const keyword = String(this.data.keyword || '')
      .trim()
      .toLocaleLowerCase('zh-CN');
    const selectedIds = new Set(this.data.selectedOtherStudentIds as string[]);
    const students = (this.data.allOtherStudents as StudentRow[])
      .filter((student) => !keyword || student.searchText.includes(keyword))
      .map((student) => ({
        ...student,
        selected: selectedIds.has(student.id),
      }));
    this.setData({ students });
  },

  decreaseUnits() {
    this.setData({ lessonUnits: Math.max(0, this.data.lessonUnits - 1) });
  },

  increaseUnits() {
    this.setData({ lessonUnits: Math.min(10, this.data.lessonUnits + 1) });
  },

  async loadStudents() {
    const options = this.data.options;
    const courseId = this.currentCourseId();
    if (!options || !courseId) return;
    this.setData({ studentLoading: true, error: '' });
    try {
      const classOption =
        this.currentMode() === 'class' ? options.classes[this.data.classIndex] : undefined;
      const sessionDetail = this.data.sessionDetail as TeacherSessionDetail | null;
      const classId = sessionDetail?.class?.id || classOption?.id || '';
      const classPayload = classId ? await fetchTeacherClass(classId) : null;

      const fetched: TeacherStudentSearchItem[] = [];
      if (options.permissions.viewAllStudents) {
        const pageSize = 50;
        let page = 1;
        let total = 0;
        do {
          const result = await searchTeacherStudents({ page, pageSize });
          total = result.total;
          fetched.push(...result.students);
          if (result.students.length === 0) break;
          page += 1;
        } while (fetched.length < total);
      }

      const fetchedById = new Map(fetched.map((student) => [student.id, student]));
      const rosterById = new Map<string, TeacherSessionDetail['roster'][number]>(
        (sessionDetail?.roster ?? []).map((student) => [student.id, student]),
      );
      const editing = this.data.editing;
      const classStudents = (classPayload?.class.students ?? []).map((student) => {
        const rosterStudent = rosterById.get(student.id);
        const optionsForStudent = billingOptions(fetchedById.get(student.id));
        const preferredCourseId =
          rosterStudent?.billingCourseId ||
          student.billingCourseId ||
          (optionsForStudent.some((option) => option.id === courseId) ? courseId : '');
        return {
          ...student,
          selected: editing ? Boolean(rosterStudent) : true,
          canRemove: rosterStudent?.canRemove ?? true,
          billingOptions: optionsForStudent,
          ...resolveBillingSelection(optionsForStudent, preferredCourseId),
        };
      });
      const memberIds = new Set(classStudents.map((student) => student.id));
      const allOtherStudents = fetched
        .filter((student) => !memberIds.has(student.id))
        .map((student) => {
          const rosterStudent = rosterById.get(student.id);
          const optionsForStudent = billingOptions(student);
          const preferredCourseId =
            rosterStudent?.billingCourseId ||
            (optionsForStudent.some((option) => option.id === courseId) ? courseId : '');
          return {
            ...student,
            selected: Boolean(rosterStudent),
            enrollmentMode:
              rosterStudent?.source === 'enrollment'
                ? ('class' as const)
                : ('session_only' as const),
            selectable: optionsForStudent.length > 0,
            canRemove: rosterStudent?.canRemove ?? true,
            billingOptions: optionsForStudent,
            ...resolveBillingSelection(optionsForStudent, preferredCourseId),
            searchText: [student.name, student.grade, student.school]
              .filter(Boolean)
              .join(' ')
              .toLocaleLowerCase('zh-CN'),
          };
        });
      const selectedClassStudentIds = classStudents
        .filter((student) => student.selected)
        .map((student) => student.id);
      const selectedOtherStudentIds = allOtherStudents
        .filter((student) => student.selected)
        .map((student) => student.id);
      this.setData({
        classStudents,
        selectedClassStudentIds,
        allOtherStudents,
        selectedOtherStudentIds,
        selectedCount: selectedClassStudentIds.length + selectedOtherStudentIds.length,
        totalStudents: allOtherStudents.length,
      });
      this.applyStudentSearch();
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '学员加载失败' });
    } finally {
      this.setData({ studentLoading: false });
    }
  },

  toggleClassStudent(event: TapEvent) {
    if (this.data.editing && !this.data.editable) return;
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    const selectedIds = new Set(this.data.selectedClassStudentIds as string[]);
    if (selectedIds.has(id)) {
      const student = (this.data.classStudents as ClassStudentRow[]).find((item) => item.id === id);
      if (this.data.editing && student && !student.canRemove) {
        wx.showToast({ title: '该学员已点名，不能移出课次', icon: 'none' });
        return;
      }
      selectedIds.delete(id);
    } else {
      const student = (this.data.classStudents as ClassStudentRow[]).find((item) => item.id === id);
      if (!student?.billingCourseId) {
        wx.showToast({ title: '该学员暂无可扣课档案', icon: 'none' });
        return;
      }
      const classroom = this.data.options?.classrooms[this.data.classroomIndex];
      if (classroom && this.data.selectedCount >= classroom.capacity) {
        wx.showToast({ title: '已达到教室容量', icon: 'none' });
        return;
      }
      selectedIds.add(id);
    }
    const selectedClassStudentIds = Array.from(selectedIds);
    const classStudents = (this.data.classStudents as ClassStudentRow[]).map((student) => ({
      ...student,
      selected: selectedIds.has(student.id),
    }));
    this.setData({
      classStudents,
      selectedClassStudentIds,
      selectedCount:
        selectedClassStudentIds.length + (this.data.selectedOtherStudentIds as string[]).length,
    });
  },

  toggleStudent(event: TapEvent) {
    if (this.data.editing && !this.data.editable) return;
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    const student = (this.data.allOtherStudents as StudentRow[]).find((item) => item.id === id);
    if (!student) return;
    if (!student.selectable) {
      wx.showToast({ title: '该学员暂无本课程正式档案', icon: 'none' });
      return;
    }
    const selectedIds = new Set(this.data.selectedOtherStudentIds as string[]);
    if (selectedIds.has(id)) {
      if (this.data.editing && !student.canRemove) {
        wx.showToast({ title: '该学员已点名，不能移出课次', icon: 'none' });
        return;
      }
      selectedIds.delete(id);
    } else {
      const classroom = this.data.options?.classrooms[this.data.classroomIndex];
      if (classroom && this.data.selectedCount >= classroom.capacity) {
        wx.showToast({ title: '已达到教室容量', icon: 'none' });
        return;
      }
      selectedIds.add(id);
    }
    const selectedOtherStudentIds = Array.from(selectedIds);
    const updateStudent = (item: StudentRow) => ({
      ...item,
      selected: selectedIds.has(item.id),
    });
    this.setData({
      allOtherStudents: (this.data.allOtherStudents as StudentRow[]).map(updateStudent),
      students: (this.data.students as StudentRow[]).map(updateStudent),
      selectedOtherStudentIds,
      selectedCount:
        (this.data.selectedClassStudentIds as string[]).length + selectedOtherStudentIds.length,
    });
  },

  changeClassStudentBilling(event: PickerEvent) {
    if (this.data.editing && !this.data.editable) return;
    const id = String(event.currentTarget.dataset.id || '');
    const billingIndex = Number(event.detail.value);
    const classStudents = (this.data.classStudents as ClassStudentRow[]).map((student) =>
      student.id === id
        ? {
            ...student,
            billingIndex,
            billingCourseId: student.billingOptions[billingIndex]?.id ?? '',
            balanceLabel: String(student.billingOptions[billingIndex]?.balance ?? '-'),
          }
        : student,
    );
    this.setData({ classStudents });
  },

  changeStudentBilling(event: PickerEvent) {
    if (this.data.editing && !this.data.editable) return;
    const id = String(event.currentTarget.dataset.id || '');
    const billingIndex = Number(event.detail.value);
    const updateStudent = (student: StudentRow) =>
      student.id === id
        ? {
            ...student,
            billingIndex,
            billingCourseId: student.billingOptions[billingIndex]?.id ?? '',
            balanceLabel: String(student.billingOptions[billingIndex]?.balance ?? '-'),
          }
        : student;
    this.setData({
      allOtherStudents: (this.data.allOtherStudents as StudentRow[]).map(updateStudent),
      students: (this.data.students as StudentRow[]).map(updateStudent),
    });
  },

  toggleEnrollmentMode(event: TapEvent) {
    if (this.data.editing && !this.data.editable) return;
    if (this.currentMode() !== 'class') return;
    const id = String(event.currentTarget.dataset.id || '');
    const updateStudent = (student: StudentRow) =>
      student.id === id
        ? {
            ...student,
            enrollmentMode:
              student.enrollmentMode === 'class' ? ('session_only' as const) : ('class' as const),
          }
        : student;
    this.setData({
      allOtherStudents: (this.data.allOtherStudents as StudentRow[]).map(updateStudent),
      students: (this.data.students as StudentRow[]).map(updateStudent),
    });
  },

  changeSessionStatus(event: PickerEvent) {
    this.setData({ sessionStatusIndex: Number(event.detail.value) });
  },

  async submit() {
    if (this.data.saving) return;
    const options = this.data.options;
    if (!options) return;
    const selectedSessionStatus =
      this.data.sessionStatusOptions[this.data.sessionStatusIndex]?.value ?? 'scheduled';
    const sessionDetail = this.data.sessionDetail as TeacherSessionDetail | null;
    if (this.data.editing && this.data.sessionId && !this.data.editable) {
      if (!this.data.canEditStatus) {
        wx.showToast({ title: '该课次当前不可修改', icon: 'none' });
        return;
      }
      if (selectedSessionStatus === sessionDetail?.session.status) {
        wx.showToast({ title: '课次状态没有修改', icon: 'none' });
        return;
      }
      this.setData({ saving: true, error: '' });
      try {
        await updateTeacherClassSession(this.data.sessionId, {
          status: selectedSessionStatus,
        });
        wx.showToast({ title: '课次状态已更新', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
      } catch (error) {
        this.setData({ error: error instanceof Error ? error.message : '状态修改失败' });
      } finally {
        this.setData({ saving: false });
      }
      return;
    }
    const courseId = this.currentCourseId();
    const classroom = options.classrooms[this.data.classroomIndex];
    const selectedClassStudentIds = new Set(this.data.selectedClassStudentIds as string[]);
    const selectedOtherStudentIds = new Set(this.data.selectedOtherStudentIds as string[]);
    const selectedClassStudents = (this.data.classStudents as ClassStudentRow[]).filter((student) =>
      selectedClassStudentIds.has(student.id),
    );
    const selectedOtherStudents = (this.data.allOtherStudents as StudentRow[]).filter((student) =>
      selectedOtherStudentIds.has(student.id),
    );
    if (!courseId || !classroom || !this.data.topic.trim()) {
      wx.showToast({ title: '请完整填写课程信息', icon: 'none' });
      return;
    }
    if (selectedClassStudents.length + selectedOtherStudents.length === 0) {
      wx.showToast({ title: '请至少选择一名学员', icon: 'none' });
      return;
    }
    if (
      [...selectedClassStudents, ...selectedOtherStudents].some(
        (student) => !student.billingCourseId,
      )
    ) {
      wx.showToast({ title: '请为每名学员选择扣课课包', icon: 'none' });
      return;
    }
    const startsAt = toIso(this.data.date, this.data.startTime);
    const endsAt = toIso(this.data.date, this.data.endTime);
    if (new Date(endsAt) <= new Date(startsAt)) {
      wx.showToast({ title: '下课时间必须晚于上课时间', icon: 'none' });
      return;
    }
    this.setData({ saving: true, error: '' });
    try {
      const rosterInputs = [
        ...selectedClassStudents.map((student) => ({
          studentId: student.id,
          enrollmentMode: 'class' as const,
          billingCourseId: student.billingCourseId,
        })),
        ...selectedOtherStudents.map((student) => ({
          studentId: student.id,
          enrollmentMode:
            this.currentMode() === 'class' ? student.enrollmentMode : ('session_only' as const),
          billingCourseId: student.billingCourseId,
        })),
      ];
      if (this.data.editing && this.data.sessionId) {
        if (!this.data.editable) {
          wx.showToast({ title: '该课次当前不可修改', icon: 'none' });
          return;
        }
        await updateTeacherClassSession(this.data.sessionId, {
          classroomId: classroom.id,
          startsAt,
          endsAt,
          topic: this.data.topic.trim(),
          lessonUnits: this.data.lessonUnits,
        });
        const currentIds = new Set(rosterInputs.map((student) => student.studentId));
        const removedIds = (this.data.initialRosterStudentIds as string[]).filter(
          (studentId) => !currentIds.has(studentId),
        );
        for (const studentId of removedIds) {
          await removeTeacherClassSessionStudent(this.data.sessionId, studentId);
        }
        for (const student of rosterInputs) {
          const initialBillingCourseId =
            this.data.initialBillingCourseByStudentId[student.studentId];
          const initialEnrollmentMode =
            this.data.initialEnrollmentModeByStudentId[student.studentId];
          if (
            !initialBillingCourseId ||
            initialBillingCourseId !== student.billingCourseId ||
            initialEnrollmentMode !== student.enrollmentMode
          ) {
            await addTeacherClassSessionStudent(this.data.sessionId, student);
          }
        }
        if (selectedSessionStatus !== sessionDetail?.session.status) {
          await updateTeacherClassSession(this.data.sessionId, {
            status: selectedSessionStatus,
          });
        }
        wx.showToast({ title: '课次已更新', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
        return;
      }
      await createTeacherClassSession({
        classId:
          this.currentMode() === 'class'
            ? (options.classes[this.data.classIndex]?.id ?? null)
            : null,
        courseId,
        classroomId: classroom.id,
        startsAt,
        endsAt,
        topic: this.data.topic.trim(),
        lessonUnits: this.data.lessonUnits,
        students: rosterInputs,
      });
      wx.showToast({ title: '课次已添加', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '排课失败' });
    } finally {
      this.setData({ saving: false });
    }
  },

  cancelSession() {
    if (!this.data.sessionId || !this.data.editable || this.data.saving) return;
    wx.showModal({
      title: '取消课次',
      content: '取消后课次会保留在历史记录中，不会进行点名或扣课。确定继续吗？',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ saving: true, error: '' });
        void updateTeacherClassSession(this.data.sessionId, { status: 'cancelled' })
          .then(() => {
            wx.showToast({ title: '课次已取消', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 500);
          })
          .catch((error: unknown) => {
            this.setData({
              error: error instanceof Error ? error.message : '取消课次失败',
            });
          })
          .finally(() => this.setData({ saving: false }));
      },
    });
  },
});
