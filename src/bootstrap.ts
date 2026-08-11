import type { INestApplication } from '@nestjs/common';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import { join } from 'node:path';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Shared application configuration.
 *
 * Extracted from main.ts so the standard server entrypoint (main.ts) and the
 * serverless entrypoint (serverless.ts) apply exactly the same pipes, filters,
 * middleware and Swagger setup. Without this the two would drift apart.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      // Nest 11 flattens validation errors to plain strings by default,
      // which loses the offending field. Pass the raw ValidationError[]
      // through instead so AllExceptionsFilter can report field + messages.
      exceptionFactory: (errors) => new BadRequestException(errors),
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.use(cookieParser());

  // Serve uploaded files (profile pictures, etc.) statically.
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // CORS for local Vite dev server (port 5173) + credentials (cookies)
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const config = new DocumentBuilder()
    .setTitle('EMS API')
    .setDescription('The EMS API description')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'Authorization',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
}
