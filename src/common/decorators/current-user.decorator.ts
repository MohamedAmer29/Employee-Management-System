import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{
      user?: Record<string, unknown>;
    }>();

    if (!request.user) {
      return undefined;
    }

    if (!data) {
      return request.user;
    }

    return request.user[data];
  },
);
