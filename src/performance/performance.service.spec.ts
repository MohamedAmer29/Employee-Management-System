import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PerformanceService } from './performance.service';
import { PerformanceReview } from './entities/performance';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';

const performanceRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
};

const userRepo = {
  findOne: jest.fn(),
};

const employeeRepo = {
  findOne: jest.fn(),
};

describe('PerformanceService', () => {
  let service: PerformanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceService,
        {
          provide: getRepositoryToken(PerformanceReview),
          useValue: performanceRepo,
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Employee), useValue: employeeRepo },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PerformanceService>(PerformanceService);
    jest.clearAllMocks();
  });

  it('should create a performance review when user is admin', async () => {
    const author = { id: 'author-id', role: 'Admin' };
    const employee = { id: 'employee-id' };
    const dto = {
      employeeId: 'employee-id',
      feedback: 'Excellent performance',
      rating: 5,
    };

    userRepo.findOne.mockResolvedValue(author);
    employeeRepo.findOne.mockResolvedValue(employee);
    performanceRepo.create.mockReturnValue({
      ...dto,
      reviewer: author.id,
      reviewDate: '2026-08-08',
    });
    performanceRepo.save.mockResolvedValue({
      id: 'review-id',
      ...dto,
      reviewer: author.id,
      reviewDate: '2026-08-08',
    });

    const result = await service.create('author-id', dto as any);

    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'author-id' },
    });
    expect(employeeRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'employee-id' },
    });
    expect(performanceRepo.save).toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'review-id', reviewer: 'author-id' });
  });

  it('should return own reviews for employee role', async () => {
    const employee = { id: 'employee-id' };
    const reviews = [{ id: 'review-1', employee }];

    userRepo.findOne.mockResolvedValue({ id: 'user-id', employee });
    performanceRepo.find.mockResolvedValue(reviews);

    const result = await service.findAll('Employee' as any, 'user-id');

    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      relations: ['employee'],
    });
    expect(result).toBe(reviews);
  });

  it('should return all reviews for admin role', async () => {
    const reviews = [{ id: 'review-1' }];
    performanceRepo.find.mockResolvedValue(reviews);

    const result = await service.findAll('Admin' as any, 'user-id');

    expect(result).toBe(reviews);
    expect(performanceRepo.find).toHaveBeenCalledWith({
      relations: ['employee'],
    });
  });
});
