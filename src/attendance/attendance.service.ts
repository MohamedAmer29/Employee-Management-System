import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance } from './entities/attendance.entity';
import { EmployeesService } from '../employees/employees.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    private readonly usersService: UsersService,
    private readonly employeesService: EmployeesService,
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
      return this.attendanceRepository.save(existing);
    }

    const attendance = this.attendanceRepository.create({
      employee,
      date: today,
      checkIn: this.getCurrentTime(),
      isPresent: true,
    });

    return this.attendanceRepository.save(attendance);
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

    return {
      ...attendance,
      workedHours: this.calculateWorkedHours(
        attendance.checkIn,
        attendance.checkOut,
      ),
    };
  }

  findAll() {
    return this.attendanceRepository.find({ relations: ['employee'] });
  }

  async findByEmployee(employeeId: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await this.employeesService.findOne(employeeId);

    return this.attendanceRepository.find({
      where: { employee: { id: employeeId } },
      relations: ['employee'],
    });
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
