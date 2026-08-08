import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable lifecycle hooks so Redis (RedisService.onApplicationShutdown) and
  // the TypeORM connection are closed gracefully on SIGINT/SIGTERM.
  app.enableShutdownHooks();

  // Configure ValidationPipe globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Register global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  app.use(cookieParser());

  const config = new DocumentBuilder()
    .setTitle('EMS API')
    .setDescription('The EMS API description')
    .setVersion('1.0')
    // 1. Add the bearer auth configuration
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT', // Optional
        name: 'JWT', // Optional
        description: 'Enter JWT token',
        in: 'header',
      },
      'Authorization', // This name must match the name in the @ApiBearerAuth() decorator
    )
    .build();
  // 2. Create the OpenAPI document
  const document = SwaggerModule.createDocument(app, config);

  // 3. Setup the Swagger UI route
  SwaggerModule.setup('api', app, document);

  // Bind to 0.0.0.0 so the server is reachable from outside the container.
  // Binding to localhost would only accept connections from inside the
  // container itself, making the published port unusable.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
