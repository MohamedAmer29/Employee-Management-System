import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Payload } from './interfaces/payload';

function extractTokenFromCookie(req: Request): string | null {
  if (req && req.cookies) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return req.cookies['access_token'];
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractTokenFromCookie]),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: Payload) {
    return {
      userId: payload.sub,
      role: payload.role,
    };
  }
}
