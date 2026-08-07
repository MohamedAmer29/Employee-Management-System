import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveRequest } from './entities/leave.entity';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { LeaveStatus } from './interfaces/leave.status';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Role } from '../auth/interfaces/Role.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';

const ANNUAL_LEAVE_DAYS = 20;

@Injectable()
export class LeaveService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async requestLeave(userId: string, dto: CreateLeaveDto) {
    const employee = await this.getEmployeeForUser(userId);
    this.validateLeaveDates(dto.startDate, dto.endDate);

    const requestedDays = this.countDays(dto.startDate, dto.endDate);
    const availableLeave = await this.calculateAvailableLeave(employee.id);

    if (requestedDays > availableLeave) {
      throw new ConflictException('Insufficient leave balance');
    }

    await this.preventDuplicateLeave(employee.id, dto.startDate, dto.endDate);

    const leave = this.leaveRepository.create({
      employee,
      reason: dto.reason,
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: LeaveStatus.PENDING,
    });

    const result = await this.leaveRepository.save(leave);
    this.notifyManager(employee, result);
    this.eventEmitter.emit('leave.created', {
      userId,
      employeeId: employee.id,
      leaveId: result.id,
    });
    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.CREATE,
      entity: 'LeaveRequest',
      entityId: String(result.id),
      description: 'Employee created a leave request',
      newValues: {
        reason: dto.reason,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: LeaveStatus.PENDING,
      },
    });
    return result;
  }

  async updateLeaveStatus(id: string, status: LeaveStatus, userId?: string) {
    const leave = await this.leaveRepository.findOne({
      where: { id: Number(id) },
      relations: ['employee'],
    });

    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    if (leave.status === status) {
      throw new BadRequestException(`Leave request is already ${status}`);
    }

    const previousStatus = leave.status;
    leave.status = status;
    const updatedLeave = await this.leaveRepository.save(leave);
    this.notifyManager(leave.employee, updatedLeave, status);
    const employeeUser = await this.userRepository.findOne({
      where: { employee: { id: leave.employee.id } },
    });
    if (employeeUser) {
      this.eventEmitter.emit('notification.created', {
        userId: employeeUser.id,
        type:
          status === LeaveStatus.APPROVED
            ? NotificationType.LEAVE_APPROVED
            : NotificationType.LEAVE_REJECTED,
        title:
          status === LeaveStatus.APPROVED ? 'Leave approved' : 'Leave rejected',
        message:
          status === LeaveStatus.APPROVED
            ? 'Your leave request has been approved.'
            : 'Your leave request has been rejected.',
      });
    }
    this.eventEmitter.emit('audit.log.created', {
      userId,
      action:
        status === LeaveStatus.APPROVED
          ? AuditAction.APPROVE
          : AuditAction.REJECT,
      entity: 'LeaveRequest',
      entityId: String(updatedLeave.id),
      description: `Leave request ${status.toLowerCase()}`,
      oldValues: { status: previousStatus },
      newValues: { status },
    });
    return updatedLeave;
  }

  async findAll(role: string, userId: string) {
    if (role !== Role.employee) {
      return this.leaveRepository.find({ relations: ['employee'] });
    }

    const employee = await this.getEmployeeForUser(userId);
    return this.leaveRepository.find({
      where: { employee: { id: employee.id } },
      relations: ['employee'],
    });
  }

  async findByEmployee(employeeId: string) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.leaveRepository.find({
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

  private validateLeaveDates(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid leave dates');
    }

    if (end < start) {
      throw new BadRequestException(
        'End date must be after or equal to start date',
      );
    }
  }

  private countDays(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  }

  private async calculateAvailableLeave(employeeId: string) {
    const approvedLeaves = await this.leaveRepository.find({
      where: { employee: { id: employeeId }, status: LeaveStatus.APPROVED },
    });

    const usedDays = approvedLeaves.reduce((sum, leave) => {
      return sum + this.countDays(leave.startDate, leave.endDate);
    }, 0);

    return ANNUAL_LEAVE_DAYS - usedDays;
  }

  private async preventDuplicateLeave(
    employeeId: string,
    startDate: string,
    endDate: string,
  ) {
    const existingLeave = await this.leaveRepository.findOne({
      where: { employee: { id: employeeId }, startDate, endDate },
    });

    if (existingLeave) {
      throw new ConflictException('Duplicate leave request for the same dates');
    }

    const overlapping = await this.leaveRepository
      .createQueryBuilder('leave')
      .where('leave.employeeId = :employeeId', { employeeId })
      .andWhere('leave.startDate <= :endDate', { endDate })
      .andWhere('leave.endDate >= :startDate', { startDate })
      .getOne();

    if (overlapping) {
      throw new ConflictException(
        'Leave request overlaps with an existing leave',
      );
    }
  }

  private notifyManager(
    employee: Employee,
    leave: LeaveRequest,
    status?: LeaveStatus,
  ) {
    const action = status
      ? `status changed to ${status}`
      : 'has been submitted';
    console.log(
      `Notify manager: Leave request for ${employee.fullName} ${action}.`,
    );
  }
}
