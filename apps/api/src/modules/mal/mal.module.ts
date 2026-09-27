import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { MalController } from "./mal.controller.js";
import { MalService } from "./mal.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [MalController],
  providers: [MalService],
})
export class MalModule {}
