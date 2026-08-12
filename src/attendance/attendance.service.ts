import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Attendance } from './entities/attendance.entity';
import { Employee } from '../employees/entities/employee.entity';
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

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    private readonly usersService: UsersService,
    private readonly employeesService: EmployeesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async checkIn(userId: string) {
    const employee = await this.getEmployeeForUser(userId);
    const today = this.getTodayDate();

    const existing = await this.attendanceRepository.findOne({
      where: { employee: { id: employee.id }, date: today },
    });

    if (existing) {
      if (existing.checkIn) {
        throw new ConflictException('Already checked in for today');
      }
      existing.checkIn = this.getCurrentTime();
      existing.isPresent = true;
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

    const attendance = this.attendanceRepository.create({
      employee,
      date: today,
      checkIn: this.getCurrentTime(),
      isPresent: true,
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
      throw new BadRequestException('Check-in is required before check-out');
    }

    if (attendance.checkOut) {
      throw new ConflictException('Already checked out for today');
    }

    attendance.checkOut = this.getCurrentTime();
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

  private getTodayDate(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  private getCurrentTime(): string {
    const now = new Date();
    return now.toTimeString().split(' ')[0];
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
}
