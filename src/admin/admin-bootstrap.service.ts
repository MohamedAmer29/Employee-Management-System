import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';

/**
 * Creates the first administrator on application start. Idempotent: if any
 * admin already exists nothing happens. Credentials are read from the
 * environment (INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD) and the password
 * is hashed inside AdminService.createAccount, so it is never logged or
 * exposed through an API.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly adminService: AdminService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.configService.get<string>('INITIAL_ADMIN_EMAIL');
    const password = this.configService.get<string>('INITIAL_ADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.warn(
        'INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD are not set - skipping initial admin bootstrap.',
      );
      return;
    }

    try {
      await this.adminService.ensureInitialAdmin(email, password);
      this.logger.log('Initial admin bootstrap completed.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Initial admin bootstrap failed: ${message}`);
    }
  }
}
