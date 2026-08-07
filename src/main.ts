import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.use(cookieParser());

  const config = new DocumentBuilder()
    .setTitle('EMS API')
    .setDescription('The EMS API description')
    .setVersion('1.0')
    .addTag('EMS')
    .build();
  // 2. Create the OpenAPI document
  const document = SwaggerModule.createDocument(app, config);

  // 3. Setup the Swagger UI route
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
