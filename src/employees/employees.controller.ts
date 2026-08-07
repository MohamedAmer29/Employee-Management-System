/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AssignDepartmentDto } from './dto/assign-department.dto';
import { AssignUserDto } from './dto/assign-user.dto';
import { Role } from '../auth/interfaces/Role.enum';
import { Roles } from '../auth/role.decorator';
import { JwtGuard } from '../auth/guards/jwt.gaurd';
import { RolesGuard } from '../auth/guards/role.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

type UploadedProfilePictureFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

@ApiTags('Employees')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Add employee' })
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Get()
  @Roles(Role.admin)
  @ApiOperation({ summary: 'List employees' })
  findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Get employee profile' })
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Update employee' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.employeesService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Delete employee' })
  remove(@Param('id') id: string) {
    return this.employeesService.remove(id);
  }

  @Post(':id/assign-department')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Assign department to employee' })
  assignDepartment(@Param('id') id: string, @Body() dto: AssignDepartmentDto) {
    return this.employeesService.assignDepartment(id, dto.departmentId);
  }

  @Post(':id/assign-user')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Assign user account to employee' })
  assignUser(@Param('id') id: string, @Body() dto: AssignUserDto) {
    return this.employeesService.assignUser(id, dto.userId);
  }

  @Post(':id/upload-profile-picture')
  @Roles(Role.admin, Role.manager)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Upload employee profile picture' })
  uploadProfilePicture(
    @Param('id') id: string,
    @UploadedFile() file: UploadedProfilePictureFile,
  ) {
    return this.employeesService.uploadProfilePicture(id, file);
  }

  @Post('me/profile-picture')
  @Roles(Role.employee)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Upload my profile picture' })
  uploadMyProfilePicture(
    @CurrentUser('userId') userId: string,
    @UploadedFile() file: UploadedProfilePictureFile,
  ) {
    return this.employeesService.uploadMyProfilePicture(userId, file);
  }
}
