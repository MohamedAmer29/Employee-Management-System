import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ManagersService } from './managers.service';
import { Employee } from '@/employees/entities/employee.entity';
import { User } from '@/users/entities/user.entity';
import { Attendance } from '@/attendance/entities/attendance.entity';
import { LeaveRequest } from '@/leave/entities/leave.entity';
import { PerformanceReview } from '@/performance/entities/performance';
import { Department } from '@/department/entities/department.entity';
import { EmployeesService } from '@/employees/employees.service';
import { PerformanceService } from '@/performance/performance.service';
import { NotificationsService } from '@/notifications/notifications.service';
import { CacheInvalidationService } from '@/redis/cache-invalidation.service';

describe('ManagersService', () => {
  let service: ManagersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagersService,
        { provide: getRepositoryToken(Employee), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Attendance), useValue: {} },
        { provide: getRepositoryToken(LeaveRequest), useValue: {} },
        { provide: getRepositoryToken(PerformanceReview), useValue: {} },
        { provide: getRepositoryToken(Department), useValue: {} },
        { provide: EmployeesService, useValue: {} },
        { provide: PerformanceService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: CacheInvalidationService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<ManagersService>(ManagersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
