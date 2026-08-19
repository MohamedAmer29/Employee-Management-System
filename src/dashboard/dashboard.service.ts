/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  getBusinessDate,
  getBusinessMonthStart,
  getTimezone,
  getWeekdayInTimezone,
  formatInTimezone,
} from '@/common/utils/timezones.util';
import { Employee } from '@/employees/entities/employee.entity';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { Compensation } from '@/payroll/entities/compensation.entity';
import { PerformanceReview } from '@/performance/entities/performance';
import { Notification } from '@/notifications/notification.entity';
import { AuditLog } from '@/audit-logs/audit-log.entity';
import { Department } from '@/department/entities/department.entity';
import { User } from '@/users/entities/user.entity';
import {
  AdminDashboardData,
  AttendanceStats,
  AttendanceTrend,
  AttendanceTrendResponse,
  AttendanceTrendSummary,
  AttendanceTrendDepartment,
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
  ManagerDepartmentInfo,
  ManagerEmployeeStats,
  ManagerLeaveStats,
  ManagerPerformanceStats,
  ManagerPayrollStats,
} from './interfaces/manager-dashboard.interface';
import {
  EmployeeDashboardData,
  EmployeeAttendanceStats,
  EmployeeInfo,
  EmployeeLeaveStats,
  EmployeeNotificationStats,
  EmployeePerformanceStats,
  EmployeePayrollStats,
  EmployeePayrollEntry,
} from './interfaces/employee-dashboard.interface';
import { DashboardPeriod } from './enums/dashboard-period.enum';
import { LeaveStatus } from '@/leave/interfaces/leave.status';
import { AttendanceStatus } from '@/common/constants/enums';
import { RedisService } from '@/redis/redis.service';
import { CACHE_TTL, RedisKeys } from '@/redis/redis.constants';

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
    @InjectRepository(Compensation)
    private readonly compensationRepository: Repository<Compensation>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Returns the business date (YYYY-MM-DD) in the configured ATTENDANCE_TIMEZONE.
   * Attendance records are stored against this date, so all "today" aggregates
   * must use it rather than the server's UTC clock.
   */
  private getBusinessDate(): string {
    return getBusinessDate(this.configService);
  }

  /**
   * True when the current time in the configured ATTENDANCE_TIMEZONE is at or
   * past 12:00 PM. Used to decide whether "today" should be counted as a
   * working day for absence reporting.
   */
  private isPastNoon(): boolean {
    const tz = this.configService.get<string>('ATTENDANCE_TIMEZONE') ?? 'UTC';
    try {
      const hour = parseInt(
        new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: '2-digit',
          hour12: false,
        }).format(new Date()),
        10,
      );
      return hour >= 12;
    } catch {
      return new Date().getUTCHours() >= 12;
    }
  }

  /**
   * Admin dashboard is the most expensive query in the system (7 aggregate
   * queries). It is cached for CACHE_TTL.DASHBOARD seconds behind a Redis lock
   * so a cache expiry never causes a stampede of concurrent PostgreSQL scans.
   */
  async getAdminDashboard(userId?: string): Promise<AdminDashboardData> {
    const scope = userId ?? 'all';
    return this.redisService.rememberWithLock<AdminDashboardData>(
      RedisKeys.dashboardAdmin(scope),
      RedisKeys.dashboardLock(`admin:${scope}`),
      CACHE_TTL.DASHBOARD,
      () => this.buildAdminDashboard(userId),
      CACHE_TTL.LOCK,
    );
  }

  private async buildAdminDashboard(
    userId?: string,
  ): Promise<AdminDashboardData> {
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
      this.getNotificationStats(userId),
      this.getRecentActivities(),
    ]);

    return {
      employees: employeeStats,
      departments: departmentStats,
      employeesPerDepartment: departmentStats.employeesPerDepartment,
      attendance: attendanceStats,
      leave: leaveStats,
      performance: performanceStats,
      notifications: notificationStats,
      recentActivities,
    };
  }

  async getAdminAttendanceTrend(
    period: DashboardPeriod,
  ): Promise<AttendanceTrendResponse> {
    return this.redisService.rememberWithLock<AttendanceTrendResponse>(
      RedisKeys.dashboardAdminTrend(period),
      RedisKeys.dashboardLock(`admin:${period}`),
      CACHE_TTL.DASHBOARD_TREND,
      () => this.buildAdminAttendanceTrend(period),
      CACHE_TTL.LOCK,
    );
  }

  private getTimezone(): string {
    return getTimezone(this.configService);
  }

  private getBusinessMonthStart(): string {
    return getBusinessMonthStart(this.configService);
  }

  private getWeekdayInTimezone(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number);
    return getWeekdayInTimezone(y, m, d, this.configService);
  }

  private getWorkingDaysInRange(startStr: string, endStr: string): string[] {
    const out: string[] = [];
    const start = new Date(`${startStr}T00:00:00Z`);
    const end = new Date(`${endStr}T00:00:00Z`);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const day = this.getWeekdayInTimezone(dateStr);
      // Match the application's weekend rule (Friday + Saturday), the same one
      // used by the monthly attendance report's isWeekend(), so non-working days
      // are never counted as absent and never drag the rate down.
      if (day !== 5 && day !== 6) {
        out.push(dateStr);
      }
    }
    return out;
  }

  private async buildAdminAttendanceTrend(
    period: DashboardPeriod,
  ): Promise<AttendanceTrendResponse> {
    const todayStr = this.getBusinessDate();
    const todayDate = new Date(`${todayStr}T00:00:00Z`);
    const subtractDays = (n: number): string => {
      const d = new Date(todayDate);
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().split('T')[0];
    };

    let startDateStr: string;
    switch (period) {
      case DashboardPeriod.TODAY:
        startDateStr = todayStr;
        break;
      case DashboardPeriod.WEEK:
        startDateStr = subtractDays(6);
        break;
      case DashboardPeriod.MONTH:
        startDateStr = subtractDays(29);
        break;
      case DashboardPeriod.YEAR:
        startDateStr = subtractDays(364);
        break;
    }

    // Only working days up to (and including) today count towards attendance.
    // Future working days are excluded so they don't drag the rate down.
    const workingDays = this.getWorkingDaysInRange(startDateStr, todayStr);

    // Active employees per department (roster for the period) and the
    // employee -> department map used to attribute approved leave.
    const employees = await this.employeeRepository.find({
      where: { isActive: true },
      select: ['id'],
      relations: ['department'],
    });
    const empDept = new Map<string, string | null>(
      employees.map((e) => [e.id, e.department?.id ?? null]),
    );

    const [attRows, leaveRows] = await Promise.all([
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .leftJoin('attendance.employee', 'employee')
        .leftJoin('employee.department', 'department')
        .select("TO_CHAR(attendance.date, 'YYYY-MM-DD')", 'date')
        .addSelect('department.id', 'departmentId')
        .addSelect(
          `COUNT(CASE WHEN attendance.status IN ('${AttendanceStatus.PRESENT}', '${AttendanceStatus.LATE}') OR (attendance.status IS NULL AND attendance.isPresent = true) THEN 1 END)`,
          'present',
        )
        .addSelect(
          `COUNT(CASE WHEN attendance.status = '${AttendanceStatus.LATE}' THEN 1 END)`,
          'late',
        )
        .where('attendance.date >= :start', { start: startDateStr })
        .andWhere('attendance.date <= :end', { end: todayStr })
        .groupBy('attendance.date, department.id')
        .getRawMany<{
          date: string;
          departmentId: string | null;
          present: string;
          late: string;
        }>(),
      this.leaveRepository
        .createQueryBuilder('leave')
        .select('leave.employeeId', 'employeeId')
        .addSelect("TO_CHAR(leave.startDate, 'YYYY-MM-DD')", 'startDate')
        .addSelect("TO_CHAR(leave.endDate, 'YYYY-MM-DD')", 'endDate')
        .where('leave.status = :status', { status: LeaveStatus.APPROVED })
        .andWhere('leave.startDate <= :end', { end: todayStr })
        .andWhere('leave.endDate >= :start', { start: startDateStr })
        .getRawMany<{
          employeeId: string;
          startDate: string;
          endDate: string;
        }>(),
    ]);

    const attByDateDept = new Map<string, { present: number; late: number }>();
    for (const row of attRows) {
      attByDateDept.set(`${row.date}|${row.departmentId ?? ''}`, {
        present: parseInt(row.present) || 0,
        late: parseInt(row.late) || 0,
      });
    }

    const onLeaveOn = (date: string, deptId: string | null): number => {
      let count = 0;
      for (const leave of leaveRows) {
        if (
          empDept.get(leave.employeeId) === deptId &&
          date >= leave.startDate &&
          date <= leave.endDate
        ) {
          count++;
        }
      }
      return count;
    };

    // Build each department's roster directly from the employees list so every
    // employee is counted ONLY in the department they are assigned to. A
    // department's absence is therefore measured strictly against its own head
    // count — never the whole company.
    const deptActiveMap = new Map<
      string,
      {
        departmentId: string | null;
        departmentName: string | null;
        count: number;
      }
    >();
    for (const employee of employees) {
      const id = employee.department?.id ?? null;
      const name = employee.department?.name ?? null;
      const key = id ?? '';
      if (!deptActiveMap.has(key)) {
        deptActiveMap.set(key, {
          departmentId: id,
          departmentName: name,
          count: 0,
        });
      }
      deptActiveMap.get(key)!.count += 1;
    }

    const attendanceTrend: AttendanceTrend[] = workingDays.map((date) => {
      let dayPresent = 0;
      let dayLate = 0;
      let dayExpected = 0;
      let dayOnLeave = 0;
      for (const dept of deptActiveMap.values()) {
        const att = attByDateDept.get(`${date}|${dept.departmentId ?? ''}`) ?? {
          present: 0,
          late: 0,
        };
        // Absence is always measured against each department's OWN active
        // roster, never the whole company: expected = dept employees - on leave.
        const onLeave = onLeaveOn(date, dept.departmentId);
        const expected = Math.max(dept.count - onLeave, 0);
        dayPresent += att.present;
        dayLate += att.late;
        dayExpected += expected;
        dayOnLeave += onLeave;
      }
      const absent = Math.max(dayExpected - dayPresent, 0);
      const attendanceRate =
        dayExpected > 0
          ? Number(((dayPresent / dayExpected) * 100).toFixed(1))
          : 0;

      return {
        date,
        present: dayPresent,
        absent,
        late: dayLate,
        onLeave: dayOnLeave,
        attendanceRate,
      };
    });

    // The trend chart (attendanceTrend / daysIncluded) follows the configured
    // working-day calendar only. The department + summary absent rollup also
    // evaluates "today" once the business day is past noon, so employees who
    // haven't checked in are counted as absent even on a company weekend or
    // before any attendance rows exist for the day.
    const evalDates = [...workingDays];
    if (
      period === DashboardPeriod.TODAY &&
      this.isPastNoon() &&
      !evalDates.includes(todayStr)
    ) {
      evalDates.push(todayStr);
    }

    let totalPresent = 0;
    let totalLate = 0;
    let totalLeave = 0;
    let totalExpected = 0;
    for (const date of evalDates) {
      for (const dept of deptActiveMap.values()) {
        const att = attByDateDept.get(`${date}|${dept.departmentId ?? ''}`) ?? {
          present: 0,
          late: 0,
        };
        const onLeave = onLeaveOn(date, dept.departmentId);
        const expected = Math.max(dept.count - onLeave, 0);
        totalPresent += att.present;
        totalLate += att.late;
        totalLeave += onLeave;
        totalExpected += expected;
      }
    }
    const totalAbsent = Math.max(totalExpected - totalPresent, 0);
    const summary: AttendanceTrendSummary = {
      totalPresent,
      totalAbsent,
      totalLate,
      totalLeave,
      attendanceRate:
        totalExpected > 0
          ? Number(((totalPresent / totalExpected) * 100).toFixed(1))
          : 0,
      daysIncluded: workingDays.length,
    };

    const departments: AttendanceTrendDepartment[] = Array.from(
      deptActiveMap.values(),
    ).map((dept) => {
      let present = 0;
      let late = 0;
      let onLeaveTotal = 0;
      let expectedTotal = 0;
      for (const date of evalDates) {
        const att = attByDateDept.get(`${date}|${dept.departmentId ?? ''}`) ?? {
          present: 0,
          late: 0,
        };
        // Scoped to this department only: its own roster and its own leave.
        const onLeave = onLeaveOn(date, dept.departmentId);
        const expected = Math.max(dept.count - onLeave, 0);
        present += att.present;
        late += att.late;
        onLeaveTotal += onLeave;
        expectedTotal += expected;
      }
      const absent = Math.max(expectedTotal - present, 0);
      return {
        departmentId: dept.departmentId,
        departmentName: dept.departmentName,
        present,
        absent,
        late,
        onLeave: onLeaveTotal,
        attendanceRate:
          expectedTotal > 0
            ? Number(((present / expectedTotal) * 100).toFixed(1))
            : 0,
      };
    });

    return { attendanceTrend, summary, departments };
  }

  async getManagerDashboard(userId: string): Promise<ManagerDashboardData> {
    return this.redisService.rememberWithLock<ManagerDashboardData>(
      RedisKeys.dashboardManager(userId),
      RedisKeys.dashboardLock(`manager:${userId}`),
      CACHE_TTL.DASHBOARD,
      () => this.buildManagerDashboard(userId),
      CACHE_TTL.LOCK,
    );
  }

  private async buildManagerDashboard(
    userId: string,
  ): Promise<ManagerDashboardData> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['employee', 'employee.department'],
    });

    if (!user || !user.employee) {
      throw new NotFoundException('Employee record not found');
    }

    const departmentId = user.employee.department?.id;
    const department: ManagerDepartmentInfo = {
      id: departmentId ?? '',
      name: user.employee.department?.name ?? 'Unassigned',
    };

    const [
      employeeStats,
      attendanceStats,
      attendanceTrend,
      leaveStats,
      pendingLeaves,
      performanceStats,
      unreadNotifications,
      recentActivities,
    ] = await Promise.all([
      this.getManagerEmployeeStats(departmentId),
      this.getManagerAttendanceStats(departmentId),
      this.getManagerAttendanceTrend(departmentId),
      this.getManagerLeaveStats(departmentId),
      this.getManagerPendingLeaves(departmentId),
      this.getManagerPerformanceStats(departmentId),
      this.getUnreadNotificationCount(userId),
      this.getRecentActivitiesByDepartment(departmentId),
    ]);

    return {
      department,
      employees: employeeStats,
      attendance: attendanceStats,
      attendanceTrend,
      leave: leaveStats,
      pendingLeaves,
      performance: performanceStats,
      payroll: await this.getManagerPayrollStats(departmentId),
      unreadNotifications,
      recentActivities,
    };
  }

  async getEmployeeDashboard(userId: string): Promise<EmployeeDashboardData> {
    return this.redisService.remember<EmployeeDashboardData>(
      RedisKeys.dashboardEmployee(userId),
      CACHE_TTL.DASHBOARD,
      () => this.buildEmployeeDashboard(userId),
    );
  }

  private async buildEmployeeDashboard(
    userId: string,
  ): Promise<EmployeeDashboardData> {
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
      attendanceTrend,
      leaveStats,
      performanceStats,
      notificationStats,
      recentActivities,
    ] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/await-thenable
      this.getEmployeeInfo(employee),
      this.getEmployeeAttendanceStats(employee.id),
      this.getEmployeeAttendanceTrend(employee.id),
      this.getEmployeeLeaveStats(employee.id),
      this.getEmployeePerformanceStats(employee.id),
      this.getEmployeeNotificationStats(userId),
      this.getEmployeeRecentActivities(userId),
    ]);

    return {
      employee: employeeInfo,
      attendance: attendanceStats,
      attendanceTrend,
      leave: leaveStats,
      performance: performanceStats,
      payroll: await this.getEmployeePayrollStats(employee.id),
      notifications: notificationStats,
      recentActivities,
    };
  }

  private async getEmployeeStats(): Promise<EmployeeStats> {
    const firstDayOfMonth = this.getBusinessMonthStart();

    const [total, active, inactive, newThisMonth] = await Promise.all([
      this.employeeRepository.count(),
      this.employeeRepository.count({ where: { isActive: true } }),
      this.employeeRepository.count({ where: { isActive: false } }),
      this.employeeRepository
        .createQueryBuilder('employee')
        .where('employee.createdAt >= :date', {
          date: `${firstDayOfMonth}T00:00:00Z`,
        })
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
        'department.id AS "departmentId"',
        'department.name AS "departmentName"',
        'COUNT(employee.id) AS "employeeCount"',
      ])
      .where('department.id IS NOT NULL')
      .groupBy('department.id, department.name')
      .orderBy('"employeeCount"', 'DESC')
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
    const today = this.getBusinessDate();

    const [
      presentToday,
      checkedInToday,
      checkedOutToday,
      totalActive,
      onLeaveToday,
    ] = await Promise.all([
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .where('DATE(attendance.date) = :today', { today })
        .andWhere('attendance.isPresent = true')
        .getCount(),
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .where('DATE(attendance.date) = :today', { today })
        .andWhere('attendance.checkIn IS NOT NULL')
        .getCount(),
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .where('DATE(attendance.date) = :today', { today })
        .andWhere('attendance.checkOut IS NOT NULL')
        .getCount(),
      this.employeeRepository.count({ where: { isActive: true } }),
      this.leaveRepository
        .createQueryBuilder('leave')
        .where('leave.status = :status', { status: LeaveStatus.APPROVED })
        .andWhere('leave.startDate <= :today', { today })
        .andWhere('leave.endDate >= :today', { today })
        .getCount(),
    ]);

    const expectedToday = Math.max(totalActive - onLeaveToday, 0);
    const absentToday = Math.max(expectedToday - presentToday, 0);

    const attendanceRate =
      expectedToday > 0 ? (presentToday / expectedToday) * 100 : 0;

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
    const monthStart = this.getBusinessMonthStart();

    const [averageRating, totalReviews, reviewsThisMonth] = await Promise.all([
      this.performanceRepository
        .createQueryBuilder('review')
        .select('AVG(review.rating)', 'avg')
        .getRawOne(),
      this.performanceRepository.count(),
      this.performanceRepository
        .createQueryBuilder('review')
        .where('review.reviewDate >= :date', {
          date: monthStart,
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

  private async getNotificationStats(
    userId?: string,
  ): Promise<NotificationStats> {
    const base = userId ? { userId } : {};
    const [total, unread] = await Promise.all([
      this.notificationRepository.count({ where: base }),
      this.notificationRepository.count({
        where: { ...base, isRead: false },
      }),
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
      createdAt: formatInTimezone(row.auditLog_createdAt, this.configService),
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
    const today = this.getBusinessDate();
    const monthStart = this.getBusinessMonthStart();

    const presentCase = `(attendance.status IN ('${AttendanceStatus.PRESENT}', '${AttendanceStatus.LATE}') OR (attendance.status IS NULL AND attendance.isPresent = true))`;

    let attQuery = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoin('attendance.employee', 'employee');
    if (departmentId) {
      attQuery = attQuery.andWhere('employee.departmentId = :departmentId', {
        departmentId,
      });
    }

    const deptCond = departmentId
      ? 'employee.departmentId = :departmentId'
      : '1=1';

    const [totalActive, onLeaveToday, presentToday, lateToday, monthlyPresent] =
      await Promise.all([
        this.employeeRepository
          .createQueryBuilder('employee')
          .where('employee.isActive = true')
          .andWhere(deptCond, { departmentId })
          .getCount(),
        this.leaveRepository
          .createQueryBuilder('leave')
          .leftJoin('leave.employee', 'employee')
          .where('leave.status = :status', { status: LeaveStatus.APPROVED })
          .andWhere('leave.startDate <= :today', { today })
          .andWhere('leave.endDate >= :today', { today })
          .andWhere('employee.isActive = true')
          .andWhere(deptCond, { departmentId })
          .getCount(),
        attQuery
          .clone()
          .andWhere('employee.isActive = true')
          .andWhere('DATE(attendance.date) = :today', { today })
          .andWhere(presentCase)
          .getCount(),
        attQuery
          .clone()
          .andWhere('employee.isActive = true')
          .andWhere('DATE(attendance.date) = :today', { today })
          .andWhere(`attendance.status = '${AttendanceStatus.LATE}'`)
          .getCount(),
        attQuery
          .clone()
          .andWhere('employee.isActive = true')
          .andWhere('attendance.date >= :monthStart', { monthStart })
          .andWhere('attendance.date <= :today', { today })
          .andWhere(presentCase)
          .getCount(),
      ]);

    const expectedToday = Math.max(totalActive - onLeaveToday, 0);
    const absentToday = Math.max(expectedToday - presentToday, 0);

    const attendanceRate =
      expectedToday > 0
        ? Math.min((presentToday / expectedToday) * 100, 100)
        : 0;

    const workingDaysInMonth = this.getWorkingDaysInRange(
      monthStart,
      today,
    ).length;
    const expectedMonth = workingDaysInMonth * totalActive;
    const monthlyRate =
      expectedMonth > 0
        ? Math.min((monthlyPresent / expectedMonth) * 100, 100)
        : 0;

    return {
      presentToday,
      absentToday,
      lateToday,
      onLeaveToday,
      attendanceRate: parseFloat(attendanceRate.toFixed(2)),
      monthlyRate: parseFloat(monthlyRate.toFixed(2)),
    };
  }

  private async getManagerAttendanceTrend(
    departmentId?: string,
  ): Promise<AttendanceTrend[]> {
    const today = this.getBusinessDate();
    const todayDate = new Date(`${today}T00:00:00Z`);
    const subtractDays = (n: number): string => {
      const d = new Date(todayDate);
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().split('T')[0];
    };
    const startDateStr = subtractDays(29);
    const workingDays = this.getWorkingDaysInRange(startDateStr, today);

    const deptCond = departmentId
      ? 'employee.departmentId = :departmentId'
      : '1=1';

    const attRows = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoin('attendance.employee', 'employee')
      .select("TO_CHAR(attendance.date, 'YYYY-MM-DD')", 'date')
      .addSelect(
        `COUNT(CASE WHEN attendance.status IN ('${AttendanceStatus.PRESENT}', '${AttendanceStatus.LATE}') OR (attendance.status IS NULL AND attendance.isPresent = true) THEN 1 END)`,
        'present',
      )
      .addSelect(
        `COUNT(CASE WHEN attendance.status = '${AttendanceStatus.LATE}' THEN 1 END)`,
        'late',
      )
      .where('attendance.date >= :start', { start: startDateStr })
      .andWhere('attendance.date <= :end', { end: today })
      .andWhere('employee.isActive = true')
      .andWhere(deptCond, { departmentId })
      .groupBy('attendance.date')
      .getRawMany<{ date: string; present: string; late: string }>();

    const attByDate = new Map<string, { present: number; late: number }>();
    for (const row of attRows) {
      attByDate.set(row.date, {
        present: parseInt(row.present) || 0,
        late: parseInt(row.late) || 0,
      });
    }

    const leaveRows = await this.leaveRepository
      .createQueryBuilder('leave')
      .leftJoin('leave.employee', 'employee')
      .select('leave.employeeId', 'employeeId')
      .addSelect("TO_CHAR(leave.startDate, 'YYYY-MM-DD')", 'startDate')
      .addSelect("TO_CHAR(leave.endDate, 'YYYY-MM-DD')", 'endDate')
      .where('leave.status = :status', { status: LeaveStatus.APPROVED })
      .andWhere('leave.startDate <= :end', { end: today })
      .andWhere('leave.endDate >= :start', { start: startDateStr })
      .andWhere('employee.isActive = true')
      .andWhere(deptCond, { departmentId })
      .getRawMany<{
        employeeId: string;
        startDate: string;
        endDate: string;
      }>();

    const totalActive = await this.employeeRepository
      .createQueryBuilder('employee')
      .where('employee.isActive = true')
      .andWhere(deptCond, { departmentId })
      .getCount();

    const onLeaveOn = (date: string): number => {
      let count = 0;
      for (const leave of leaveRows) {
        if (date >= leave.startDate && date <= leave.endDate) {
          count++;
        }
      }
      return count;
    };

    return workingDays.map((date) => {
      const att = attByDate.get(date) ?? { present: 0, late: 0 };
      const onLeave = onLeaveOn(date);
      const expected = Math.max(totalActive - onLeave, 0);
      const absent = Math.max(expected - att.present, 0);
      const attendanceRate =
        expected > 0
          ? Math.min(Number(((att.present / expected) * 100).toFixed(1)), 100)
          : 0;
      return {
        date,
        present: att.present,
        absent,
        late: att.late,
        onLeave,
        attendanceRate,
      };
    });
  }

  private async getManagerPendingLeaves(
    departmentId?: string,
  ): Promise<PendingLeaveRequest[]> {
    let queryBuilder = this.leaveRepository
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
      .limit(10);

    if (departmentId) {
      queryBuilder = queryBuilder.andWhere(
        'employee.departmentId = :departmentId',
        { departmentId },
      );
    }

    const rows = await queryBuilder.getRawMany();
    return rows.map((row) => ({
      id: row.leave_id,
      employeeName: row.employee_fullName,
      startDate: row.leave_startDate,
      endDate: row.leave_endDate,
      reason: row.leave_reason,
      status: row.leave_status,
    }));
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
    const monthStart = this.getBusinessMonthStart();
    const deptCond = departmentId
      ? 'employee.departmentId = :departmentId'
      : '1=1';

    const buildBase = () => {
      const qb = this.performanceRepository
        .createQueryBuilder('review')
        .leftJoin('review.employee', 'employee');
      if (departmentId) {
        qb.andWhere(deptCond, { departmentId });
      }
      return qb;
    };

    const [avgRow, totalReviews, reviewsThisMonth, distRows, latestRaw] =
      await Promise.all([
        buildBase().select('AVG(review.rating)', 'avg').getRawOne(),
        buildBase().getCount(),
        buildBase()
          .andWhere('review.reviewDate >= :date', { date: monthStart })
          .getCount(),
        buildBase()
          .select(['review.rating', 'COUNT(review.id) as count'])
          .groupBy('review.rating')
          .orderBy('review.rating', 'ASC')
          .getRawMany(),
        this.performanceRepository
          .createQueryBuilder('review')
          .leftJoin('review.employee', 'employee')
          .select([
            'review.rating',
            'review.feedback',
            'review.reviewDate',
            'employee.fullName',
          ])
          .where(deptCond, { departmentId })
          .orderBy('review.reviewDate', 'DESC')
          .limit(1)
          .getRawOne(),
      ]);

    return {
      averageRating: parseFloat(avgRow.avg) || 0,
      totalReviews,
      reviewsThisMonth,
      performanceDistribution: distRows.map((row) => ({
        rating: row.review_rating,
        count: parseInt(row.count, 10),
      })),
      latestReview: latestRaw
        ? {
            employeeName: latestRaw.employee_fullName ?? '',
            rating: latestRaw.review_rating,
            feedback: latestRaw.review_feedback,
            reviewDate: latestRaw.review_reviewDate,
          }
        : null,
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

  private getEmployeeInfo(employee: Employee): EmployeeInfo {
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
    const today = this.getBusinessDate();
    const firstDayOfMonthStr = this.getBusinessMonthStart();

    const [todayAttendance, monthlyPresent] = await Promise.all([
      this.attendanceRepository.findOne({
        where: { employee: { id: employeeId }, date: today },
      }),
      this.attendanceRepository
        .createQueryBuilder('attendance')
        .where('attendance."employeeId" = :employeeId', { employeeId })
        .andWhere('attendance.date >= :date', { date: firstDayOfMonthStr })
        .andWhere('attendance.isPresent = true')
        .getCount(),
    ]);

    // Rate is present days divided by the working days in the month so far,
    // not by the number of attendance rows (which is missing absent days when
    // the auto-absence job hasn't created rows yet).
    const workingDaysInMonth = this.getWorkingDaysInRange(
      firstDayOfMonthStr,
      today,
    ).length;
    const monthlyRate =
      workingDaysInMonth > 0 ? (monthlyPresent / workingDaysInMonth) * 100 : 0;

    const monthlyRateValue = parseFloat(monthlyRate.toFixed(2));
    const presentToday = todayAttendance?.isPresent ? 1 : 0;
    const absentToday = todayAttendance
      ? todayAttendance.isPresent
        ? 0
        : 1
      : 1;

    return {
      today: {
        checkIn: todayAttendance?.checkIn || null,
        checkOut: todayAttendance?.checkOut || null,
        status: todayAttendance?.isPresent ? 'present' : 'absent',
      },
      monthlyRate: monthlyRateValue,
      presentToday,
      absentToday,
      attendanceRate: monthlyRateValue,
    };
  }

  private async getEmployeeAttendanceTrend(
    employeeId: string,
  ): Promise<AttendanceTrend[]> {
    const today = this.getBusinessDate();
    const todayDate = new Date(`${today}T00:00:00Z`);
    const subtractDays = (n: number): string => {
      const d = new Date(todayDate);
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().split('T')[0];
    };
    const startDateStr = subtractDays(29);
    const workingDays = this.getWorkingDaysInRange(startDateStr, today);

    const rows = await this.attendanceRepository.find({
      where: {
        employee: { id: employeeId },
        date: Between(startDateStr, today),
      },
      relations: ['employee'],
    });
    const byDate = new Map<string, Attendance>();
    for (const row of rows) {
      byDate.set(row.date, row);
    }

    return workingDays.map((date) => {
      const att = byDate.get(date);
      const status = att?.status;
      const isPresent = att?.isPresent ?? false;
      const isLeave =
        status === AttendanceStatus.ON_LEAVE ||
        status === AttendanceStatus.EXCUSED;
      const present =
        isPresent ||
        status === AttendanceStatus.PRESENT ||
        status === AttendanceStatus.LATE
          ? 1
          : 0;
      const late = status === AttendanceStatus.LATE ? 1 : 0;
      const onLeave = isLeave ? 1 : 0;
      const absent = present === 0 && !isLeave ? 1 : 0;
      const attendanceRate = present === 1 ? 100 : 0;
      return {
        date,
        present,
        absent,
        late,
        onLeave,
        attendanceRate,
      };
    });
  }

  private async getEmployeeRecentActivities(
    userId: string,
  ): Promise<RecentActivity[]> {
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
      .where('auditLog.user = :userId', { userId })
      .orderBy('auditLog.createdAt', 'DESC')
      .limit(10)
      .getRawMany();

    return activities.map((row) => ({
      id: row.auditLog_id,
      action: row.auditLog_action,
      entity: row.auditLog_entity,
      description: row.auditLog_description,
      user: `${row.user_firstName ?? ''} ${row.user_lastName ?? ''}`.trim(),
      createdAt: formatInTimezone(row.auditLog_createdAt, this.configService),
    }));
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
    const monthStart = this.getBusinessMonthStart();

    const [
      averageRating,
      totalReviews,
      latestReview,
      reviewsThisMonth,
      distribution,
    ] = await Promise.all([
      this.performanceRepository
        .createQueryBuilder('review')
        .select('AVG(review.rating)', 'avg')
        .where('review."employeeId" = :employeeId', { employeeId })
        .getRawOne(),
      this.performanceRepository.count({
        where: { employee: { id: employeeId } },
      }),
      this.performanceRepository
        .createQueryBuilder('review')
        .where('review."employeeId" = :employeeId', { employeeId })
        .orderBy('review.reviewDate', 'DESC')
        .limit(1)
        .getOne(),
      this.performanceRepository
        .createQueryBuilder('review')
        .where('review."employeeId" = :employeeId', { employeeId })
        .andWhere('review.reviewDate >= :date', { date: monthStart })
        .getCount(),
      this.performanceRepository
        .createQueryBuilder('review')
        .select(['review.rating', 'COUNT(review.id) as count'])
        .where('review."employeeId" = :employeeId', { employeeId })
        .groupBy('review.rating')
        .orderBy('review.rating', 'ASC')
        .getRawMany(),
    ]);

    return {
      averageRating: parseFloat(averageRating.avg) || 0,
      totalReviews,
      reviewsThisMonth,
      performanceDistribution: distribution.map((row) => ({
        rating: row.review_rating,
        count: parseInt(row.count, 10),
      })),
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

  /**
   * Aggregated payroll metrics for a manager's department. Always scoped to the
   * manager's department (the departmentId comes from the JWT principal in the
   * caller). Returns zeroed metrics when the manager has no department.
   */
  private async getManagerPayrollStats(
    departmentId?: string,
  ): Promise<ManagerPayrollStats> {
    if (!departmentId) {
      return {
        totalEmployees: 0,
        totalBaseSalary: 0,
        totalDeductions: 0,
        totalBonuses: 0,
        totalNetSalary: 0,
        pendingPayroll: 0,
        approvedPayroll: 0,
        paidPayroll: 0,
      };
    }

    const row = await this.compensationRepository
      .createQueryBuilder('comp')
      .leftJoin('comp.employee', 'employee')
      .select('COUNT(comp.id)', 'count')
      .addSelect('COALESCE(SUM(comp.baseSalary), 0)', 'totalBaseSalary')
      .addSelect('COALESCE(SUM(comp.totalDeductions), 0)', 'totalDeductions')
      .addSelect('COALESCE(SUM(comp.totalBonuses), 0)', 'totalBonuses')
      .addSelect('COALESCE(SUM(comp.netSalary), 0)', 'totalNetSalary')
      .addSelect(
        `COUNT(CASE WHEN comp.status = 'CALCULATED' THEN 1 END)`,
        'pending',
      )
      .addSelect(
        `COUNT(CASE WHEN comp.status = 'APPROVED' THEN 1 END)`,
        'approved',
      )
      .addSelect(`COUNT(CASE WHEN comp.status = 'PAID' THEN 1 END)`, 'paid')
      .where('employee.departmentId = :departmentId', { departmentId })
      .getRawOne<{
        totalBaseSalary: string;
        totalDeductions: string;
        totalBonuses: string;
        totalNetSalary: string;
        pending: string;
        approved: string;
        paid: string;
      }>();

    const totalEmployees = await this.employeeRepository.count({
      where: { department: { id: departmentId }, isActive: true },
    });

    return {
      totalEmployees,
      totalBaseSalary: Number(row?.totalBaseSalary) || 0,
      totalDeductions: Number(row?.totalDeductions) || 0,
      totalBonuses: Number(row?.totalBonuses) || 0,
      totalNetSalary: Number(row?.totalNetSalary) || 0,
      pendingPayroll: parseInt(row?.pending ?? '0', 10) || 0,
      approvedPayroll: parseInt(row?.approved ?? '0', 10) || 0,
      paidPayroll: parseInt(row?.paid ?? '0', 10) || 0,
    };
  }

  /**
   * Current-month payroll plus history for the authenticated employee.
   */
  private async getEmployeePayrollStats(
    employeeId: string,
  ): Promise<EmployeePayrollStats> {
    const [year, month] = getBusinessDate().split('-').map(Number);

    const [current, history] = await Promise.all([
      this.compensationRepository.findOne({
        where: { employee: { id: employeeId }, month, year },
        relations: ['deductions', 'bonuses'],
      }),
      this.compensationRepository.find({
        where: { employee: { id: employeeId } },
        relations: ['deductions', 'bonuses'],
        order: { year: 'DESC', month: 'DESC' },
      }),
    ]);

    return {
      currentMonth: current ? this.mapCompensation(current) : null,
      history: history.map((comp) => this.mapCompensation(comp)),
    };
  }

  private mapCompensation(comp: Compensation): EmployeePayrollEntry {
    return {
      id: comp.id,
      month: comp.month,
      year: comp.year,
      baseSalary: comp.baseSalary,
      workingDays: comp.workingDays,
      attendedDays: comp.attendedDays,
      absentDays: comp.absentDays,
      leaveDays: comp.leaveDays,
      attendanceDeduction: comp.attendanceDeduction,
      totalDeductions: comp.totalDeductions,
      bonuses: comp.totalBonuses,
      netSalary: comp.netSalary,
      status: comp.status,
    };
  }
}
