export interface ManagerEmployeeStats {
  total: number;
  active: number;
}

export interface ManagerAttendanceStats {
  presentToday: number;
  absentToday: number;
  attendanceRate: number;
}

export interface ManagerLeaveStats {
  pending: number;
  approved: number;
  rejected: number;
}

export interface ManagerPerformanceStats {
  averageRating: number;
  totalReviews: number;
}

export interface ManagerDashboardData {
  employees: ManagerEmployeeStats;
  attendance: ManagerAttendanceStats;
  leave: ManagerLeaveStats;
  performance: ManagerPerformanceStats;
  unreadNotifications: number;
  recentActivities: any[];
}
