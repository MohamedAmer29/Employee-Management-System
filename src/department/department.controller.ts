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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { AssignEmployeesDto } from './dto/assign-employees.dto';
import { Role } from '../auth/interfaces/Role.enum';
import { Roles } from '../auth/role.decorator';

@ApiTags('Department')
@ApiBearerAuth('Authorization')
@Controller('department')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Post()
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Create department' })
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentService.create(dto);
  }

  @Get()
  @Roles(Role.admin)
  @ApiOperation({ summary: 'List departments' })
  findAll() {
    return this.departmentService.findAll();
  }

  @Put(':id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Update department' })
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentService.update(id, dto);
  }

  @Post(':id/assign-employees')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Assign employees to a department' })
  assignEmployees(@Param('id') id: string, @Body() dto: AssignEmployeesDto) {
    return this.departmentService.assignEmployees(id, dto.employeeIds);
  }

  @Delete(':id')
  @Roles(Role.admin)
  @ApiOperation({ summary: 'Delete department' })
  remove(@Param('id') id: string) {
    return this.departmentService.remove(id);
  }
}
