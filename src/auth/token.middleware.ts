import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedException } from '@nestjs/common';

export function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction,
  jwtService: JwtService,
) {
  const token = req.cookies?.access_token as string;

  if (!token) {
    return { valid: false };
  }

  try {
    jwtService.verify(token);
    next();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    throw new UnauthorizedException(e.message);
  }
}
