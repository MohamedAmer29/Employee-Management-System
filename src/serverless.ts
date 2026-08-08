import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

/**
 * Serverless entrypoint for Vercel.
 *
 * Vercel invokes the exported handler per request. Creating a Nest application
 * on every invocation would be prohibitively slow and would open a new
 * PostgreSQL/Redis/SMTP connection each time, so the initialised Express
 * instance is cached in module scope and reused across warm invocations.
 *
 * The promise itself is cached (not just the result) so concurrent requests
 * arriving during a cold start all await the same initialisation rather than
 * racing to build several applications.
 *
 * Note: shutdown hooks are deliberately NOT enabled here. The serverless
 * runtime freezes and discards the process without a clean lifecycle, so
 * registering them would have no effect.
 */
const expressApp = express();

let bootstrapPromise: Promise<void> | null = null;

async function bootstrapServerless(): Promise<void> {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );

  configureApp(app);

  // Required instead of listen(): the platform owns the HTTP server.
  await app.init();
}

function getApp(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapServerless().catch((error: unknown) => {
      // Reset so a failed cold start does not poison every later invocation.
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
}

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  await getApp();
  expressApp(req, res);
}
