import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { handle } from "../../transport.js";
import { SubtitlesService } from "./subtitles.service.js";

@Controller("api/anime")
export class SubtitlesController {
  constructor(
    @Inject(SubtitlesService) private readonly subtitles: SubtitlesService,
  ) {}

  @Get(":animeId/subtitles")
  find(
    @Req() request: Request,
    @Res() response: Response,
    @Param("animeId") animeId: string,
  ) {
    return handle(request, response, (webRequest) =>
      this.subtitles.find(webRequest, animeId),
    );
  }
}
