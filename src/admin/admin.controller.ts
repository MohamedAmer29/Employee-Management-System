import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '@/auth/guards/jwt.gaurd';
import { RolesGuard } from '@/auth/guards/role.guard';
import { Roles } from '@/auth/role.decorator';
import { Role } from '@/auth/interfaces/Role.enum';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { AddManagerDto } from './dto/add-manager.dto';
import { AddAdminDto } from './dto/add-admin.dto';
import { UpdateManagerDto } from './dto/update-manager.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { AdminQueryDto } from './dto/admin-query.dto';
import { AssignDepartmentDto } from '@/employees/dto/assign-department.dto';

const MANAGER_EXAMPLE = {
  id: 'b3f1c2a0-0000-4000-8000-000000000001',
  firstName: 'Laila',
  lastName: 'Hassan',
  username: 'laila@corp.com',
  country: 'Egypt',
  city: 'Cairo',
  phoneNumber: '+201234567890',
  nationalId: '12345678901234',
  role: 'manager',
  isActive: true,
  isEmailVerified: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  employee: {
    id: 'b3f1c2a0-0000-4000-8000-000000000002',
    fullName: 'Laila Hassan',
    email: 'laila@corp.com',
    phone: '+201234567890',
    position: 'Manager',
    isActive: true,
    department: {
      id: 'b3f1c2a0-0000-4000-8000-000000000003',
      name: 'Engineering',
    },
  },
};

const ADMIN_EXAMPLE = {
  ...MANAGER_EXAMPLE,
  role: 'admin',
  employee: { ...MANAGER_EXAMPLE.employee, position: 'Administrator' },
};

const PAGINATED_MANAGERS_EXAMPLE = {
  data: [MANAGER_EXAMPLE],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

const PAGINATED_ADMINS_EXAMPLE = {
  data: [ADMIN_EXAMPLE],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

@ApiTags('Admin')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ---------------------------------------------------------------------------
  // Managers
  // ---------------------------------------------------------------------------

  @Post('managers')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Create a manager account and employee profile',
    description:
      'Creates a User (role=manager) and the linked Employee in a single transaction. The account is email-verified and active immediately. A department must be provided.',
  })
  @ApiResponse({
    status: 201,
    description: 'Manager created successfully',
    schema: { example: MANAGER_EXAMPLE },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed / department required',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Department not found' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  addManager(@Body() dto: AddManagerDto) {
    return this.adminService.addManager(dto);
  }

  @Get('managers')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'List all managers',
    description:
      'Supports pagination and filtering: page, limit, search (username / employee name), status (active|inactive), departmentId.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of managers',
    schema: { example: PAGINATED_MANAGERS_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  getAllManagers(@Query() query: AdminQueryDto) {
    return this.adminService.getAllManagers(query);
  }

  @Get('managers/:id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Get manager details' })
  @ApiParam({ name: 'id', description: 'Manager user id' })
  @ApiResponse({
    status: 200,
    description: 'Manager details',
    schema: { example: MANAGER_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Manager not found' })
  getManagerDetails(@Param('id') id: string) {
    return this.adminService.getManagerDetails(id);
  }

  @Patch('managers/:id')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Update a manager account and profile',
    description:
      'Updates the user fields and the linked employee (name, phone, position, department). Only the provided fields are changed. Role is never changed here.',
  })
  @ApiParam({ name: 'id', description: 'Manager user id' })
  @ApiResponse({
    status: 200,
    description: 'Manager updated successfully',
    schema: { example: MANAGER_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Manager or department not found' })
  updateManager(@Param('id') id: string, @Body() dto: UpdateManagerDto) {
    return this.adminService.updateManagerData(id, dto);
  }

  @Delete('managers/:id')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Remove a manager',
    description:
      'Soft-removes a manager: deactivates the account, revokes active sessions and invalidates issued tokens so historical attendance / leave / performance / audit records are preserved. An admin cannot remove their own account.',
  })
  @ApiParam({ name: 'id', description: 'Manager user id' })
  @ApiResponse({
    status: 200,
    description: 'Manager removed successfully',
    schema: { example: { message: 'Manager removed successfully' } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - cannot remove your own account',
  })
  @ApiResponse({ status: 404, description: 'Manager not found' })
  removeManager(
    @CurrentUser('userId') adminId: string,
    @Param('id') id: string,
  ) {
    return this.adminService.removeManager(id, adminId);
  }

  @Patch('managers/:id/department')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Assign a manager to a department' })
  @ApiParam({ name: 'id', description: 'Manager user id' })
  @ApiResponse({
    status: 200,
    description: 'Manager assigned to department',
    schema: { example: MANAGER_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Manager or department not found' })
  assignManagerToDepartment(
    @Param('id') id: string,
    @Body() dto: AssignDepartmentDto,
  ) {
    return this.adminService.assignManagerToDepartment(id, dto);
  }

  @Patch('managers/:id/activate')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Activate a manager account' })
  @ApiParam({ name: 'id', description: 'Manager user id' })
  @ApiResponse({
    status: 200,
    description: 'Manager activated',
    schema: { example: MANAGER_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Manager not found' })
  activateManager(@Param('id') id: string) {
    return this.adminService.activateManager(id);
  }

  @Patch('managers/:id/deactivate')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Deactivate a manager account' })
  @ApiParam({ name: 'id', description: 'Manager user id' })
  @ApiResponse({
    status: 200,
    description: 'Manager deactivated',
    schema: { example: MANAGER_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Manager not found' })
  deactivateManager(@Param('id') id: string) {
    return this.adminService.deactivateManager(id);
  }

  // ---------------------------------------------------------------------------
  // Admins
  // ---------------------------------------------------------------------------

  @Post('admins')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Create an administrator account' })
  @ApiResponse({
    status: 201,
    description: 'Admin created successfully',
    schema: { example: ADMIN_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Department not found' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  addAdmin(@Body() dto: AddAdminDto) {
    return this.adminService.addAdmin(dto);
  }

  @Get('admins')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'List all administrators',
    description:
      'Supports pagination and filtering: page, limit, search (username / employee name), status (active|inactive).',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of administrators',
    schema: { example: PAGINATED_ADMINS_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  getAllAdmins(@Query() query: AdminQueryDto) {
    return this.adminService.getAllAdmins(query);
  }

  @Get('admins/:id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Get administrator details' })
  @ApiParam({ name: 'id', description: 'Admin user id' })
  @ApiResponse({
    status: 200,
    description: 'Admin details',
    schema: { example: ADMIN_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  getAdminDetails(@Param('id') id: string) {
    return this.adminService.getAdminDetails(id);
  }

  @Patch('admins/:id')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Update an administrator profile',
    description:
      'Updates the user profile fields and linked employee. Role is never changed here.',
  })
  @ApiParam({ name: 'id', description: 'Admin user id' })
  @ApiResponse({
    status: 200,
    description: 'Admin updated successfully',
    schema: { example: ADMIN_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.adminService.updateAdminData(id, dto);
  }

  @Patch('admins/:id/activate')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Activate an administrator account' })
  @ApiParam({ name: 'id', description: 'Admin user id' })
  @ApiResponse({
    status: 200,
    description: 'Admin activated',
    schema: { example: ADMIN_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  activateAdmin(@Param('id') id: string) {
    return this.adminService.activateAdmin(id);
  }

  @Patch('admins/:id/deactivate')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Deactivate an administrator account' })
  @ApiParam({ name: 'id', description: 'Admin user id' })
  @ApiResponse({
    status: 200,
    description: 'Admin deactivated',
    schema: { example: ADMIN_EXAMPLE },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot deactivate the last active administrator',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  deactivateAdmin(@Param('id') id: string) {
    return this.adminService.deactivateAdmin(id);
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  @Post('users/:id/make-admin')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Promote an existing user to administrator' })
  @ApiParam({ name: 'id', description: 'User id to promote' })
  @ApiResponse({
    status: 200,
    description: 'User promoted to admin',
    schema: { example: ADMIN_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'User is already an admin' })
  makeUserAdmin(@Param('id') id: string) {
    return this.adminService.makeUserAdmin(id);
  }

  @Patch('users/:id/make-admin')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Promote an existing user to administrator' })
  @ApiParam({ name: 'id', description: 'User id to promote' })
  @ApiResponse({
    status: 200,
    description: 'User promoted to admin',
    schema: { example: ADMIN_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'User is already an admin' })
  makeUserAdminPatch(@Param('id') id: string) {
    return this.adminService.makeUserAdmin(id);
  }

  @Patch('employees/:employeeId/make-manager')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Promote an existing employee to manager',
    description:
      'Changes the employee user role to MANAGER in place. The User and Employee records are preserved (no duplicate account). Only active employees can be promoted.',
  })
  @ApiParam({ name: 'employeeId', description: 'Employee id to promote' })
  @ApiResponse({
    status: 200,
    description: 'Employee promoted to manager',
    schema: {
      example: {
        success: true,
        message: 'Employee promoted to manager successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiResponse({
    status: 409,
    description: 'Target is not an employee / already a manager',
  })
  makeManager(
    @Param('employeeId') employeeId: string,
    @CurrentUser('userId') adminId: string,
  ) {
    return this.adminService.makeManager(employeeId, adminId);
  }

  @Post('users/:id/logout')
  @Roles(Role.admin)
  @ApiOperation({
    summary: 'Log a specific user out of all devices',
    description:
      'Revokes every active session for the user and invalidates issued tokens by bumping the token version.',
  })
  @ApiParam({ name: 'id', description: 'User id to log out' })
  @ApiResponse({
    status: 200,
    description: 'User logged out from all devices',
    schema: {
      example: {
        message: 'User logged out from all devices successfully',
        revokedSessions: 3,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  logoutUser(@Param('id') id: string) {
    return this.adminService.logoutUser(id);
  }
}
