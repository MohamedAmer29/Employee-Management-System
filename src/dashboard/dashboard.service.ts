import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '@/employees/entities/employee.entity';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { PerformanceReview } from '@/performance/entities/performance';
import { Notification } from '@/notifications/notification.entity';
import { AuditLog } from '@/audit-logs/audit-log.entity';
import { Department } from '@/department/entities/department.entity';
import { User } from '@/users/entities/user.entity';
import {
  AdminDashboardData,
  AttendanceStats,
  AttendanceTrend,
  DepartmentStats,
  EmployeeStats,
  LeaveStats,
  NotificationStats,
  PerformanceStats,
  PendingLeaveRequest,
  RecentActivity,
} from './interfaces/admin-dashboard.interface';
import {
  ManagerDashboardData,
  ManagerAttendanceStats,
  ManagerEmployeeStats,
  ManagerLeaveStats,
  ManagerPerformanceStats,
} from './interfaces/manager-dashboard.interface';
import {
  EmployeeDashboardData,
  EmployeeAttendanceStats,
  EmployeeInfo,
  EmployeeLeaveStats,
  EmployeeNotificationStats,
  EmployeePerformanceStats,
  TodayAttendance,
} from './interfaces/employee-dashboard.interface';
import { DashboardPeriod } from './enums/dashboard-period.enum';
import { LeaveStatus } from '@/leave/interfaces/leave.status';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
    @InjectRepository(PerformanceReview)
    private readonly performanceRepository: Repository<PerformanceReview>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getAdminDashboard(): Promise<AdminDashboardData> {
    const [
      employeeStats,
      departmentStats,
      attendanceStats,
      leaveStats,
      performanceStats,
      notificationStats,
      recentActivities,
    ] = await Promise.all([
      this.getEmployeeStats(),
      this.getDepartmentStats(),
      this.getAttendanceStats(),
      this.getLeaveStats(),
      this.getPerformanceStats(),
      this.getNotificationStats(),
      this.getRecentActivities(),
    ]);

    return {
      employees: employeeStats,
      departments: departmentStats,
      attendance: attendanceStats,
      leave: leaveStats,
      performance: performanceStats,
      notifications: notificationStats,
      recentActivities,
    };
  }

  async getAdminAttendanceTrend(
    period: DashboardPeriod,
  ): Promise<{ attendanceTrend: AttendanceTrend[] }> {
    const queryBuilder = this.attendanceRepository
      .createQueryBuilder('attendance')
      .select([
        'attendance.date',
        'COUNT(CASE WHEN attendance.isPresent = true THEN 1 END) as present',
        'COUNT(CASE WHEN attendance.isPresent = false THEN 1 END) as absent',
      ])
      .groupBy('attendance.date')
      .orderBy('attendance.date', 'ASC');

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case DashboardPeriod.TODAY:
        startDate = new Date(now.setHours(0, 0, 0, 0));
        queryBuilder.andWhere('attendance.date >= :startDate', {
          startDate: startDate.toISOString().split('T')[0],
        });
        break;
      case DashboardPeriod.WEEK:
        startDate = new Date(now.setDate(now.getDate() - 7));
        queryBuilder.andWhere('attendance.date >= :startDate', {
          startDate: startDate.toISOString().split('T')[0],
        });
        break;
      case DashboardPeriod.MONTH:
        startDate = new Date(now.setDate(now.getDate() - 30));
        queryBuilder.andWhere('attendance.date >= :startDate', {
          startDate: startDate.toISOString().split('T')[0],
        });
        break;
      case DashboardPeriod.YEAR:
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        queryBuilder.andWhere('attendance.date >= :startDate', {
          startDate: startDate.toISOString().split('T')[0],
        });
        break;
    }

    const results = await queryBuilder.getRawMany();

    const attendanceTrend: AttendanceTrend[] = results.map((row) => ({
      date: row.attendance_date,
      present: parseInt(row.present),
      absent: parseInt(row.absent),
    }));

    return { attendanceTrend };
  }

  async getManagerDashboard(userId: string): Promise<ManagerDashboardData> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['employee', 'employee.department'],
    });

    if (!user || !user.employee) {
      throw new NotFoundException('Employee record not found');
    }

    const departmentId = user.employee.department?.id;

    const [
      employeeStats,
      attendanceStats,
      leaveStats,
      performanceStats,
      unreadNotifications,
      recentActivities,
    ] = await Promise.all([
      this.getManagerEmployeeStats(departmentId),
      this.getManagerAttendanceStats(departmentId),
      this.getManagerLeaveStats(departmentId),
      this.getManagerPerformanceStats(departmentId),
      this.getUnreadNotificationCount(userId),
      this.getRecentActivitiesByDepartment(departmentId),
    ]);

    return {
      employees: employeeStats,
      attendance: attendanceStats,
      leave: leaveStats,
      performance: performanceStats,
      unreadNotifications,
      recentActivities,
    };
  }

  async getEmployeeDashboard(userId: string): Promise<EmployeeDashboardData> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['employee', 'employee.department'],
    });

    if (!user || !user.employee) {
      throw new NotFoundException('Employee record not found');
    }

    const employee = user.employee;

    const [
      employeeInfo,
      attendanceStats,
      leaveStats,
      performanceStats,
      notificationStats,
    ] = await Promise.all([
      this.getEmployeeInfo(employee),
      this.getEmployeeAttendanceStats(employee.id),
      this.getEmployeeLeaveStats(employee.id),
      this.getEmployeePerformanceStats(employee.id),
      this.getEmployeeNotificationStats(userId),
    ]);

    return {
      employee: employeeInfo,
      attendance: attendanceStats,
      leave: leaveStats,
      performance: performanceStats,
      notifications: notificationStats,
    };
  }

  private async getEmployeeStats(): Promise<EmployeeStats> {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, active, inactive, newThisMonth] = await Promise.all([
      this.employeeRepository.count(),
      this.employeeRepository.count({ where: { isActive: true } }),
      this.employeeRepository.count({ where: { isActive: false } }),
      this.employeeRepository
        .createQueryBuilder('employee')
        .where('employee.createdAt >= :date', { date: firstDayOfMonth })
        .getCount(),
    ]);

    return {
      total,
      active,
      inactive,
      newThisMonth,
    };
  }

  private async getDepartmentStats(): Promise<DepartmentStats> {
    const total = await this.departmentRepository.count();

    const employeesPerDepartment = await this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoin('employee.department', 'department')
      .select([
        'department.id as departmentId',
        'department.name as departmentName',
        'COUNT(employee.id) as employeeCount',
      ])
      .where('department.id IS NOT NULL')
      .groupBy('department.id, department.name')
      .orderBy('employeeCount', 'DESC')
      .getRawMany();

    return {
      total,
      employeesPerDepartment: employeesPerDepartment.map((row) => ({
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        employeeCount: parseInt(row.employeeCount),
      })),
    };
  }

  private async getAttendanceStats(): Promise<AttendanceStats> {
    const today = new Date().toISOString().split('T')[0];

    const [
      presentToday,
      absentToday,
      checkedInToday,
      checkedOutToday,
      totalActive,
    ] = await Promise.all([
      this.attendanceRepository.count({
        where: { date: today, isPresent: true },
      }),
      this.attendanceRepository.count({
        where: { date: today, isPresent: false },
      }),
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .where('attendance.date = :today', { today })
        .andWhere('attendance.checkIn IS NOT NULL')
        .getCount(),
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .where('attendance.date = :today', { today })
        .andWhere('attendance.checkOut IS NOT NULL')
        .getCount(),
      this.employeeRepository.count({ where: { isActive: true } }),
    ]);

    const attendanceRate =
      totalActive > 0 ? (presentToday / totalActive) * 100 : 0;

    return {
      presentToday,
      absentToday,
      checkedInToday,
      checkedOutToday,
      attendanceRate: parseFloat(attendanceRate.toFixed(2)),
    };
  }

  private async getLeaveStats(): Promise<LeaveStats> {
    const [total, pending, approved, rejected] = await Promise.all([
      this.leaveRepository.count(),
      this.leaveRepository.count({ where: { status: LeaveStatus.PENDING } }),
      this.leaveRepository.count({ where: { status: LeaveStatus.APPROVED } }),
      this.leaveRepository.count({ where: { status: LeaveStatus.REJECTED } }),
    ]);

    const pendingRequests = await this.leaveRepository
      .createQueryBuilder('leave')
      .leftJoin('leave.employee', 'employee')
      .select([
        'leave.id',
        'employee.fullName',
        'leave.startDate',
        'leave.endDate',
        'leave.reason',
        'leave.status',
      ])
      .where('leave.status = :status', { status: LeaveStatus.PENDING })
      .orderBy('leave.startDate', 'ASC')
      .limit(10)
      .getRawMany();

    const pendingRequestsFormatted: PendingLeaveRequest[] = pendingRequests.map(
      (row) => ({
        id: row.leave_id,
        employeeName: row.employee_fullName,
        startDate: row.leave_startDate,
        endDate: row.leave_endDate,
        reason: row.leave_reason,
        status: row.leave_status,
      }),
    );

    return {
      total,
      pending,
      approved,
      rejected,
      pendingRequests: pendingRequestsFormatted,
    };
  }

  private async getPerformanceStats(): Promise<PerformanceStats> {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [averageRating, totalReviews, reviewsThisMonth] = await Promise.all([
      this.performanceRepository
        .createQueryBuilder('review')
        .select('AVG(review.rating)', 'avg')
        .getRawOne(),
      this.performanceRepository.count(),
      this.performanceRepository
        .createQueryBuilder('review')
        .where('review.reviewDate >= :date', {
          date: firstDayOfMonth.toISOString().split('T')[0],
        })
        .getCount(),
    ]);

    const performanceDistribution = await this.performanceRepository
      .createQueryBuilder('review')
      .select(['review.rating', 'COUNT(review.id) as count'])
      .groupBy('review.rating')
      .orderBy('review.rating', 'ASC')
      .getRawMany();

    return {
      averageRating: parseFloat(averageRating.avg) || 0,
      totalReviews,
      reviewsThisMonth,
      performanceDistribution: performanceDistribution.map((row) => ({
        rating: row.review_rating,
        count: parseInt(row.count),
      })),
    };
  }

  private async getNotificationStats(): Promise<NotificationStats> {
    const [total, unread] = await Promise.all([
      this.notificationRepository.count(),
      this.notificationRepository.count({ where: { isRead: false } }),
    ]);

    return { total, unread };
  }

  private async getRecentActivities(): Promise<RecentActivity[]> {
    const activities = await this.auditLogRepository
      .createQueryBuilder('auditLog')
      .leftJoin('auditLog.user', 'user')
      .select([
        'auditLog.id',
        'auditLog.action',
        'auditLog.entity',
        'auditLog.description',
        'user.firstName',
        'user.lastName',
        'auditLog.createdAt',
      ])
      .orderBy('auditLog.createdAt', 'DESC')
      .limit(10)
      .getRawMany();

    return activities.map((row) => ({
      id: row.auditLog_id,
      action: row.auditLog_action,
      entity: row.auditLog_entity,
      description: row.auditLog_description,
      user: `${row.user_firstName} ${row.user_lastName}`,
      createdAt: row.auditLog_createdAt,
    }));
  }

  private async getManagerEmployeeStats(
    departmentId?: string,
  ): Promise<ManagerEmployeeStats> {
    const queryBuilder = this.employeeRepository.createQueryBuilder('employee');

    if (departmentId) {
      queryBuilder.where('employee.departmentId = :departmentId', {
        departmentId,
      });
    }

    const [total, active] = await Promise.all([
      queryBuilder.getCount(),
      queryBuilder.clone().andWhere('employee.isActive = true').getCount(),
    ]);

    return { total, active };
  }

  private async getManagerAttendanceStats(
    departmentId?: string,
  ): Promise<ManagerAttendanceStats> {
    const today = new Date().toISOString().split('T')[0];

    let queryBuilder = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoin('attendance.employee', 'employee');

    if (departmentId) {
      queryBuilder = queryBuilder.andWhere(
        'employee.departmentId = :departmentId',
        { departmentId },
      );
    }

    const [presentToday, absentToday, totalActive] = await Promise.all([
      queryBuilder
        .clone()
        .andWhere('attendance.date = :today', { today })
        .andWhere('attendance.isPresent = true')
        .getCount(),
      queryBuilder
        .clone()
        .andWhere('attendance.date = :today', { today })
        .andWhere('attendance.isPresent = false')
        .getCount(),
      this.employeeRepository
        .createQueryBuilder('employee')
        .where('employee.isActive = true')
        .andWhere(
          departmentId ? 'employee.departmentId = :departmentId' : '1=1',
          { departmentId },
        )
        .getCount(),
    ]);

    const attendanceRate =
      totalActive > 0 ? (presentToday / totalActive) * 100 : 0;

    return {
      presentToday,
      absentToday,
      attendanceRate: parseFloat(attendanceRate.toFixed(2)),
    };
  }

  private async getManagerLeaveStats(
    departmentId?: string,
  ): Promise<ManagerLeaveStats> {
    let queryBuilder = this.leaveRepository
      .createQueryBuilder('leave')
      .leftJoin('leave.employee', 'employee');

    if (departmentId) {
      queryBuilder = queryBuilder.andWhere(
        'employee.departmentId = :departmentId',
        { departmentId },
      );
    }

    const [pending, approved, rejected] = await Promise.all([
      queryBuilder
        .clone()
        .andWhere('leave.status = :status', { status: LeaveStatus.PENDING })
        .getCount(),
      queryBuilder
        .clone()
        .andWhere('leave.status = :status', { status: LeaveStatus.APPROVED })
        .getCount(),
      queryBuilder
        .clone()
        .andWhere('leave.status = :status', { status: LeaveStatus.REJECTED })
        .getCount(),
    ]);

    return { pending, approved, rejected };
  }

  private async getManagerPerformanceStats(
    departmentId?: string,
  ): Promise<ManagerPerformanceStats> {
    let queryBuilder = this.performanceRepository
      .createQueryBuilder('review')
      .leftJoin('review.employee', 'employee');

    if (departmentId) {
      queryBuilder = queryBuilder.andWhere(
        'employee.departmentId = :departmentId',
        { departmentId },
      );
    }

    const [averageRating, totalReviews] = await Promise.all([
      queryBuilder.clone().select('AVG(review.rating)', 'avg').getRawOne(),
      queryBuilder.getCount(),
    ]);

    return {
      averageRating: parseFloat(averageRating.avg) || 0,
      totalReviews,
    };
  }

  private async getUnreadNotificationCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }

  private async getRecentActivitiesByDepartment(
    departmentId?: string,
  ): Promise<any[]> {
    let queryBuilder = this.auditLogRepository
      .createQueryBuilder('auditLog')
      .leftJoin('auditLog.user', 'user')
      .leftJoin('user.employee', 'employee');

    if (departmentId) {
      queryBuilder = queryBuilder.andWhere(
        'employee.departmentId = :departmentId',
        { departmentId },
      );
    }

    return queryBuilder
      .select([
        'auditLog.id',
        'auditLog.action',
        'auditLog.entity',
        'auditLog.description',
        'user.firstName',
        'user.lastName',
        'auditLog.createdAt',
      ])
      .orderBy('auditLog.createdAt', 'DESC')
      .limit(10)
      .getRawMany();
  }

  private async getEmployeeInfo(employee: Employee): Promise<EmployeeInfo> {
    return {
      name: employee.fullName,
      position: employee.position,
      department: employee.department?.name || 'Not Assigned',
      hireDate: new Date().toISOString().split('T')[0],
    };
  }

  private async getEmployeeAttendanceStats(
    employeeId: string,
  ): Promise<EmployeeAttendanceStats> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayAttendance, monthlyPresent, monthlyTotal] = await Promise.all([
      this.attendanceRepository.findOne({
        where: { employee: { id: employeeId }, date: today },
      }),
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .where('employeeId = :employeeId', { employeeId })
        .andWhere('attendance.date >= :date', {
          date: firstDayOfMonth.toISOString().split('T')[0],
        })
        .andWhere('attendance.isPresent = true')
        .getCount(),
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .where('employeeId = :employeeId', { employeeId })
        .andWhere('attendance.date >= :date', {
          date: firstDayOfMonth.toISOString().split('T')[0],
        })
        .getCount(),
    ]);

    const monthlyRate =
      monthlyTotal > 0 ? (monthlyPresent / monthlyTotal) * 100 : 0;

    return {
      today: {
        checkIn: todayAttendance?.checkIn || null,
        checkOut: todayAttendance?.checkOut || null,
        status: todayAttendance?.isPresent ? 'present' : 'absent',
      },
      monthlyRate: parseFloat(monthlyRate.toFixed(2)),
    };
  }

  private async getEmployeeLeaveStats(
    employeeId: string,
  ): Promise<EmployeeLeaveStats> {
    const [pending, approved, rejected] = await Promise.all([
      this.leaveRepository.count({
        where: { employee: { id: employeeId }, status: LeaveStatus.PENDING },
      }),
      this.leaveRepository.count({
        where: { employee: { id: employeeId }, status: LeaveStatus.APPROVED },
      }),
      this.leaveRepository.count({
        where: { employee: { id: employeeId }, status: LeaveStatus.REJECTED },
      }),
    ]);

    return { pending, approved, rejected };
  }

  private async getEmployeePerformanceStats(
    employeeId: string,
  ): Promise<EmployeePerformanceStats> {
    const [averageRating, totalReviews, latestReview] = await Promise.all([
      this.performanceRepository
        .createQueryBuilder('review')
        .select('AVG(review.rating)', 'avg')
        .where('employeeId = :employeeId', { employeeId })
        .getRawOne(),
      this.performanceRepository.count({
        where: { employee: { id: employeeId } },
      }),
      this.performanceRepository
        .createQueryBuilder('review')
        .where('employeeId = :employeeId', { employeeId })
        .orderBy('review.reviewDate', 'DESC')
        .limit(1)
        .getOne(),
    ]);

    return {
      averageRating: parseFloat(averageRating.avg) || 0,
      totalReviews,
      latestReview: latestReview
        ? {
            rating: latestReview.rating,
            feedback: latestReview.feedback,
            reviewDate: latestReview.reviewDate,
          }
        : null,
    };
  }

  private async getEmployeeNotificationStats(
    userId: string,
  ): Promise<EmployeeNotificationStats> {
    const [unread, latest] = await Promise.all([
      this.notificationRepository.count({
        where: { userId, isRead: false },
      }),
      this.notificationRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 5,
      }),
    ]);

    return {
      unread,
      latest,
    };
  }
}
