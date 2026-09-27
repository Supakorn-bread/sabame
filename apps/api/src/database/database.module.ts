import { Module } from "@nestjs/common";
import { DatabaseService } from "./prisma.service.js";
import { MalRepository } from "./repository.js";

@Module({
  providers: [
    DatabaseService,
    {
      provide: MalRepository,
      useFactory: (database: DatabaseService) =>
        new MalRepository(() => database.getClient()),
      inject: [DatabaseService],
    },
  ],
  exports: [DatabaseService, MalRepository],
})
export class DatabaseModule {}
