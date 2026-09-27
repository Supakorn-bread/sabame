import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/prisma.service.js";

@Injectable()
export class HealthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  status() {
    return { status: "ok" as const };
  }

  async readiness() {
    try {
      await this.database.ping();
      return { status: "ready" as const, httpStatus: 200 };
    } catch {
      return { status: "unavailable" as const, httpStatus: 503 };
    }
  }
}
