import { Module } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeaveRequest } from './entities/leave.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveRequest])],
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}
