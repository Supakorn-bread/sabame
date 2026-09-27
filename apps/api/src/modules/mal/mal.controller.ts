import {
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { handle } from "../../transport.js";
import { MalService } from "./mal.service.js";

@Controller("api/mal")
export class MalController {
  constructor(@Inject(MalService) private readonly mal: MalService) {}

  @Get("list")
  list(@Req() request: Request, @Res() response: Response) {
    return handle(request, response, (webRequest) => this.mal.list(webRequest));
  }

  @Post("import")
  importList(@Req() request: Request, @Res() response: Response) {
    return handle(request, response, (webRequest) =>
      this.mal.importList(webRequest),
    );
  }

  @Patch("anime/:animeId")
  patch(
    @Req() request: Request,
    @Res() response: Response,
    @Param("animeId") animeId: string,
  ) {
    return handle(request, response, (webRequest) =>
      this.mal.patch(webRequest, animeId),
    );
  }
}
