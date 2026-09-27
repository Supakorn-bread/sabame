import { Inject, Injectable } from "@nestjs/common";
import type { MalMutationRequest } from "@sabame/domain/mal";
import { MalRepository } from "../../database/repository.js";
import { MalClient } from "../../mal/client.js";
import { MalError } from "../../mal/config.js";
import { libraryPage } from "../../mal/library.js";
import { object } from "../../mal/normalization.js";
import {
  currentUser,
  errorResponse,
  privateJson,
  readBody,
} from "../../mal/http.js";
import { mutateList, validateMutation } from "../../mal/sync.js";

@Injectable()
export class MalService {
  constructor(
    @Inject(MalRepository) private readonly repository: MalRepository,
  ) {}

  async importList(request: Request): Promise<Response> {
    try {
      const body = object(await readBody(request));
      const user = await currentUser(request, this.repository);
      if (body.expectedUserId !== user.id)
        throw new MalError("account_changed", 409);

      return await this.repository.exclusive(user.id, async (leaseSignal) => {
        const signal = AbortSignal.any([request.signal, leaseSignal]);
        const items = await new MalClient(
          this.repository,
          user.id,
          signal,
        ).list();
        signal.throwIfAborted();
        await this.repository.replaceEntries(user.id, items, signal);
        console.info("[mal.import]", {
          state: "complete",
          entries: items.length,
        });
        return privateJson(await libraryPage(this.repository, user));
      });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async list(request: Request): Promise<Response> {
    try {
      const user = await currentUser(request, this.repository);
      return await this.repository.exclusive(user.id, async () =>
        privateJson(
          await libraryPage(
            this.repository,
            user,
            new URL(request.url).searchParams.get("cursor"),
          ),
        ),
      );
    } catch (error) {
      return errorResponse(error);
    }
  }

  async patch(request: Request, animeId: string): Promise<Response> {
    try {
      const body = await readBody(request);
      const user = await currentUser(request, this.repository);
      if (!/^mal-[1-9]\d{0,7}$/.test(animeId))
        throw new MalError("unmapped_title", 400);
      const mutation: MalMutationRequest = validateMutation(body, user.id);

      return await this.repository.exclusive(user.id, async (signal) => {
        const result = await mutateList(
          this.repository,
          user.id,
          animeId,
          mutation,
          new MalClient(this.repository, user.id, signal),
        );
        console.info("[mal.sync]", {
          operationId: result.operation.id,
          state: result.operation.state,
          error: result.operation.error,
        });
        return privateJson(
          result,
          result.operation.state === "conflict" ? 409 : 200,
        );
      });
    } catch (error) {
      return errorResponse(error);
    }
  }
}
