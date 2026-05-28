export type TenantRole = 'owner' | 'admin' | 'advisor' | 'academic' | 'teacher' | 'finance';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'trial_booked'
  | 'trial_attended'
  | 'paid'
  | 'follow_up'
  | 'invalid';

export type AttendanceStatus = 'present' | 'leave' | 'absent' | 'makeup' | 'trial';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'platform_admin' | 'user';
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  brandName: string;
  phone: string;
  address: string;
}

export interface Campus {
  id: string;
  tenantId: string;
  name: string;
  address: string;
}

export interface TenantMembership {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
}

export interface Channel {
  id: string;
  tenantId: string;
  code: string;
  name: string;
}

export interface Course {
  id: string;
  tenantId: string;
  campusId: string;
  slug: string;
  name: string;
  category: string;
  ageRange: string;
  lessonCount: number;
  durationMinutes: number;
  priceAmount: number;
  status: 'draft' | 'published' | 'archived';
  summary: string;
}

export interface TrialSession {
  id: string;
  tenantId: string;
  campusId: string;
  courseId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  status: 'open' | 'closed' | 'cancelled';
}

export interface Guardian {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
}

export interface Student {
  id: string;
  tenantId: string;
  guardianId: string;
  name: string;
  grade: string;
  school?: string;
  status: 'active' | 'inactive';
}

export interface Lead {
  id: string;
  tenantId: string;
  campusId: string;
  courseId?: string;
  trialSessionId?: string;
  guardianName: string;
  phone: string;
  studentName: string;
  grade: string;
  status: LeadStatus;
  source: string;
  nextFollowUpAt?: string;
  convertedStudentId?: string;
  createdAt: string;
}

export interface FollowUpRecord {
  id: string;
  tenantId: string;
  leadId: string;
  content: string;
  nextFollowUpAt?: string;
  createdAt: string;
}

export interface Teacher {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  specialties: string[];
}

export interface Classroom {
  id: string;
  tenantId: string;
  campusId: string;
  name: string;
  capacity: number;
}

export interface ClassGroup {
  id: string;
  tenantId: string;
  campusId: string;
  courseId: string;
  teacherId: string;
  classroomId: string;
  name: string;
  capacity: number;
  status: 'recruiting' | 'active' | 'completed' | 'paused';
}

export interface ClassEnrollment {
  id: string;
  tenantId: string;
  classId: string;
  studentId: string;
  status: 'active' | 'left';
}

export interface ClassSession {
  id: string;
  tenantId: string;
  classId: string;
  teacherId: string;
  classroomId: string;
  startsAt: string;
  endsAt: string;
  topic: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

export interface AttendanceRecord {
  id: string;
  tenantId: string;
  classSessionId: string;
  studentId: string;
  status: AttendanceStatus;
  lessonDelta: number;
  note?: string;
  createdAt: string;
}

export interface LessonAccount {
  id: string;
  tenantId: string;
  studentId: string;
  courseId: string;
  balance: number;
}

export interface LessonTransaction {
  id: string;
  tenantId: string;
  lessonAccountId: string;
  studentId: string;
  type: 'purchase' | 'consume' | 'refund' | 'adjustment';
  amount: number;
  balanceAfter: number;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  tenantId: string;
  studentId: string;
  courseId: string;
  orderNo: string;
  amount: number;
  paidAmount: number;
  lessonCount: number;
  status: 'pending' | 'paid' | 'refunded' | 'cancelled';
  paidAt?: string;
  createdAt: string;
}

export interface Store {
  users: User[];
  tenants: Tenant[];
  campuses: Campus[];
  memberships: TenantMembership[];
  channels: Channel[];
  courses: Course[];
  trialSessions: TrialSession[];
  guardians: Guardian[];
  students: Student[];
  leads: Lead[];
  followUps: FollowUpRecord[];
  teachers: Teacher[];
  classrooms: Classroom[];
  classes: ClassGroup[];
  enrollments: ClassEnrollment[];
  classSessions: ClassSession[];
  attendanceRecords: AttendanceRecord[];
  lessonAccounts: LessonAccount[];
  lessonTransactions: LessonTransaction[];
  orders: Order[];
}
