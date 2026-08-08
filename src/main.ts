import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable lifecycle hooks so Redis (RedisService.onApplicationShutdown) and
  // the TypeORM connection are closed gracefully on SIGINT/SIGTERM.
  app.enableShutdownHooks();

  configureApp(app);

  // Bind to 0.0.0.0 so the server is reachable from outside the container.
  // Binding to localhost would only accept connections from inside the
  // container itself, making the published port unusable.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
