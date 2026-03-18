import { Module } from '@nestjs/common';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerformanceReview } from './entities/performance';

@Module({
  imports: [TypeOrmModule.forFeature([PerformanceReview])],
  controllers: [PerformanceController],
  providers: [PerformanceService],
})
export class PerformanceModule {}
