import { Controller, Get, Inject, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { handle } from "../../transport.js";
import { ScheduleService } from "./schedule.service.js";

@Controller("api")
export class ScheduleController {
  constructor(
    @Inject(ScheduleService) private readonly scheduleService: ScheduleService,
  ) {}

  @Get("schedule")
  schedule(@Req() request: Request, @Res() response: Response) {
    return handle(request, response, (webRequest) =>
      this.scheduleService.schedule(webRequest),
    );
  }
}
