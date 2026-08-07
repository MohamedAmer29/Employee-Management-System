import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import 'dotenv/config';
import { AppModule } from '../src/app.module';
import { Employee } from '../src/employees/entities/employee.entity';

const username = `adminuser_${Date.now()}`;

describe('Performance e2e', () => {
  let app: INestApplication;
  let employeeRepository: Repository<Employee>;
  let adminToken: string;
  let employee: Employee;

  beforeAll(async () => {
    process.env.TYPE = process.env.TYPE ?? '';
    process.env.HOSTNAME = process.env.HOSTNAME ?? '';
    process.env.DATABASE_PORT = process.env.DATABASE_PORT ?? '';
    process.env.DATABASE_USERNAME = process.env.DATABASE_USERNAME ?? '';
    process.env.PASSWORD = process.env.PASSWORD ?? '';
    process.env.DATABASE = process.env.DATABASE ?? '';
    process.env.NODE_ENV = 'development';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    employeeRepository = moduleRef.get<Repository<Employee>>(
      getRepositoryToken(Employee),
    );

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        firstName: 'Admin',
        lastName: 'User',
        country: 'USA',
        city: 'Testville',
        phoneNumber: '5550000000',
        nationalId: '111111111',
        username,
        password: 'AdminPass123',
        role: 'Admin',
      })
      .expect(201);

    adminToken = registerResponse.body.accessToken;

    employee = await employeeRepository.save({
      fullName: 'Test Employee',
      email: 'employee@example.com',
      phone: '5551112222',
      position: 'Developer',
      role: 'Employee',
      isActive: true,
    } as any);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create, update, fetch, and delete a performance review', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/performance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId: employee.id,
        feedback: 'Excellent work',
        rating: 4,
      })
      .expect(201);

    expect(createResponse.body.id).toBeDefined();
    const reviewId = createResponse.body.id;

    const getResponse = await request(app.getHttpServer())
      .get('/performance')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(getResponse.body)).toBe(true);
    expect(getResponse.body.some((review: any) => review.id === reviewId)).toBe(
      true,
    );

    await request(app.getHttpServer())
      .patch(`/performance/${reviewId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ feedback: 'Updated feedback', rating: 5 })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/performance/${reviewId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
