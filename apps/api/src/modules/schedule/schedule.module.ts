import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ScheduleController } from "./schedule.controller.js";
import { ScheduleService } from "./schedule.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
