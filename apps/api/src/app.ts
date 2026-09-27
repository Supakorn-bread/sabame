import "reflect-metadata";
import { ApiExceptionFilter } from "./filters/api-exception.filter.js";
import { NestFactory } from "@nestjs/core";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { AppModule } from "./app.module.js";
import { appOrigin } from "./mal/config.js";

export async function createApp() {
  appOrigin(); // Fail startup for an invalid canonical origin, before accepting requests.
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ["error", "warn"],
  });
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use(express.raw({ type: () => true, limit: 16_384 }));
  app.use(
    (
      error: { type?: string },
      _req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      if (!error) {
        next();
        return;
      }
      res.setHeader("Cache-Control", "no-store, private");
      res.status(error.type === "entity.too.large" ? 413 : 400).json({
        error: {
          code: "invalid_request",
          message:
            "MAL could not complete this request. Your changes have not been confirmed.",
        },
      });
    },
  );
  app.useGlobalFilters(app.get(ApiExceptionFilter));
  await app.init();
  return app;
}
