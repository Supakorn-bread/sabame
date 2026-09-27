import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { Response } from "express";
import { HealthService } from "./health.service.js";

@Controller("api")
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get("health")
  healthCheck(@Res() response: Response) {
    response.setHeader("Cache-Control", "no-store");
    response.json(this.health.status());
  }

  @Get("ready")
  async readinessCheck(@Res() response: Response) {
    response.setHeader("Cache-Control", "no-store");
    const readiness = await this.health.readiness();
    response.status(readiness.httpStatus).json({ status: readiness.status });
  }
}
