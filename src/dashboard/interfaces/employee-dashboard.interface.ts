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
}

export interface EmployeeLeaveStats {
  pending: number;
  approved: number;
  rejected: number;
}

export interface EmployeePerformanceStats {
  averageRating: number;
  totalReviews: number;
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

export interface EmployeeDashboardData {
  employee: EmployeeInfo;
  attendance: EmployeeAttendanceStats;
  leave: EmployeeLeaveStats;
  performance: EmployeePerformanceStats;
  notifications: EmployeeNotificationStats;
}
