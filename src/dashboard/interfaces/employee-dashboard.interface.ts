import {
  AttendanceTrend,
  PerformanceDistribution,
  RecentActivity,
} from './admin-dashboard.interface';

export interface EmployeeInfo {
  name: string;
  position: string;
  department: string;
  hireDate: string;
}

export interface TodayAttendance {
  checkIn: string | null;
  checkOut: string | null;
  status: string;
}

export interface EmployeeAttendanceStats {
  today: TodayAttendance;
  monthlyRate: number;
  presentToday: number;
  absentToday: number;
  attendanceRate: number;
}

export interface EmployeeLeaveStats {
  pending: number;
  approved: number;
  rejected: number;
}

export interface EmployeePerformanceStats {
  averageRating: number;
  totalReviews: number;
  reviewsThisMonth: number;
  performanceDistribution: PerformanceDistribution[];
  latestReview: {
    rating: number;
    feedback: string;
    reviewDate: string;
  } | null;
}

export interface EmployeeNotificationStats {
  unread: number;
  latest: any[];
}

export interface EmployeePayrollEntry {
  id: string;
  month: number;
  year: number;
  baseSalary: number;
  workingDays: number;
  attendedDays: number;
  absentDays: number;
  leaveDays: number;
  attendanceDeduction: number;
  totalDeductions: number;
  bonuses: number;
  netSalary: number;
  status: string;
}

export interface EmployeePayrollStats {
  currentMonth: EmployeePayrollEntry | null;
  history: EmployeePayrollEntry[];
}

export interface EmployeeDashboardData {
  employee: EmployeeInfo;
  attendance: EmployeeAttendanceStats;
  attendanceTrend: AttendanceTrend[];
  leave: EmployeeLeaveStats;
  performance: EmployeePerformanceStats;
  payroll: EmployeePayrollStats;
  notifications: EmployeeNotificationStats;
  recentActivities: RecentActivity[];
}
