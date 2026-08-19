import {
  AttendanceTrend,
  PerformanceDistribution,
  PendingLeaveRequest,
} from './admin-dashboard.interface';

export interface ManagerEmployeeStats {
  total: number;
  active: number;
}

export interface ManagerDepartmentInfo {
  id: string;
  name: string;
}

export interface ManagerAttendanceStats {
  presentToday: number;
  absentToday: number;
  lateToday: number;
  onLeaveToday: number;
  attendanceRate: number;
  monthlyRate: number;
}

export interface ManagerLeaveStats {
  pending: number;
  approved: number;
  rejected: number;
}

export interface ManagerLatestReview {
  employeeName: string;
  rating: number;
  feedback: string;
  reviewDate: string;
}

export interface ManagerPerformanceStats {
  averageRating: number;
  totalReviews: number;
  reviewsThisMonth: number;
  performanceDistribution: PerformanceDistribution[];
  latestReview: ManagerLatestReview | null;
}

export interface ManagerPayrollStats {
  totalEmployees: number;
  totalBaseSalary: number;
  totalDeductions: number;
  totalBonuses: number;
  totalNetSalary: number;
  pendingPayroll: number;
  approvedPayroll: number;
  paidPayroll: number;
}

export interface ManagerDashboardData {
  department: ManagerDepartmentInfo;
  employees: ManagerEmployeeStats;
  attendance: ManagerAttendanceStats;
  attendanceTrend: AttendanceTrend[];
  leave: ManagerLeaveStats;
  pendingLeaves: PendingLeaveRequest[];
  performance: ManagerPerformanceStats;
  payroll: ManagerPayrollStats;
  unreadNotifications: number;
  recentActivities: any[];
}
