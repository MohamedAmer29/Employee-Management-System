import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerformanceReview } from './entities/performance';
import { CreatePerformanceDto } from './dto/create-performance.dto';
import { UpdatePerformanceDto } from './dto/update-performance.dto';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Role } from '../auth/interfaces/Role.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { PerformanceReviewCreatedEvent } from '../common/events/performance-review-created.event';
import { CacheInvalidationService } from '@/redis/cache-invalidation.service';
import { getBusinessDate } from '@/common/utils/timezones.util';

@Injectable()
export class PerformanceService {
  constructor(
    @InjectRepository(PerformanceReview)
    private readonly performanceRepository: Repository<PerformanceReview>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async create(userId: string, dto: CreatePerformanceDto) {
    const author = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (
      !author ||
      (author.role !== Role.admin && author.role !== Role.manager)
    ) {
      throw new ForbiddenException(
        'Only managers and admins can create reviews',
      );
    }

    const employee = await this.employeeRepository.findOne({
      where: { id: dto.employeeId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const reviewDate = dto.reviewDate ?? getBusinessDate();
    const review = this.performanceRepository.create({
      employee,
      reviewer: author.id,
      feedback: dto.feedback,
      rating: dto.rating,
      reviewDate,
    });

    const savedReview = await this.performanceRepository.save(review);

    const employeeUser = await this.userRepository.findOne({
      where: { employee: { id: employee.id } },
    });

    if (employeeUser) {
      this.eventEmitter.emit(
        'performance.created',
        new PerformanceReviewCreatedEvent(employeeUser.id, employee.fullName),
      );
    }

    this.eventEmitter.emit('audit.log.created', {
      userId,
      action: AuditAction.CREATE,
      entity: 'PerformanceReview',
      entityId: String(savedReview.id),
      description: 'Created a performance review',
      newValues: {
        employeeId: employee.id,
        rating: dto.rating,
        feedback: dto.feedback,
      },
    });

    await this.invalidateDashboards();

    return savedReview;
  }

  async findAll(role: Role, userId: string) {
    const relations = ['employee', 'employee.user'];

    if (role === Role.employee) {
      const employee = await this.getEmployeeForUser(userId);
      const reviews = await this.performanceRepository.find({
        where: { employee: { id: employee.id } },
        relations,
      });
      return reviews.map((review) => this.toResponse(review));
    }

    const reviews = await this.performanceRepository.find({ relations });
    return reviews.map((review) => this.toResponse(review));
  }

  async update(id: string, dto: UpdatePerformanceDto) {
    const review = await this.performanceRepository.findOne({
      where: { id },
      relations: ['employee'],
    });

    if (!review) {
      throw new NotFoundException('Performance review not found');
    }

    if (dto.employeeId) {
      const employee = await this.employeeRepository.findOne({
        where: { id: dto.employeeId },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }
      review.employee = employee;
    }

    if (dto.feedback !== undefined) {
      review.feedback = dto.feedback;
    }

    if (dto.rating !== undefined) {
      review.rating = dto.rating;
    }

    if (dto.reviewDate !== undefined) {
      review.reviewDate = dto.reviewDate;
    }

    const updated = await this.performanceRepository.save(review);

    await this.invalidateDashboards();

    return updated;
  }

  async remove(id: string) {
    const review = await this.performanceRepository.findOne({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException('Performance review not found');
    }

    await this.performanceRepository.remove(review);

    await this.invalidateDashboards();

    return { message: 'Performance review deleted' };
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

  /**
   * Lifts the employee's profile picture (which lives on the linked user
   * account) up to the nested employee object and strips the user relation so
   * credentials and other user fields are never returned to the client.
   */
  /**
   * Performance mutations change the average rating, total reviews and rating
   * distribution that the admin and manager dashboards aggregate, so both
   * dashboard caches must be dropped immediately. Otherwise the dashboard keeps
   * showing stale figures until the Redis TTL expires.
   */
  private async invalidateDashboards(): Promise<void> {
    await Promise.all([
      this.cacheInvalidation.invalidateAdminDashboard(),
      this.cacheInvalidation.invalidateAllManagerDashboards(),
    ]);
  }

  private toResponse(review: PerformanceReview) {
    const { user, ...employee } = review.employee;
    return {
      ...review,
      employee: {
        ...employee,
        profilePicture: user?.profilePicture ?? null,
      },
    };
  }
}
