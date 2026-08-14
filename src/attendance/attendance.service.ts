import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Attendance } from './entities/attendance.entity';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { LeaveStatus } from '@/leave/interfaces/leave.status';
import { AttendanceStatus } from '@/common/constants/enums';
import { EmployeesService } from '../employees/employees.service';
import { UsersService } from '../users/users.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { AttendanceRecordedEvent } from '../common/events/attendance-recorded.event';

type AttendanceEmployeeResponse = Omit<Employee, 'user'> & {
  profilePicture: string | null;
};

type AttendanceResponse = Omit<Attendance, 'employee'> & {
  employee: AttendanceEmployeeResponse;
};

export type AutoAbsenceSummary = {
  date: string;
  totalActive: number;
  alreadyAttended: number;
  markedAbsent: number;
};

export type EmployeeAttendanceSummary = {
  employeeId: string;
  employeeName: string;
  totalWorkingDays: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
  attendanceRate: number;
};

@Injectable()
export class AttendanceService {
  private readonly defaultTimezone = 'UTC';

  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
    private readonly usersService: UsersService,
    private readonly employeesService: EmployeesService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  async checkIn(userId: string) {
    const employee = await this.getEmployeeForUser(userId);
    const today = this.getTodayDate();

    if (this.getCurrentBusinessHour() >= 12) {
      throw new BadRequestException(
        'Check-in is not allowed after 12:00 PM',
      );
    }

    const existing = await this.attendanceRepository.findOne({
      where: { employee: { id: employee.id }, date: today },
    });

    if (existing) {
      if (existing.checkIn) {
        throw new ConflictException('Already checked in for today');
      }
      existing.checkIn = this.getCurrentTime();
      existing.isPresent = true;
      existing.status = this.isLate(existing.checkIn)
        ? AttendanceStatus.LATE
        : AttendanceStatus.PRESENT;
      const savedAttendance = await this.attendanceRepository.save(existing);
      this.eventEmitter.emit('audit.log.created', {
        userId,
        action: AuditAction.CHECK_IN,
        entity: 'Attendance',
        entityId: String(savedAttendance.id),
        description: 'Employee checked in',
      });
      this.eventEmitter.emit(
        'attendance.recorded',
        new AttendanceRecordedEvent(
          userId,
          employee.id,
          String(savedAttendance.id),
        ),
      );
      return savedAttendance;
    }

    const checkInTime = this.getCurrentTime();
    const attendance = this.attendanceRepository.create({
      employee,
      date: today,
      checkIn: checkInTime,
      isPresent: true,
      status: this.isLate(checkInTime)
        ? AttendanceStatus.LATE
        : AttendanceStatus.PRESENT,
    });

    const savedAttendance = await this.attendanceRepository.save(attendance);
    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.CHECK_IN,
      entity: 'Attendance',
      entityId: String(savedAttendance.id),
      description: 'Employee checked in',
    });
    this.eventEmitter.emit(
      'attendance.recorded',
      new AttendanceRecordedEvent(
        userId,
        employee.id,
        String(savedAttendance.id),
      ),
    );

    return savedAttendance;
  }

  async checkOut(userId: string) {
    const employee = await this.getEmployeeForUser(userId);
    const today = this.getTodayDate();

    const attendance = await this.attendanceRepository.findOne({
      where: { employee: { id: employee.id }, date: today },
    });

    if (!attendance || !attendance.checkIn) {
      throw new BadRequestException(
        'Check-out is not allowed: you must check in before checking out',
      );
    }

    if (attendance.checkOut) {
      throw new ConflictException('Already checked out for today');
    }

    attendance.checkOut = this.getCurrentTime();
    // Re-affirm presence: an employee who can check out was demonstrably
    // present. This also guards against the daily auto-absence job having
    // marked this row absent (e.g. a run just before check-out) - the explicit
    // flag keeps the record consistent with the actual attendance.
    attendance.isPresent = true;
    await this.attendanceRepository.save(attendance);

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.CHECK_OUT,
      entity: 'Attendance',
      entityId: String(attendance.id),
      description: 'Employee checked out',
    });
    this.eventEmitter.emit(
      'attendance.recorded',
      new AttendanceRecordedEvent(userId, employee.id, String(attendance.id)),
    );

    return {
      ...attendance,
      workedHours: this.calculateWorkedHours(
        attendance.checkIn,
        attendance.checkOut,
      ),
    };
  }

  findAll(): Promise<AttendanceResponse[]> {
    return this.findAllWithEmployee({});
  }

  async findByEmployee(employeeId: string): Promise<AttendanceResponse[]> {
    await this.employeesService.findOne(employeeId);

    return this.findAllWithEmployee({ employee: { id: employeeId } });
  }

  /**
   * Attendance history for the currently authenticated employee.
   */
  async getMyAttendance(userId: string): Promise<AttendanceResponse[]> {
    const employee = await this.getEmployeeForUser(userId);

    return this.findAllWithEmployee({ employee: { id: employee.id } });
  }

  /**
   * Personal attendance summary (present / absent / late / on-leave counts and
   * attendance rate) for the currently authenticated employee.
   */
  async getMyAttendanceSummary(
    userId: string,
  ): Promise<EmployeeAttendanceSummary> {
    const employee = await this.getEmployeeForUser(userId);
    const records = await this.attendanceRepository.find({
      where: { employee: { id: employee.id } },
    });

    const total = records.length;
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;

    for (const record of records) {
      switch (this.deriveStatus(record)) {
        case AttendanceStatus.PRESENT:
          present++;
          break;
        case AttendanceStatus.LATE:
          present++;
          late++;
          break;
        case AttendanceStatus.ABSENT:
          absent++;
          break;
        case AttendanceStatus.ON_LEAVE:
          leave++;
          break;
      }
    }

    const attendanceRate = total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0;

    return {
      employeeId: employee.id,
      employeeName: employee.fullName,
      totalWorkingDays: total,
      present,
      absent,
      leave,
      late,
      attendanceRate,
    };
  }

  private async findAllWithEmployee(
    where: FindOptionsWhere<Attendance>,
  ): Promise<AttendanceResponse[]> {
    const records = await this.attendanceRepository.find({
      where,
      relations: ['employee', 'employee.user'],
    });
    return records.map((record) => this.toResponse(record));
  }

  /**
   * Lifts the employee's profile picture (which lives on the linked user
   * account) up to the nested employee object and strips the user relation so
   * credentials and other user fields are never returned to the client.
   */
  private toResponse(attendance: Attendance): AttendanceResponse {
    const { user, ...employee } = attendance.employee;
    return {
      ...attendance,
      employee: {
        ...employee,
        profilePicture: user?.profilePicture ?? null,
      },
    };
  }

  private async getEmployeeForUser(userId: string) {
    const user = await this.usersService.findOne(userId);

    if (!user || !user.employee) {
      throw new NotFoundException('Employee record not found for current user');
    }

    return user.employee;
  }

  /**
   * Returns the business date (YYYY-MM-DD) for the given timezone, or the
   * configured ATTENDANCE_TIMEZONE when none is supplied. This is deliberately
   * timezone-aware: the attendance "day" must follow the application's
   * configured business timezone, not the server's local/UTC clock.
   */
  getBusinessDate(timezone?: string): string {
    const tz =
      timezone ??
      this.configService.get<string>('ATTENDANCE_TIMEZONE') ??
      this.defaultTimezone;

    const format = (zone: string): string =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

    try {
      return format(tz);
    } catch {
      return format(this.defaultTimezone);
    }
  }

  private getTodayDate(): string {
    return this.getBusinessDate();
  }

  private getCurrentTime(): string {
    const tz =
      this.configService.get<string>('ATTENDANCE_TIMEZONE') ??
      this.defaultTimezone;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());
  }

  /**
   * Late cutoff for check-ins, in the attendance timezone (HH:MM). A check-in
   * at or after this time, but before the 12:00 PM no-check-in block, counts
   * as LATE; earlier check-ins count as PRESENT.
   */
  private getLateThreshold(): string {
    return (
      this.configService.get<string>('ATTENDANCE_LATE_THRESHOLD') ?? '09:00'
    );
  }

  private isLate(checkInTime: string): boolean {
    const toMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };
    return toMinutes(checkInTime) >= toMinutes(this.getLateThreshold());
  }

  /**
   * Current hour (0-23) in the configured business timezone. Used to decide
   * whether a check-in is still permitted (before 12:00 PM) versus blocked.
   */
  private getCurrentBusinessHour(): number {
    const tz =
      this.configService.get<string>('ATTENDANCE_TIMEZONE') ??
      this.defaultTimezone;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const hourPart = parts.find((part) => part.type === 'hour');
    const hour = hourPart ? Number(hourPart.value) : new Date().getHours();
    return hour === 24 ? 0 : hour;
  }

  /**
   * Source-of-truth attendance status. Older rows may predate the `status`
   * column, so fall back to `isPresent` when `status` is null.
   */
  private deriveStatus(record: Attendance): AttendanceStatus {
    if (record.status) {
      return record.status;
    }
    return record.isPresent ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT;
  }

  private calculateWorkedHours(checkIn: string, checkOut: string) {
    const [inHours, inMinutes, inSeconds] = checkIn.split(':').map(Number);
    const [outHours, outMinutes, outSeconds] = checkOut.split(':').map(Number);
    const checkInDate = new Date();
    checkInDate.setHours(inHours, inMinutes, inSeconds, 0);
    const checkOutDate = new Date();
    checkOutDate.setHours(outHours, outMinutes, outSeconds, 0);
    const diffMs = checkOutDate.getTime() - checkInDate.getTime();
    if (diffMs < 0) {
      return 0;
    }
    return Number((diffMs / 1000 / 60 / 60).toFixed(2));
  }

  /**
   * Marks every active employee who has no attendance record (i.e. no check-in)
   * for `date` as absent. Designed to be invoked by the daily scheduler (at
   * 12:02 PM, after the 12:00 PM check-in cutoff), but kept as a plain reusable
   * method so it can also be triggered manually later.
   *
   * Idempotent and bulk-friendly:
   *  - Only active employees are considered.
   *  - Employees who already checked in before 12:00 PM are left untouched - an
   *    existing attendance row (present OR already absent) is never overwritten.
   *  - Missing records are inserted in a single bulk statement guarded by
   *    `ON CONFLICT DO NOTHING` (the unique (employee, date) constraint), so
   *    re-running the job can never create duplicates even under a race.
   *  - The whole operation runs inside one transaction.
   *  - A late check-in (after 12:02 PM) reuses the auto-created absent row via
   *    the existing checkIn logic, so no second attendance record is created.
   */
  async markEmployeesWithoutCheckInAsAbsent(
    date: string,
  ): Promise<AutoAbsenceSummary> {
    return this.attendanceRepository.manager.transaction(async (manager) => {
      const activeEmployees = await manager.getRepository(Employee).find({
        where: { isActive: true },
        select: ['id'],
      });
      const activeIds = activeEmployees.map((employee) => employee.id);
      const totalActive = activeIds.length;

      if (totalActive === 0) {
        this.emitAutoAbsentAudit(date, 0, 0, 0);
        return { date, totalActive: 0, alreadyAttended: 0, markedAbsent: 0 };
      }

      const attendedRows = await manager
        .createQueryBuilder(Attendance, 'att')
        .select('att."employeeId"', 'employeeId')
        .where('att.date = :date', { date })
        .andWhere('att.employeeId IN (:...ids)', { ids: activeIds })
        .getRawMany<{ employeeId: string }>();

      const attendedIds = new Set(attendedRows.map((row) => row.employeeId));
      const alreadyAttended = attendedIds.size;
      const missingIds = activeIds.filter((id) => !attendedIds.has(id));
      const markedAbsent = missingIds.length;

      // Employees on approved leave that overlaps `date` become ON_LEAVE
      // instead of ABSENT.
      const onLeaveRows = await manager
        .createQueryBuilder(LeaveRequest, 'leave')
        .select('leave."employeeId"', 'employeeId')
        .where('leave.status = :status', { status: LeaveStatus.APPROVED })
        .andWhere('leave.startDate <= :date', { date })
        .andWhere('leave.endDate >= :date', { date })
        .andWhere('leave.employeeId IN (:...ids)', { ids: missingIds })
        .getRawMany<{ employeeId: string }>();
      const onLeaveIds = new Set(onLeaveRows.map((row) => row.employeeId));

      if (missingIds.length > 0) {
        // Bulk insert the missing records in a single statement. Each row gets
        // ON_LEAVE (approved leave) or ABSENT. ON CONFLICT DO NOTHING against
        // the unique (employeeId, date) constraint makes this idempotent - a
        // re-run (or a concurrent instance that slipped past the lock) can
        // never create duplicates.
        const placeholders = missingIds
          .map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`)
          .join(', ');
        const parameters: unknown[] = [];
        missingIds.forEach((id) => {
          const status = onLeaveIds.has(id)
            ? AttendanceStatus.ON_LEAVE
            : AttendanceStatus.ABSENT;
          parameters.push(id, date, false, status);
        });

        await manager.query(
          `INSERT INTO "attendance" ("employeeId", "date", "isPresent", "status")
           VALUES ${placeholders}
           ON CONFLICT ("employeeId", "date") DO NOTHING`,
          parameters,
        );
      }

      this.emitAutoAbsentAudit(
        date,
        totalActive,
        alreadyAttended,
        markedAbsent,
      );

      return { date, totalActive, alreadyAttended, markedAbsent };
    });
  }

  private emitAutoAbsentAudit(
    date: string,
    totalActive: number,
    alreadyAttended: number,
    markedAbsent: number,
  ): void {
    this.eventEmitter.emit('audit.log.created', {
      userId: undefined,
      action: AuditAction.AUTO_MARK_ABSENT,
      entity: 'Attendance',
      entityId: date,
      description: `Automatic absence assignment for ${date}: ${markedAbsent} employee(s) marked absent out of ${totalActive} active (${alreadyAttended} already attended).`,
    });
  }
}
