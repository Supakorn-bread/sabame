import { Module } from "@nestjs/common";
import { SubtitlesController } from "./subtitles.controller.js";
import { SubtitlesService } from "./subtitles.service.js";

@Module({ controllers: [SubtitlesController], providers: [SubtitlesService] })
export class SubtitlesModule {}
