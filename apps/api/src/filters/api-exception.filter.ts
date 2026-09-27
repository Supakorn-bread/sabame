import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";
import { errorResponse } from "../mal/http.js";
import { writeWebResponse } from "../transport.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(
          typeof body === "string"
            ? { statusCode: status, message: body }
            : body,
        );
      return;
    }

    try {
      await writeWebResponse(response, errorResponse(exception));
    } catch {
      if (!response.destroyed && !response.writableEnded) response.end();
    }
  }
}
