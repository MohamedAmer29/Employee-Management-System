/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-floating-promises */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { describe, it } from 'node:test';
import { beforeAll, expect } from '@jest/globals';

describe('Auth e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.TYPE = 'sqlite';
    process.env.HOSTNAME = 'localhost';
    process.env.DATABASE_PORT = '0';
    process.env.DATABASE_USERNAME = '';
    process.env.PASSWORD = '';
    process.env.DATABASE = ':memory:';
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.REFRESH_SECRET = 'refresh-secret';
    process.env.REFRESH_EXPIRES_IN = '7d';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should register a new user and then login successfully', async () => {
    const registerBody = {
      firstName: 'Jane',
      lastName: 'Doe',
      country: 'USA',
      city: 'Denver',
      phoneNumber: '5551234567',
      nationalId: '987654321',
      username: 'janedoe',
      password: 'Password123',
      role: 'Employee',
    };

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(registerBody)
      .expect(201);

    expect(registerResponse.body.accessToken).toBeDefined();

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'janedoe', password: 'Password123' })
      .expect(201);

    expect(loginResponse.body.accessToken).toBeDefined();
  });

  it('should verify a valid access token', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'janedoe', password: 'Password123' })
      .expect(201);

    const token = loginResponse.body.accessToken;

    const verifyResponse = await request(app.getHttpServer())
      .post('/auth/verify-token')
      .send({ token })
      .expect(201);

    expect(verifyResponse.body.valid).toBe(true);
    expect(verifyResponse.body.payload).toBeDefined();
  });
});
