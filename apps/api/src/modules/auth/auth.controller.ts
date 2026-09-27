import { Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { handle } from "../../transport.js";
import { AuthService } from "./auth.service.js";

@Controller("api/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("session")
  session(@Req() request: Request, @Res() response: Response) {
    return handle(request, response, (webRequest) =>
      this.auth.session(webRequest),
    );
  }

  @Post("logout")
  logout(@Req() request: Request, @Res() response: Response) {
    return handle(request, response, (webRequest) =>
      this.auth.logout(webRequest),
    );
  }

  @Get("mal/start")
  startOAuth(@Req() request: Request, @Res() response: Response) {
    return handle(request, response, (webRequest) =>
      this.auth.startOAuth(webRequest),
    );
  }

  @Get("mal/callback")
  finishOAuth(@Req() request: Request, @Res() response: Response) {
    return handle(request, response, (webRequest) =>
      this.auth.finishOAuth(webRequest),
    );
  }
}
