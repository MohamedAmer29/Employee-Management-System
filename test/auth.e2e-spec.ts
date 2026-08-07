/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import 'dotenv/config';
import { AppModule } from '../src/app.module';

const username = `janedoe_${Date.now()}`;

describe('Auth e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.TYPE = process.env.TYPE ?? 'postgres';
    process.env.HOSTNAME = process.env.HOSTNAME ?? 'localhost';
    process.env.DATABASE_PORT = process.env.DATABASE_PORT ?? '5432';
    process.env.DATABASE_USERNAME = process.env.DATABASE_USERNAME ?? 'postgres';
    process.env.PASSWORD = process.env.PASSWORD ?? 'postgres';
    process.env.DATABASE = process.env.DATABASE ?? 'EMS';
    process.env.NODE_ENV = 'test';

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
      username,
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
      .send({ username, password: 'Password123' })
      .expect(201);

    expect(loginResponse.body.accessToken).toBeDefined();
  });

  it('should verify a valid access token', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'Password123' })
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
