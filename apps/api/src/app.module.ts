import { Module } from "@nestjs/common";
import { ApiExceptionFilter } from "./filters/api-exception.filter.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { MalModule } from "./modules/mal/mal.module.js";
import { ScheduleModule } from "./modules/schedule/schedule.module.js";

@Module({
  imports: [HealthModule, AuthModule, MalModule, CatalogModule, ScheduleModule],
  providers: [ApiExceptionFilter],
})
export class AppModule {}
