import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { v5 as uuidv5 } from 'uuid';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  getBusinessDate,
  getTimezone,
  getWeekdayInTimezone,
} from '@/common/utils/timezones.util';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { Employee } from '@/employees/entities/employee.entity';
import { Department } from '@/department/entities/department.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { LeaveStatus } from '@/leave/interfaces/leave.status';
import { AttendanceStatus } from '@/common/constants/enums';
import { AuditAction } from '@/audit-logs/enums/audit-action.enum';
import {
  AdminAttendanceQueryDto,
  MonthlyAttendanceQueryDto,
} from './dto/admin-attendance-query.dto';

export type MonthlyAttendanceDay = {
  date: string;
  day: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus | 'UPCOMING' | 'WEEKEND';
  leaveReason?: string | null;
};

export type EmployeeMonthlySummary = {
  workingDays: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
  attendanceRate: number;
};

export type EmployeeMonthlyAttendance = {
  employeeId: string;
  employeeName: string;
  email: string | null;
  department: string | null;
  position: string | null;
  summary: EmployeeMonthlySummary;
  attendance: MonthlyAttendanceDay[];
};

export type CompanyMonthlySummary = {
  totalEmployees: number;
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  totalLeave: number;
  totalLate: number;
  overallAttendanceRate: number;
};

export type MonthlyAttendanceReport = {
  month: number;
  year: number;
  totalEmployees: number;
  employees: EmployeeMonthlyAttendance[];
  summary: CompanyMonthlySummary;
};

type AttendanceStatusRow = {
  employeeId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  isPresent: boolean;
  status: AttendanceStatus | null;
};

export type AdminAttendanceItem = {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  department: string | null;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
};

export type AdminAttendancePage = {
  data: AdminAttendanceItem[];
  workingDays: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type AdminAttendanceSummary = {
  date: string;
  totalEmployees: number;
  present: number;
  absent: number;
  onLeave: number;
  late: number;
  workingDays: number;
  attendanceRate: number;
};

export type EmployeeAttendanceSummary = {
  employeeId: string;
  employeeName: string;
  totalWorkingDays: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
  workingDays: number;
  attendanceRate: number;
};

@Injectable()
export class AdminAttendanceService {
  // RFC 4122 DNS namespace, used to derive stable UUIDs for report rows that
  // have no persisted attendance record (e.g. absent employees).
  private static readonly ATTENDANCE_ROW_NAMESPACE =
    '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private getBusinessDate(): string {
    return getBusinessDate(this.configService);
  }

  /**
   * Source-of-truth status for a row. Older rows may predate the `status`
   * column, so fall back to `isPresent` when `status` is null.
   */
  private deriveStatus(record: {
    status?: AttendanceStatus | null;
    isPresent: boolean;
  }): AttendanceStatus {
    if (record.status) {
      return record.status;
    }
    return record.isPresent ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT;
  }

  private getTimezone(): string {
    return getTimezone(this.configService);
  }

  private getWeekdayInTimezone(
    year: number,
    month: number,
    day: number,
  ): number {
    return getWeekdayInTimezone(year, month, day, this.configService);
  }

  /**
   * Returns every business date (YYYY-MM-DD) that falls inside the given
   * calendar month, interpreted in the application's attendance timezone.
   *
   * A plain iteration over day 1..31 (with a small buffer to absorb timezone
   * shifts at month boundaries) is formatted in the configured timezone and
   * filtered to the requested month. This keeps the generated dates aligned
   * with how attendance rows are actually stored (the check-in / auto-absence
   * jobs also use ATTENDANCE_TIMEZONE), regardless of the server's local clock.
   */
  private getMonthBusinessDates(
    year: number,
    month: number,
    tz: string,
  ): string[] {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const seen = new Set<string>();
    const result: string[] = [];

    for (let day = 0; day <= 31; day++) {
      const instant = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const formatted = formatter.format(instant);
      const [y, m] = formatted.split('-').map(Number);
      if (y === year && m === month && !seen.has(formatted)) {
        seen.add(formatted);
        result.push(formatted);
      }
    }

    result.sort();
    return result;
  }

  /**
   * Returns every business date (YYYY-MM-DD) between `startDate` and `endDate`
   * inclusive, formatted in the application's attendance timezone. Used to
   * enumerate the days an absence report should cover.
   */
  private getDatesBetween(
    startDate: string,
    endDate: string,
    tz: string,
  ): string[] {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const start = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
    const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(formatter.format(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  private getWeekday(dateStr: string): string {
    const tz = this.getTimezone();
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'long',
    }).format(new Date(`${dateStr}T12:00:00Z`));
  }

  private isWeekend(dateStr: string): boolean {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dayOfWeek = this.getWeekdayInTimezone(y, m, d);
    return dayOfWeek === 5 || dayOfWeek === 6;
  }

  /**
   * Counts the working days (Monday–Friday, weekends excluded) from the 1st of
   * the month of `dateStr` up to and including `dateStr`. Used to report
   * "working days so far this month" alongside attendance figures.
   */
  private countWorkingDaysUpTo(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number);
    let count = 0;
    for (let day = 1; day <= d; day++) {
      const dayOfWeek = this.getWeekdayInTimezone(y, m, day);
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
    }
    return count;
  }

  private async getApprovedLeaveEmployeeIds(
    date: string,
  ): Promise<Set<string>> {
    const rows = await this.leaveRepository
      .createQueryBuilder('leave')
      .select('leave."employeeId"', 'employeeId')
      .where('leave.status = :status', { status: LeaveStatus.APPROVED })
      .andWhere('leave.startDate <= :date', { date })
      .andWhere('leave.endDate >= :date', { date })
      .getRawMany<{ employeeId: string }>();
    return new Set(rows.map((row) => row.employeeId));
  }

  async getMonthlyReport(
    query: MonthlyAttendanceQueryDto,
    adminId?: string,
  ): Promise<MonthlyAttendanceReport> {
    const { month, year, departmentId, employeeId, search } = query;
    const tz = this.getTimezone();
    const today = this.getBusinessDate();

    // 1. Department existence check (when filtering by department).
    if (departmentId) {
      const department = await this.departmentRepository.findOne({
        where: { id: departmentId },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    // 2. Build the list of business dates that belong to this month, in the
    //    application's attendance timezone.
    const monthDates = this.getMonthBusinessDates(year, month, tz);
    const startDate = monthDates[0];
    const endDate = monthDates[monthDates.length - 1];

    // 3. Employees (one query, all DB-level filters). Active employees only.
    const employeeQuery = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.department', 'department')
      .where('employee.isActive = true');
    if (departmentId) {
      employeeQuery.andWhere('department.id = :departmentId', { departmentId });
    }
    if (employeeId) {
      employeeQuery.andWhere('employee.id = :employeeId', { employeeId });
    }
    if (search) {
      employeeQuery.andWhere(
        '(employee.fullName ILIKE :search OR employee.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    const employees = await employeeQuery.getMany();

    if (employeeId && employees.length === 0) {
      throw new NotFoundException('Employee not found');
    }

    const employeeIds = employees.map((employee) => employee.id);

    // 4. Attendance rows for the whole month, for all selected employees, in a
    //    single query (no N+1). Keyed by employeeId -> date.
    const attendanceByEmployee = new Map<string, Map<string, AttendanceStatusRow>>();
    if (employeeIds.length > 0) {
      const rows = await this.attendanceRepository
        .createQueryBuilder('att')
        .select('att."employeeId"', 'employeeId')
        .addSelect("TO_CHAR(att.date, 'YYYY-MM-DD')", 'date')
        .addSelect('att.checkIn', 'checkIn')
        .addSelect('att.checkOut', 'checkOut')
        .addSelect('att.isPresent', 'isPresent')
        .addSelect('att.status', 'status')
        .where('att.date BETWEEN :start AND :end', {
          start: startDate,
          end: endDate,
        })
        .andWhere('att.employeeId IN (:...ids)', { ids: employeeIds })
        .getRawMany<AttendanceStatusRow>();
      for (const row of rows) {
        if (!row.employeeId) {
          continue;
        }
        const key = String(row.employeeId);
        if (!attendanceByEmployee.has(key)) {
          attendanceByEmployee.set(key, new Map());
        }
        attendanceByEmployee.get(key)!.set(row.date, row);
      }
    }

    // 5. Approved leaves overlapping the month, in a single query. Keyed by
    //    employeeId -> date -> reason.
    const leaveByEmployee = new Map<string, Map<string, string | null>>();
    const leaveRows = await this.leaveRepository
      .createQueryBuilder('leave')
        .select('leave."employeeId"', 'employeeId')
        .addSelect("TO_CHAR(leave.startDate, 'YYYY-MM-DD')", 'startDate')
        .addSelect("TO_CHAR(leave.endDate, 'YYYY-MM-DD')", 'endDate')
        .addSelect('leave.reason', 'reason')
      .where('leave.status = :status', { status: LeaveStatus.APPROVED })
      .andWhere('leave.startDate <= :end', { end: endDate })
      .andWhere('leave.endDate >= :start', { start: startDate })
      .getRawMany<{
        employeeId: string;
        startDate: string;
        endDate: string;
        reason: string | null;
      }>();
      for (const leave of leaveRows) {
        if (!leave.employeeId) {
          continue;
        }
        const key = String(leave.employeeId);
        if (!leaveByEmployee.has(key)) {
          leaveByEmployee.set(key, new Map());
        }
        const dateMap = leaveByEmployee.get(key)!;
      for (const date of monthDates) {
        if (date >= leave.startDate && date <= leave.endDate) {
          if (!dateMap.has(date)) {
            dateMap.set(date, leave.reason ?? null);
          }
        }
      }
    }

    // 6. Build the per-employee report in memory.
    const employeesReport: EmployeeMonthlyAttendance[] = [];
    let companyPresent = 0;
    let companyAbsent = 0;
    let companyLeave = 0;
    let companyLate = 0;
    let companyWorkingDays = 0;

    for (const employee of employees) {
      const attMap =
        attendanceByEmployee.get(String(employee.id)) ?? new Map();
      const leaveMap =
        leaveByEmployee.get(String(employee.id)) ?? new Map();
      const attendance: MonthlyAttendanceDay[] = [];
      let present = 0;
      let absent = 0;
      let leave = 0;
      let late = 0;
      let excused = 0;

      for (const date of monthDates) {
        const record = attMap.get(date);
        const isFuture = date > today;
        const weekend = this.isWeekend(date);
        let status: AttendanceStatus | 'UPCOMING' | 'WEEKEND';
        let checkIn: string | null = null;
        let checkOut: string | null = null;
        let leaveReason: string | null = null;

        if (weekend) {
          // Weekends are non-working: shown for grid completeness but never
          // counted as present, absent, or as a working day.
          status = 'WEEKEND';
          if (record) {
            checkIn = record.checkIn ?? null;
            checkOut = record.checkOut ?? null;
          }
        } else if (record) {
          checkIn = record.checkIn ?? null;
          checkOut = record.checkOut ?? null;
          if (checkIn) {
            // Attended: a real check-in means the employee was present,
            // regardless of the stored status. Preserve the LATE distinction
            // when the row was explicitly marked late.
            status =
              record.status === AttendanceStatus.LATE
                ? AttendanceStatus.LATE
                : AttendanceStatus.PRESENT;
          } else if (this.deriveStatus(record) === AttendanceStatus.ON_LEAVE) {
            status = AttendanceStatus.ON_LEAVE;
            if (leaveMap.has(date)) {
              leaveReason = leaveMap.get(date) ?? null;
            }
          } else {
            status = this.deriveStatus(record);
          }
        } else if (isFuture) {
          // The day hasn't occurred yet in the selected month, so it must not
          // be reported as ABSENT (or counted as a working day).
          status = 'UPCOMING';
        } else if (leaveMap.has(date)) {
          status = AttendanceStatus.ON_LEAVE;
          leaveReason = leaveMap.get(date) ?? null;
        } else {
          status = AttendanceStatus.ABSENT;
        }

        // Weekend and not-yet-occurred days are excluded from all tallies.
        if (status !== 'UPCOMING' && status !== 'WEEKEND') {
          switch (status) {
            case AttendanceStatus.PRESENT:
              present++;
              break;
            case AttendanceStatus.LATE:
              present++;
              late++;
              break;
            case AttendanceStatus.ON_LEAVE:
              leave++;
              break;
            case AttendanceStatus.EXCUSED:
              excused++;
              break;
            default:
              // Any other status is treated as absent (counted via derivation
              // below so the buckets always sum to workingDays).
              break;
          }
        }

        attendance.push({
          date,
          day: this.getWeekday(date),
          checkIn,
          checkOut,
          status,
          leaveReason,
        });
      }

      const workingDays = monthDates.filter(
        (d) => d <= today && !this.isWeekend(d),
      ).length;
      const presentDays = present; // present includes late days
      // Derive absent from the working-day total so the buckets are always
      // consistent: absent = workingDays - present - leave - excused.
      absent = Math.max(0, workingDays - presentDays - leave - excused);
      const attendanceRate =
        workingDays > 0
          ? Number(((presentDays / workingDays) * 100).toFixed(2))
          : 0;

      companyPresent += presentDays;
      companyAbsent += absent;
      companyLeave += leave;
      companyLate += late;
      companyWorkingDays += workingDays;

      employeesReport.push({
        employeeId: employee.id,
        employeeName: employee.fullName,
        email: employee.email ?? null,
        department: employee.department?.name ?? null,
        position: employee.position ?? null,
        summary: {
          workingDays,
          present: presentDays,
          absent,
          leave,
          late,
          attendanceRate,
        },
        attendance,
      });
    }

    const overallAttendanceRate =
      companyWorkingDays > 0
        ? Number(((companyPresent / companyWorkingDays) * 100).toFixed(2))
        : 0;

    const report: MonthlyAttendanceReport = {
      month,
      year,
      totalEmployees: employees.length,
      employees: employeesReport,
      summary: {
        totalEmployees: employees.length,
        totalWorkingDays: companyWorkingDays,
        totalPresent: companyPresent,
        totalAbsent: companyAbsent,
        totalLeave: companyLeave,
        totalLate: companyLate,
        overallAttendanceRate,
      },
    };

    // 7. Audit trail via the existing event-driven AuditLog architecture.
    this.eventEmitter.emit('audit.log.created', {
      userId: adminId,
      action: AuditAction.VIEW_MONTHLY_ATTENDANCE,
      entity: 'Attendance',
      entityId: `${year}-${String(month).padStart(2, '0')}`,
      description: `Admin viewed monthly attendance report for ${year}-${month}`,
    });

    return report;
  }

  async getTodayAttendance(): Promise<{
    date: string;
    totalEmployees: number;
    totalExpected: number;
    present: number;
    absent: number;
    onLeave: number;
    late: number;
    onTime: number;
    checkedInToday: number;
    checkedOutToday: number;
    attendanceRate: number;
    workingDays: number;
    notCheckedIn: {
      employeeId: string;
      employeeName: string;
      department: string | null;
    }[];
    departments: {
      department: string | null;
      total: number;
      present: number;
      absent: number;
      onLeave: number;
      late: number;
      attendanceRate: number;
    }[];
    attendance: AdminAttendanceItem[];
  }> {
    const date = this.getBusinessDate();
    const employees = await this.employeeRepository.find({
      where: { isActive: true },
      relations: ['department'],
    });
    const attendances = await this.attendanceRepository.find({
      where: { date },
      relations: ['employee', 'employee.department'],
    });
    const attendanceMap = new Map<string, Attendance>();
    for (const att of attendances) {
      if (att.employee?.id) {
        attendanceMap.set(att.employee.id, att);
      }
    }
    const onLeaveIds = await this.getApprovedLeaveEmployeeIds(date);

    let present = 0;
    let absent = 0;
    let onLeave = 0;
    let late = 0;
    const notCheckedIn: {
      employeeId: string;
      employeeName: string;
      department: string | null;
    }[] = [];
    const deptMap = new Map<
      string,
      {
        department: string | null;
        total: number;
        present: number;
        absent: number;
        onLeave: number;
        late: number;
      }
    >();

    const attendance: AdminAttendanceItem[] = employees.map((employee) => {
      const att = attendanceMap.get(employee.id);
      let status: AttendanceStatus;
      if (att) {
        status = this.deriveStatus(att);
      } else if (onLeaveIds.has(employee.id)) {
        status = AttendanceStatus.ON_LEAVE;
      } else {
        status = AttendanceStatus.ABSENT;
      }

      switch (status) {
        case AttendanceStatus.PRESENT:
          present++;
          break;
        case AttendanceStatus.LATE:
          present++;
          late++;
          break;
        case AttendanceStatus.ON_LEAVE:
          onLeave++;
          break;
        default:
          absent++;
      }

      const department = employee.department?.name ?? null;
      if (!deptMap.has(department ?? '')) {
        deptMap.set(department ?? '', {
          department,
          total: 0,
          present: 0,
          absent: 0,
          onLeave: 0,
          late: 0,
        });
      }
      const dept = deptMap.get(department ?? '')!;
      dept.total++;
      if (status === AttendanceStatus.PRESENT) dept.present++;
      else if (status === AttendanceStatus.LATE) {
        dept.present++;
        dept.late++;
      } else if (status === AttendanceStatus.ON_LEAVE) dept.onLeave++;
      else dept.absent++;

      if (status === AttendanceStatus.ABSENT) {
        notCheckedIn.push({
          employeeId: employee.id,
          employeeName: employee.fullName,
          department,
        });
      }

      return {
        id: uuidv5(`${employee.id}:${date}`, AdminAttendanceService.ATTENDANCE_ROW_NAMESPACE),
        employeeId: employee.id,
        employeeName: employee.fullName,
        department,
        date,
        checkIn: att?.checkIn ?? null,
        checkOut: att?.checkOut ?? null,
        status,
      };
    });

    const checkedInToday = attendances.filter((a) => a.checkIn).length;
    const checkedOutToday = attendances.filter((a) => a.checkOut).length;
    const onTime = present - late;
    const totalExpected = employees.length - onLeave;
    const attendanceRate =
      totalExpected > 0 ? Number(((present / totalExpected) * 100).toFixed(1)) : 0;

    const departments = Array.from(deptMap.values()).map((d) => ({
      ...d,
      attendanceRate:
        d.total - d.onLeave > 0
          ? Number(((d.present / (d.total - d.onLeave)) * 100).toFixed(1))
          : 0,
    }));

    return {
      date,
      totalEmployees: employees.length,
      totalExpected,
      present,
      absent,
      onLeave,
      late,
      onTime,
      checkedInToday,
      checkedOutToday,
      attendanceRate,
      workingDays: this.countWorkingDaysUpTo(date),
      notCheckedIn,
      departments,
      attendance,
    };
  }

  private buildAttendanceQuery(query: AdminAttendanceQueryDto) {
    const qb = this.attendanceRepository
      .createQueryBuilder('att')
      .leftJoinAndSelect('att.employee', 'employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoin('employee.user', 'user');

    if (query.employeeId) {
      qb.andWhere('employee.id = :employeeId', { employeeId: query.employeeId });
    }
    if (query.departmentId) {
      qb.andWhere('department.id = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.status) {
      qb.andWhere('att.status = :status', { status: query.status });
    }
    if (query.startDate) {
      qb.andWhere('att.date >= :startDate', { startDate: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('att.date <= :endDate', { endDate: query.endDate });
    }
    if (query.search) {
      qb.andWhere(
        '(employee.fullName ILIKE :search OR user.username ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    return qb;
  }

  private toItem(att: Attendance): AdminAttendanceItem {
    return {
      id: String(att.id),
      employeeId: att.employee?.id ?? null,
      employeeName: att.employee?.fullName ?? null,
      department: att.employee?.department?.name ?? null,
      date: att.date,
      checkIn: att.checkIn ?? null,
      checkOut: att.checkOut ?? null,
      status: this.deriveStatus(att),
    };
  }

  private async paginate(
    qb: ReturnType<AdminAttendanceService['buildAttendanceQuery']>,
    page: number,
    limit: number,
  ): Promise<AdminAttendancePage> {
    const safePage = page && page > 0 ? page : 1;
    const safeLimit = limit && limit > 0 ? limit : 10;
    const [items, total] = await qb
      .orderBy('att.date', 'DESC')
      .addOrderBy('employee.fullName', 'ASC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();
    return {
      data: items.map((item) => this.toItem(item)),
      workingDays: this.countWorkingDaysUpTo(this.getBusinessDate()),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  getList(query: AdminAttendanceQueryDto): Promise<AdminAttendancePage> {
    const qb = this.buildAttendanceQuery(query);
    return this.paginate(qb, query.page ?? 1, query.limit ?? 10);
  }

  async getAbsent(query: AdminAttendanceQueryDto): Promise<AdminAttendancePage> {
    const tz = this.getTimezone();
    const today = this.getBusinessDate();

    // Resolve the evaluated date range. Default to today (single day) so the
    // endpoint reports who is currently absent instead of returning nothing
    // just because the auto-absence job hasn't created rows yet. Future dates
    // are never treated as absent.
    let start = query.startDate ?? today;
    let end = query.endDate ?? start;
    if (start > today) {
      start = today;
    }
    if (end > today) {
      end = today;
    }
    if (start > end) {
      const swap = start;
      start = end;
      end = swap;
    }
    const dates = this.getDatesBetween(start, end, tz);

    // Employees matching the org filters (active only).
    const employeeQb = this.employeeRepository
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.department', 'department')
      .leftJoin('employee.user', 'user')
      .where('employee.isActive = true');
    if (query.employeeId) {
      employeeQb.andWhere('employee.id = :employeeId', {
        employeeId: query.employeeId,
      });
    }
    if (query.departmentId) {
      employeeQb.andWhere('department.id = :departmentId', {
        departmentId: query.departmentId,
      });
    }
    if (query.search) {
      employeeQb.andWhere(
        '(employee.fullName ILIKE :search OR user.username ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    const employees = await employeeQb.getMany();
    const employeeIds = employees.map((employee) => employee.id);

    // Attendance rows within the range, keyed by employeeId -> date.
    const attendanceByEmployee = new Map<
      string,
      Map<string, AttendanceStatusRow>
    >();
    if (employeeIds.length > 0) {
      const rows = await this.attendanceRepository
        .createQueryBuilder('att')
        .select('att."employeeId"', 'employeeId')
        .addSelect("TO_CHAR(att.date, 'YYYY-MM-DD')", 'date')
        .addSelect('att.checkIn', 'checkIn')
        .addSelect('att.checkOut', 'checkOut')
        .addSelect('att.isPresent', 'isPresent')
        .addSelect('att.status', 'status')
        .where('att.date BETWEEN :start AND :end', { start, end })
        .andWhere('att.employeeId IN (:...ids)', { ids: employeeIds })
        .getRawMany<AttendanceStatusRow>();
      for (const row of rows) {
        if (!row.employeeId) {
          continue;
        }
        const key = String(row.employeeId);
        if (!attendanceByEmployee.has(key)) {
          attendanceByEmployee.set(key, new Map());
        }
        attendanceByEmployee.get(key)!.set(row.date, row);
      }
    }

    // Approved leaves within the range, keyed by employeeId -> set of dates.
    const leaveByEmployee = new Map<string, Set<string>>();
    if (employeeIds.length > 0) {
      const leaveRows = await this.leaveRepository
        .createQueryBuilder('leave')
        .select('leave."employeeId"', 'employeeId')
        .addSelect("TO_CHAR(leave.startDate, 'YYYY-MM-DD')", 'startDate')
        .addSelect("TO_CHAR(leave.endDate, 'YYYY-MM-DD')", 'endDate')
        .where('leave.status = :status', { status: LeaveStatus.APPROVED })
        .andWhere('leave.startDate <= :end', { end })
        .andWhere('leave.endDate >= :start', { start })
        .andWhere('leave.employeeId IN (:...ids)', { ids: employeeIds })
        .getRawMany<{
          employeeId: string;
          startDate: string;
          endDate: string;
        }>();
      for (const leave of leaveRows) {
        if (!leave.employeeId) {
          continue;
        }
        const key = String(leave.employeeId);
        if (!leaveByEmployee.has(key)) {
          leaveByEmployee.set(key, new Set());
        }
        const set = leaveByEmployee.get(key)!;
        for (const date of dates) {
          if (date >= leave.startDate && date <= leave.endDate) {
            set.add(date);
          }
        }
      }
    }

    // Build one item per (employee, absent-date). An employee is absent on a
    // date when they have no attendance row and are not on approved leave
    // (matching the source-of-truth derivation used by the summary endpoints).
    const items: AdminAttendanceItem[] = [];
    for (const employee of employees) {
      const attMap =
        attendanceByEmployee.get(String(employee.id)) ?? new Map();
      const leaveSet = leaveByEmployee.get(String(employee.id)) ?? new Set();
      for (const date of dates) {
        const att = attMap.get(date);
        let status: AttendanceStatus;
        if (att) {
          status = this.deriveStatus(att);
        } else if (leaveSet.has(date)) {
          status = AttendanceStatus.ON_LEAVE;
        } else {
          status = AttendanceStatus.ABSENT;
        }
        if (status === AttendanceStatus.ABSENT) {
          items.push({
            id: uuidv5(
              `${employee.id}:${date}`,
              AdminAttendanceService.ATTENDANCE_ROW_NAMESPACE,
            ),
            employeeId: employee.id,
            employeeName: employee.fullName,
            department: employee.department?.name ?? null,
            date,
            checkIn: att?.checkIn ?? null,
            checkOut: att?.checkOut ?? null,
            status,
          });
        }
      }
    }

    const safePage = query.page && query.page > 0 ? query.page : 1;
    const safeLimit = query.limit && query.limit > 0 ? query.limit : 10;
    const total = items.length;
    const startIdx = (safePage - 1) * safeLimit;
    const paged = items.slice(startIdx, startIdx + safeLimit);

    return {
      data: paged,
      workingDays: this.countWorkingDaysUpTo(today),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async getSummary(date?: string): Promise<AdminAttendanceSummary> {
    const targetDate = date ?? this.getBusinessDate();
    const employees = await this.employeeRepository.find({
      where: { isActive: true },
      select: ['id'],
    });
    const totalEmployees = employees.length;
    const attendances = await this.attendanceRepository.find({
      where: { date: targetDate },
      relations: ['employee'],
    });
    const attendanceMap = new Map<string, Attendance>();
    for (const att of attendances) {
      if (att.employee?.id) {
        attendanceMap.set(att.employee.id, att);
      }
    }
    const onLeaveIds = await this.getApprovedLeaveEmployeeIds(targetDate);

    let present = 0;
    let absent = 0;
    let onLeave = 0;
    let late = 0;

    for (const employee of employees) {
      const att = attendanceMap.get(employee.id);
      let status: AttendanceStatus;
      if (att) {
        status = this.deriveStatus(att);
      } else if (onLeaveIds.has(employee.id)) {
        status = AttendanceStatus.ON_LEAVE;
      } else {
        status = AttendanceStatus.ABSENT;
      }
      switch (status) {
        case AttendanceStatus.PRESENT:
          present++;
          break;
        case AttendanceStatus.LATE:
          present++;
          late++;
          break;
        case AttendanceStatus.ON_LEAVE:
          onLeave++;
          break;
        default:
          absent++;
      }
    }

    const expected = totalEmployees - onLeave;
    const attendanceRate =
      expected > 0 ? Number(((present / expected) * 100).toFixed(1)) : 0;

    return {
      date: targetDate,
      totalEmployees,
      present,
      absent,
      onLeave,
      late,
      workingDays: this.countWorkingDaysUpTo(targetDate),
      attendanceRate,
    };
  }

  getEmployeeHistory(
    employeeId: string,
    query: AdminAttendanceQueryDto,
  ): Promise<AdminAttendancePage> {
    const qb = this.buildAttendanceQuery({ ...query, employeeId });
    return this.paginate(qb, query.page ?? 1, query.limit ?? 10);
  }

  async getEmployeeSummary(
    employeeId: string,
  ): Promise<EmployeeAttendanceSummary> {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    const records = await this.attendanceRepository.find({
      where: { employee: { id: employeeId } },
    });

    const total = records.length;
    let present = 0;
    let absent = 0;
    let leave = 0;
    let late = 0;

    for (const record of records) {
      const status = this.deriveStatus(record);
      switch (status) {
        case AttendanceStatus.PRESENT:
          present++;
          break;
        case AttendanceStatus.LATE:
          present++;
          late++;
          break;
        case AttendanceStatus.ON_LEAVE:
          leave++;
          break;
        default:
          absent++;
      }
    }

    const workingDays = this.countWorkingDaysUpTo(this.getBusinessDate());
    const attendanceRate =
      workingDays > 0
        ? Number(((present / workingDays) * 100).toFixed(1))
        : 0;

    return {
      employeeId: employee.id,
      employeeName: employee.fullName,
      totalWorkingDays: total,
      present,
      absent,
      leave,
      late,
      workingDays,
      attendanceRate,
    };
  }
}
