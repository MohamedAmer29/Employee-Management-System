export interface EmployeeStats {
  total: number;
  active: number;
  inactive: number;
  newThisMonth: number;
}

export interface DepartmentStats {
  total: number;
  employeesPerDepartment: DepartmentEmployeeCount[];
}

export interface DepartmentEmployeeCount {
  departmentId: string;
  departmentName: string;
  employeeCount: number;
}

export interface AttendanceStats {
  presentToday: number;
  absentToday: number;
  checkedInToday: number;
  checkedOutToday: number;
  attendanceRate: number;
}

export interface AttendanceTrend {
  date: string;
  present: number;
  absent: number;
}

export interface LeaveStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  pendingRequests: PendingLeaveRequest[];
}

export interface PendingLeaveRequest {
  id: number;
  employeeName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
}

export interface PerformanceStats {
  averageRating: number;
  totalReviews: number;
  reviewsThisMonth: number;
  performanceDistribution: PerformanceDistribution[];
}

export interface PerformanceDistribution {
  rating: number;
  count: number;
}

export interface NotificationStats {
  total: number;
  unread: number;
}

export interface RecentActivity {
  id: string;
  action: string;
  entity: string;
  description: string;
  user: string;
  createdAt: Date;
}

export interface AdminDashboardData {
  employees: EmployeeStats;
  departments: DepartmentStats;
  employeesPerDepartment: DepartmentEmployeeCount[];
  attendance: AttendanceStats;
  leave: LeaveStats;
  performance: PerformanceStats;
  notifications: NotificationStats;
  recentActivities: RecentActivity[];
}
