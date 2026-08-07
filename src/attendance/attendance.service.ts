import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance } from './entities/attendance.entity';
import { Employee } from '../employees/entities/employee.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.attendanceRepository.find({
      where: { employee: { id: employeeId } },
      relations: ['employee'],
    });
  }

  private async getEmployeeForUser(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['employee'],
    });

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
