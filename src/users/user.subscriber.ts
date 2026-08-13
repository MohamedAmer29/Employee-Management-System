import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
} from 'typeorm';
import { User } from './entities/user.entity';
import { Employee } from '@/employees/entities/employee.entity';
import { CacheInvalidationService } from '@/redis/cache-invalidation.service';

/**
 * Keeps the Employee profile in sync with its linked User account. The
 * Employee entity already derives email/phone/role/fullName from the user on
 * insert/update, but only when the Employee row is saved. This subscriber
 * closes the other direction: whenever a User's identity/contact fields change,
 * the linked Employee is updated too (e.g. a user editing their own phone
 * number reflects on their employee profile).
 */
@Injectable()
@EventSubscriber()
export class UserSubscriber implements EntitySubscriberInterface<User> {
  constructor(
    dataSource: DataSource,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo(): typeof User {
    return User;
  }

  async afterUpdate(event: UpdateEvent<User>): Promise<void> {
    const user = event.entity as User | undefined;
    const previous = event.databaseEntity;
    if (!user || !previous) {
      return;
    }

    const identityChanged =
      user.firstName !== previous.firstName ||
      user.lastName !== previous.lastName ||
      user.username !== previous.username ||
      user.phoneNumber !== previous.phoneNumber ||
      user.role !== previous.role ||
      user.isActive !== previous.isActive;

    if (!identityChanged) {
      return;
    }

    const manager = event.manager;
    const employeeRepository = manager.getRepository(Employee);
    const employee = await employeeRepository.findOne({
      where: { user: { id: user.id } },
    });
    if (!employee) {
      return;
    }

    employee.email = user.username;
    employee.phone = user.phoneNumber;
    employee.role = user.role;
    employee.isActive = user.isActive;
    employee.fullName = `${user.firstName} ${user.lastName}`;

    await employeeRepository.save(employee);

    await this.cacheInvalidation.invalidateEmployee(employee.id);
    await this.cacheInvalidation.invalidateAdminUsers();
  }
}
