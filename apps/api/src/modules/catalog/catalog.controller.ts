import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { handle } from "../../transport.js";
import { CatalogService } from "./catalog.service.js";

@Controller("api/anime")
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  @Get("search")
  search(@Req() request: Request, @Res() response: Response) {
    return handle(request, response, (webRequest) =>
      this.catalog.search(webRequest),
    );
  }

  @Get("seasonal")
  seasonal(@Req() request: Request, @Res() response: Response) {
    return handle(request, response, (webRequest) =>
      this.catalog.seasonal(webRequest),
    );
  }

  @Get(":animeId/episodes")
  episodes(
    @Req() request: Request,
    @Res() response: Response,
    @Param("animeId") animeId: string,
  ) {
    return handle(request, response, (webRequest) =>
      this.catalog.episodes(webRequest, animeId),
    );
  }

  @Get(":animeId")
  detail(
    @Req() request: Request,
    @Res() response: Response,
    @Param("animeId") animeId: string,
  ) {
    return handle(request, response, (webRequest) =>
      this.catalog.detail(webRequest, animeId),
    );
  }
}
