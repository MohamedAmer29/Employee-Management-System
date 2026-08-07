import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PerformanceService } from './performance.service';
import { CreatePerformanceDto } from './dto/create-performance.dto';
import { UpdatePerformanceDto } from './dto/update-performance.dto';
import { JwtGuard } from '../auth/guards/jwt.gaurd';
import { RolesGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/role.decorator';
import { Role } from '../auth/interfaces/Role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Performance')
@ApiBearerAuth('Authorization')
@UseGuards(JwtGuard, RolesGuard)
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @Post()
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Create performance review' })
  create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePerformanceDto,
  ) {
    return this.performanceService.create(userId, dto);
  }

  @Get()
  @Roles(Role.admin, Role.manager, Role.employee)
  @ApiOperation({ summary: 'Get performance reviews' })
  findAll(
    @CurrentUser('role') role: Role,
    @CurrentUser('userId') userId: string,
  ) {
    return this.performanceService.findAll(role, userId);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Update performance review' })
  update(@Param('id') id: string, @Body() dto: UpdatePerformanceDto) {
    return this.performanceService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.manager)
  @ApiOperation({ summary: 'Delete performance review' })
  remove(@Param('id') id: string) {
    return this.performanceService.remove(id);
  }
}
