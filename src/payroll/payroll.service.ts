import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Compensation } from './entities/compensation.entity';
import { SalaryDeduction } from './entities/salary-deduction.entity';
import { SalaryBonus } from './entities/salary-bonus.entity';
import { SalaryHistory } from './entities/salary-history.entity';
import { Employee } from '@/employees/entities/employee.entity';
import { User } from '@/users/entities/user.entity';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { LeaveStatus } from '@/leave/interfaces/leave.status';
import { AttendanceStatus } from '@/common/constants/enums';
import { Role } from '@/auth/interfaces/Role.enum';
import { PayrollStatus } from './enums/payroll-status.enum';
import { DeductionType } from './enums/deduction-type.enum';
import { BonusType } from './enums/bonus-type.enum';
import { AuditAction } from '@/audit-logs/enums/audit-action.enum';
import { NotificationType } from '@/notifications/enums/notification-type.enum';
import { NotificationsService } from '@/notifications/notifications.service';
import { ERROR_MESSAGES } from '@/common/constants/error-messages';
import { CalculatePayrollDto } from './dto/calculate-payroll.dto';
import { CreateDeductionDto } from './dto/create-deduction.dto';
import { CreateBonusDto } from './dto/create-bonus.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { addMoney, divideMoney, multiplyMoney } from '@/common/utils/money.util';

interface Actor {
  employee?: Employee;
  departmentId?: string;
}

interface TargetInfo {
  employee?: Employee;
  manager?: Employee;
}

const DAY_MS = 86_400_000;

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Compensation)
    private readonly compensationRepository: Repository<Compensation>,
    @InjectRepository(SalaryDeduction)
    private readonly deductionRepository: Repository<SalaryDeduction>,
    @InjectRepository(SalaryBonus)
    private readonly bonusRepository: Repository<SalaryBonus>,
    @InjectRepository(SalaryHistory)
    private readonly salaryHistoryRepository: Repository<SalaryHistory>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------------------
  // Calculation
  // ---------------------------------------------------------------------------

  async calculateForEmployee(
    employeeId: string,
    currentUserId: string,
    dto: CalculatePayrollDto,
  ): Promise<Record<string, unknown>> {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      relations: ['user', 'department'],
    });
    if (!employee) {
      throw new NotFoundException(ERROR_MESSAGES.EMPLOYEE_NOT_FOUND);
    }
    return this.calculate(employee, false, currentUserId, dto);
  }

  async calculateForManager(
    managerUserId: string,
    currentUserId: string,
    dto: CalculatePayrollDto,
  ): Promise<Record<string, unknown>> {
    const manager = await this.employeeRepository.findOne({
      where: { user: { id: managerUserId }, role: Role.manager },
      relations: ['user', 'department'],
    });
    if (!manager) {
      throw new NotFoundException(ERROR_MESSAGES.EMPLOYEE_NOT_FOUND);
    }
    return this.calculate(manager, true, currentUserId, dto);
  }

  private async calculate(
    target: Employee,
    isManager: boolean,
    currentUserId: string,
    dto: CalculatePayrollDto,
  ): Promise<Record<string, unknown>> {
    const { month, year, baseSalary, workingDays } = dto;

    const existing = await this.findCompensation(target.id, isManager, month, year);
    if (existing) {
      throw new BadRequestException(
        'A payroll record already exists for this person in the given period',
      );
    }

    const { attendedDays, leaveDays, absentDays } = await this.computeAttendance(
      target.id,
      month,
      year,
      workingDays,
    );

    const dailySalary = divideMoney(baseSalary, workingDays);
    const attendanceDeduction = multiplyMoney(dailySalary, absentDays);
    const netSalary = addMoney(baseSalary, -attendanceDeduction);

    const creator = await this.userRepository.findOne({
      where: { id: currentUserId },
    });

    const compensation = this.compensationRepository.create({
      employee: isManager ? undefined : target,
      manager: isManager ? target : undefined,
      month,
      year,
      baseSalary,
      workingDays,
      attendedDays,
      absentDays,
      leaveDays,
      dailySalary,
      attendanceDeduction,
      totalDeductions: attendanceDeduction,
      totalBonuses: 0,
      netSalary,
      status: PayrollStatus.CALCULATED,
      createdBy: creator ?? undefined,
    });

    const saved = await this.compensationRepository.save(compensation);

    await this.recordSalaryHistory(target, isManager, baseSalary, month, year, currentUserId);
    await this.notifyTarget(
      target,
      `Your payroll for ${this.monthLabel(month, year)} has been calculated. Net salary: ${netSalary}`,
    );
    this.eventEmitter.emit('audit.log.created', {
      userId: currentUserId,
      action: AuditAction.PAYROLL_CALCULATED,
      entity: 'Compensation',
      entityId: saved.id,
      description: `Payroll calculated for ${this.monthLabel(month, year)}`,
      newValues: { baseSalary, netSalary, attendedDays, absentDays },
    });

    return this.toResponse(await this.findOneEntity(saved.id));
  }

  // ---------------------------------------------------------------------------
  // Retrieval
  // ---------------------------------------------------------------------------

  async findOne(
    id: string,
    role: Role,
    currentUserId: string,
  ): Promise<Record<string, unknown>> {
    const compensation = await this.findOneEntity(id);
    const actor = await this.getActor(currentUserId, role);
    this.authorize(compensation, actor, role, true);
    return this.toResponse(compensation);
  }

  async findByEmployee(
    employeeId: string,
    role: Role,
    currentUserId: string,
    query: PayrollQueryDto,
  ): Promise<Record<string, unknown>[]> {
    const actor = await this.getActor(currentUserId, role);
    if (role !== Role.admin) {
      const employee = await this.employeeRepository.findOne({
        where: { id: employeeId },
        relations: ['department'],
      });
      this.assertTargetVisible(employee, actor, role);
    }
    const items = await this.compensationRepository
      .createQueryBuilder('comp')
      .leftJoinAndSelect('comp.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'employeeUser')
      .leftJoinAndSelect('employee.department', 'employeeDept')
      .leftJoinAndSelect('comp.manager', 'manager')
      .leftJoinAndSelect('manager.user', 'managerUser')
      .leftJoinAndSelect('manager.department', 'managerDept')
      .leftJoinAndSelect('comp.deductions', 'deductions')
      .leftJoinAndSelect('comp.bonuses', 'bonuses')
      .where('employee.id = :employeeId', { employeeId })
      .orderBy('comp.year', 'DESC')
      .addOrderBy('comp.month', 'DESC')
      .getMany();
    return items.map((c) => this.toResponse(c));
  }

  async findByManager(
    managerUserId: string,
    role: Role,
    currentUserId: string,
    query: PayrollQueryDto,
  ): Promise<Record<string, unknown>[]> {
    const actor = await this.getActor(currentUserId, role);
    if (role !== Role.admin) {
      const manager = await this.employeeRepository.findOne({
        where: { user: { id: managerUserId }, role: Role.manager },
        relations: ['department'],
      });
      this.assertTargetVisible(manager, actor, role);
    }
    const items = await this.compensationRepository
      .createQueryBuilder('comp')
      .leftJoinAndSelect('comp.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'employeeUser')
      .leftJoinAndSelect('employee.department', 'employeeDept')
      .leftJoinAndSelect('comp.manager', 'manager')
      .leftJoinAndSelect('manager.user', 'managerUser')
      .leftJoinAndSelect('manager.department', 'managerDept')
      .leftJoinAndSelect('comp.deductions', 'deductions')
      .leftJoinAndSelect('comp.bonuses', 'bonuses')
      .where('manager.user.id = :managerUserId', { managerUserId })
      .orderBy('comp.year', 'DESC')
      .addOrderBy('comp.month', 'DESC')
      .getMany();
    return items.map((c) => this.toResponse(c));
  }

  async findAll(
    query: PayrollQueryDto,
    role: Role,
    currentUserId: string,
  ): Promise<{ data: Record<string, unknown>[]; pagination: Record<string, unknown> }> {
    const actor = await this.getActor(currentUserId, role);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.compensationRepository
      .createQueryBuilder('comp')
      .leftJoinAndSelect('comp.employee', 'employee')
      .leftJoinAndSelect('employee.user', 'employeeUser')
      .leftJoinAndSelect('employee.department', 'employeeDept')
      .leftJoinAndSelect('comp.manager', 'manager')
      .leftJoinAndSelect('manager.user', 'managerUser')
      .leftJoinAndSelect('manager.department', 'managerDept')
      .leftJoinAndSelect('comp.deductions', 'deductions')
      .leftJoinAndSelect('comp.bonuses', 'bonuses')
      .leftJoinAndSelect('comp.createdBy', 'createdBy');

    if (role === Role.manager && actor.departmentId) {
      qb.andWhere(
        '(employee.departmentId = :departmentId OR manager.departmentId = :departmentId)',
        { departmentId: actor.departmentId },
      );
    }
    if (role === Role.employee && actor.employee) {
      qb.andWhere(
        '(employee.id = :employeeId OR manager.id = :employeeId)',
        { employeeId: actor.employee.id },
      );
    }
    if (query.month) {
      qb.andWhere('comp.month = :month', { month: query.month });
    }
    if (query.year) {
      qb.andWhere('comp.year = :year', { year: query.year });
    }
    if (query.status) {
      qb.andWhere('comp.status = :status', { status: query.status });
    }
    if (query.employeeId) {
      qb.andWhere('employee.id = :employeeId', { employeeId: query.employeeId });
    }
    if (query.managerId) {
      qb.andWhere('manager.user.id = :managerId', { managerId: query.managerId });
    }
    if (query.search) {
      qb.andWhere(
        '(employee.fullName ILIKE :search OR manager.fullName ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('comp.year', 'DESC')
      .addOrderBy('comp.month', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      data: items.map((c) => this.toResponse(c)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---------------------------------------------------------------------------
  // Deductions / bonuses
  // ---------------------------------------------------------------------------

  async addDeduction(
    compensationId: string,
    currentUserId: string,
    dto: CreateDeductionDto,
  ): Promise<Record<string, unknown>> {
    const compensation = await this.findOneEntity(compensationId);
    const actor = await this.getActor(currentUserId, Role.admin);
    this.authorize(compensation, actor, Role.admin, false);

    const creator = await this.userRepository.findOne({
      where: { id: currentUserId },
    });
    const deduction = this.deductionRepository.create({
      compensation,
      amount: dto.amount,
      type: dto.type,
      reason: dto.reason,
      createdBy: creator ?? undefined,
    });
    await this.deductionRepository.save(deduction);
    await this.recompute(compensation);
    await this.compensationRepository.save(compensation);

    this.eventEmitter.emit('audit.log.created', {
      userId: currentUserId,
      action: AuditAction.DEDUCTION_ADDED,
      entity: 'Compensation',
      entityId: compensation.id,
      description: `Deduction added to payroll ${compensation.id}`,
      newValues: { amount: dto.amount, type: dto.type },
    });
    return this.toResponse(await this.findOneEntity(compensationId));
  }

  async addBonus(
    compensationId: string,
    currentUserId: string,
    dto: CreateBonusDto,
  ): Promise<Record<string, unknown>> {
    const compensation = await this.findOneEntity(compensationId);
    const actor = await this.getActor(currentUserId, Role.admin);
    this.authorize(compensation, actor, Role.admin, false);

    const creator = await this.userRepository.findOne({
      where: { id: currentUserId },
    });
    const bonus = this.bonusRepository.create({
      compensation,
      amount: dto.amount,
      type: dto.type,
      reason: dto.reason,
      createdBy: creator ?? undefined,
    });
    await this.bonusRepository.save(bonus);
    await this.recompute(compensation);
    await this.compensationRepository.save(compensation);

    this.eventEmitter.emit('audit.log.created', {
      userId: currentUserId,
      action: AuditAction.BONUS_ADDED,
      entity: 'Compensation',
      entityId: compensation.id,
      description: `Bonus added to payroll ${compensation.id}`,
      newValues: { amount: dto.amount, type: dto.type },
    });
    return this.toResponse(await this.findOneEntity(compensationId));
  }

  // ---------------------------------------------------------------------------
  // Status transitions (admin only)
  // ---------------------------------------------------------------------------

  async approve(
    id: string,
    currentUserId: string,
  ): Promise<Record<string, unknown>> {
    const compensation = await this.findOneEntity(id);
    const actor = await this.getActor(currentUserId, Role.admin);
    this.authorize(compensation, actor, Role.admin, false);
    compensation.status = PayrollStatus.APPROVED;
    const saved = await this.compensationRepository.save(compensation);
    this.eventEmitter.emit('audit.log.created', {
      userId: currentUserId,
      action: AuditAction.PAYROLL_APPROVED,
      entity: 'Compensation',
      entityId: saved.id,
      description: `Payroll approved for ${this.monthLabel(saved.month, saved.year)}`,
    });
    return this.toResponse(await this.findOneEntity(id));
  }

  async markPaid(
    id: string,
    currentUserId: string,
  ): Promise<Record<string, unknown>> {
    const compensation = await this.findOneEntity(id);
    const actor = await this.getActor(currentUserId, Role.admin);
    this.authorize(compensation, actor, Role.admin, false);
    if (compensation.status !== PayrollStatus.APPROVED) {
      throw new BadRequestException('Only approved payroll can be marked as paid');
    }
    compensation.status = PayrollStatus.PAID;
    const saved = await this.compensationRepository.save(compensation);
    this.eventEmitter.emit('audit.log.created', {
      userId: currentUserId,
      action: AuditAction.PAYROLL_PAID,
      entity: 'Compensation',
      entityId: saved.id,
      description: `Payroll marked paid for ${this.monthLabel(saved.month, saved.year)}`,
    });
    return this.toResponse(await this.findOneEntity(id));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async recompute(compensation: Compensation): Promise<void> {
    const deductions =
      compensation.deductions ??
      (await this.deductionRepository.find({
        where: { compensation: { id: compensation.id } },
      }));
    const bonuses =
      compensation.bonuses ??
      (await this.bonusRepository.find({
        where: { compensation: { id: compensation.id } },
      }));

    const otherDeductions = deductions.reduce(
      (sum, d) => addMoney(sum, d.amount),
      0,
    );
    const totalBonuses = bonuses.reduce(
      (sum, b) => addMoney(sum, b.amount),
      0,
    );

    compensation.totalDeductions = addMoney(
      compensation.attendanceDeduction,
      otherDeductions,
    );
    compensation.totalBonuses = totalBonuses;
    compensation.netSalary = addMoney(
      compensation.baseSalary,
      -compensation.totalDeductions,
      compensation.totalBonuses,
    );
  }

  private async computeAttendance(
    employeeId: string,
    month: number,
    year: number,
    workingDays: number,
  ): Promise<{ attendedDays: number; leaveDays: number; absentDays: number }> {
    const monthStart = `${year}-${this.pad(month)}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = `${year}-${this.pad(month)}-${this.pad(lastDay)}`;

    const attendedDays = await this.attendanceRepository
      .createQueryBuilder('a')
      .where('a.employeeId = :employeeId', { employeeId })
      .andWhere('a.date >= :start', { start: monthStart })
      .andWhere('a.date <= :end', { end: monthEnd })
      .andWhere(
        '(a.isPresent = true OR a.status IN (:...statuses))',
        { statuses: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
      )
      .getCount();

    const leaves = await this.leaveRepository
      .createQueryBuilder('l')
      .where('l.employeeId = :employeeId', { employeeId })
      .andWhere('l.status = :status', { status: LeaveStatus.APPROVED })
      .andWhere('l.startDate <= :end', { end: monthEnd })
      .andWhere('l.endDate >= :start', { start: monthStart })
      .getMany();

    const leaveDays = leaves.reduce(
      (sum, l) => sum + this.overlapDays(l.startDate, l.endDate, monthStart, monthEnd),
      0,
    );

    const absentDays = Math.max(
      0,
      workingDays - attendedDays - leaveDays,
    );

    return { attendedDays, leaveDays, absentDays };
  }

  private overlapDays(
    start: string,
    end: string,
    rangeStart: string,
    rangeEnd: string,
  ): number {
    const s = Math.max(this.toTime(start), this.toTime(rangeStart));
    const e = Math.min(this.toTime(end), this.toTime(rangeEnd));
    if (e < s) {
      return 0;
    }
    return Math.floor((e - s) / DAY_MS) + 1;
  }

  private toTime(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  private pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  private monthLabel(month: number, year: number): string {
    return `${this.pad(month)}/${year}`;
  }

  private async findCompensation(
    targetEmployeeId: string,
    isManager: boolean,
    month: number,
    year: number,
  ): Promise<Compensation | null> {
    const qb = this.compensationRepository
      .createQueryBuilder('comp')
      .where('comp.month = :month', { month })
      .andWhere('comp.year = :year', { year });
    if (isManager) {
      qb.andWhere('comp.manager.id = :targetId', { targetId: targetEmployeeId });
    } else {
      qb.andWhere('comp.employee.id = :targetId', { targetId: targetEmployeeId });
    }
    return qb.getOne();
  }

  private async findLatestCompensation(
    targetEmployeeId: string,
    isManager: boolean,
  ): Promise<Compensation | null> {
    const qb = this.compensationRepository
      .createQueryBuilder('comp')
      .orderBy('comp.year', 'DESC')
      .addOrderBy('comp.month', 'DESC')
      .limit(1);
    if (isManager) {
      qb.where('comp.manager.id = :targetId', { targetId: targetEmployeeId });
    } else {
      qb.where('comp.employee.id = :targetId', { targetId: targetEmployeeId });
    }
    return qb.getOne();
  }

  private async recordSalaryHistory(
    target: Employee,
    isManager: boolean,
    newSalary: number,
    month: number,
    year: number,
    currentUserId: string,
  ): Promise<void> {
    const previous = await this.findLatestCompensation(target.id, isManager);
    if (!previous || previous.baseSalary === newSalary) {
      return;
    }
    const creator = await this.userRepository.findOne({
      where: { id: currentUserId },
    });
    const history = this.salaryHistoryRepository.create({
      employee: isManager ? undefined : target,
      manager: isManager ? target : undefined,
      previousSalary: previous.baseSalary,
      newSalary,
      effectiveFrom: `${year}-${this.pad(month)}-01`,
      reason: 'Base salary updated during payroll calculation',
      createdBy: creator ?? undefined,
    });
    await this.salaryHistoryRepository.save(history);
  }

  private async findOneEntity(id: string): Promise<Compensation> {
    const compensation = await this.compensationRepository.findOne({
      where: { id },
      relations: [
        'employee',
        'employee.user',
        'employee.department',
        'manager',
        'manager.user',
        'manager.department',
        'deductions',
        'bonuses',
        'createdBy',
      ],
    });
    if (!compensation) {
      throw new NotFoundException(ERROR_MESSAGES.NOT_FOUND);
    }
    return compensation;
  }

  private async getActor(
    userId: string,
    role: Role,
  ): Promise<Actor> {
    if (role === Role.admin) {
      return {};
    }
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['employee', 'employee.department'],
    });
    if (!user || !user.employee) {
      throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
    }
    return {
      employee: user.employee,
      departmentId: user.employee.department?.id ?? undefined,
    };
  }

  private assertTargetVisible(
    target: Employee | null,
    actor: Actor,
    role: Role,
  ): void {
    if (!target) {
      throw new NotFoundException(ERROR_MESSAGES.EMPLOYEE_NOT_FOUND);
    }
    if (role === Role.employee) {
      if (actor.employee && target.id === actor.employee.id) {
        return;
      }
      throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
    }
    if (role === Role.manager) {
      if (actor.departmentId && target.department?.id === actor.departmentId) {
        return;
      }
      throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
    }
  }

  private authorize(
    compensation: Compensation,
    actor: Actor,
    role: Role,
    allowSelf: boolean,
  ): void {
    if (role === Role.admin) {
      return;
    }
    const targetId = compensation.employee?.id ?? compensation.manager?.id;
    if (role === Role.employee) {
      if (allowSelf && actor.employee && targetId === actor.employee.id) {
        return;
      }
      throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
    }
    if (role === Role.manager) {
      const deptId =
        compensation.employee?.department?.id ??
        compensation.manager?.department?.id;
      if (actor.departmentId && deptId === actor.departmentId) {
        return;
      }
      throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
    }
    throw new ForbiddenException(ERROR_MESSAGES.FORBIDDEN);
  }

  private async notifyTarget(
    target: Employee,
    message: string,
  ): Promise<void> {
    const userId = target.user?.id;
    if (!userId) {
      return;
    }
    try {
      await this.notificationsService.create({
        userId,
        type: NotificationType.PAYROLL,
        title: 'Payroll calculated',
        message,
      });
    } catch {
      // best-effort
    }
  }

  private mapTarget(employee?: Employee): Record<string, unknown> | null {
    if (!employee) {
      return null;
    }
    return {
      id: employee.id,
      fullName: employee.fullName,
      email: employee.email,
      position: employee.position,
      role: employee.role ?? null,
      isActive: employee.isActive,
      department: employee.department
        ? { id: employee.department.id, name: employee.department.name }
        : null,
      profilePicture: employee.user?.profilePicture ?? null,
      userId: employee.user?.id ?? null,
    };
  }

  private toResponse(compensation: Compensation): Record<string, unknown> {
    return {
      id: compensation.id,
      month: compensation.month,
      year: compensation.year,
      baseSalary: compensation.baseSalary,
      workingDays: compensation.workingDays,
      attendedDays: compensation.attendedDays,
      absentDays: compensation.absentDays,
      leaveDays: compensation.leaveDays,
      dailySalary: compensation.dailySalary,
      attendanceDeduction: compensation.attendanceDeduction,
      totalDeductions: compensation.totalDeductions,
      totalBonuses: compensation.totalBonuses,
      netSalary: compensation.netSalary,
      status: compensation.status,
      employee: this.mapTarget(compensation.employee),
      manager: this.mapTarget(compensation.manager),
      deductions: (compensation.deductions ?? []).map((d) => ({
        id: d.id,
        amount: d.amount,
        type: d.type,
        reason: d.reason,
        createdAt: d.createdAt,
      })),
      bonuses: (compensation.bonuses ?? []).map((b) => ({
        id: b.id,
        amount: b.amount,
        type: b.type,
        reason: b.reason,
        createdAt: b.createdAt,
      })),
      createdBy: compensation.createdBy
        ? {
            id: compensation.createdBy.id,
            fullName: `${compensation.createdBy.firstName} ${compensation.createdBy.lastName}`.trim(),
          }
        : null,
      createdAt: compensation.createdAt,
      updatedAt: compensation.updatedAt,
    };
  }
}
