import { isDeepStrictEqual } from "node:util";
import type {
  MalChanges,
  MalListStatus,
  MalMutationRequest,
  MalMutationResponse,
  MalOperation,
} from "@sabame/domain/mal";
import { MalClient } from "./client.js";
import { MalError } from "./config.js";
import { libraryItem, listStatus } from "./normalization.js";
import type { MalRepository } from "../database/repository.js";

export function validateMutation(
  value: unknown,
  userId: number,
): MalMutationRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new MalError("invalid_request", 400);
  const body = value as Record<string, unknown>;
  if (body.expectedUserId !== userId)
    throw new MalError("account_changed", 409);
  if (
    typeof body.operationId !== "string" ||
    !/^[\w-]{16,100}$/.test(body.operationId)
  )
    throw new MalError("invalid_request", 400);
  if (
    !body.changes ||
    typeof body.changes !== "object" ||
    Array.isArray(body.changes)
  )
    throw new MalError("invalid_request", 400);
  const changes = body.changes as Record<string, unknown>;
  if (
    !Object.keys(changes).length ||
    Object.keys(changes).some(
      (key) => !["watchedEpisodes", "status"].includes(key),
    )
  )
    throw new MalError("invalid_request", 400);
  if (
    changes.watchedEpisodes !== undefined &&
    (typeof changes.watchedEpisodes !== "number" ||
      !Number.isSafeInteger(changes.watchedEpisodes) ||
      changes.watchedEpisodes < 0 ||
      changes.watchedEpisodes > 10_000)
  )
    throw new MalError("invalid_request", 400);
  if (
    changes.status !== undefined &&
    !["watching", "completed", "on_hold", "dropped", "planned"].includes(
      String(changes.status),
    )
  )
    throw new MalError("invalid_request", 400);
  if (
    body.resolution !== undefined &&
    !["local", "remote"].includes(String(body.resolution))
  )
    throw new MalError("invalid_request", 400);
  let base: MalListStatus | null;
  try {
    base = body.base === null ? null : listStatus(body.base);
  } catch {
    throw new MalError("invalid_request", 400);
  }
  return {
    expectedUserId: userId,
    operationId: body.operationId,
    base,
    changes: changes as MalChanges,
    resolution: body.resolution as MalMutationRequest["resolution"],
  };
}

export function hasConflict(
  base: MalListStatus | null,
  remote: MalListStatus | null,
  changes: MalChanges,
) {
  if (base && !remote) return true;
  if (!remote) return false;
  const status =
    changes.status === "planned" ? "plan_to_watch" : changes.status;
  return (
    (changes.watchedEpisodes !== undefined &&
      remote.num_episodes_watched !== base?.num_episodes_watched &&
      remote.num_episodes_watched !== changes.watchedEpisodes) ||
    (status !== undefined &&
      remote.status !== base?.status &&
      remote.status !== status)
  );
}
function alreadyApplied(remote: MalListStatus | null, changes: MalChanges) {
  return (
    remote !== null &&
    (changes.watchedEpisodes === undefined ||
      remote.num_episodes_watched === changes.watchedEpisodes) &&
    (changes.status === undefined ||
      remote.status ===
        (changes.status === "planned" ? "plan_to_watch" : changes.status))
  );
}

export async function mutateList(
  repository: MalRepository,
  userId: number,
  animeId: string,
  body: MalMutationRequest,
  client: Pick<MalClient, "details" | "update"> = new MalClient(
    repository,
    userId,
  ),
): Promise<MalMutationResponse> {
  const existing = await repository.operation(userId, body.operationId);
  // JSONB can reorder object keys. Idempotency compares values, not encoding.
  if (
    existing &&
    (existing.animeId !== animeId ||
      !isDeepStrictEqual(existing.changes, body.changes) ||
      !isDeepStrictEqual(existing.base, body.base))
  )
    throw new MalError("operation_mismatch", 409);
  if (existing?.state === "synced") {
    const item = await repository.entry(userId, animeId);
    return { operation: existing, item, ...(!item ? { removed: true } : {}) };
  }
  if (
    (await repository.operations(userId)).some(
      (operation) =>
        operation.animeId === animeId && operation.id !== body.operationId,
    )
  )
    throw new MalError("sync_busy", 409);
  const operation: MalOperation = existing ?? {
    id: body.operationId,
    animeId,
    changes: body.changes,
    base: body.base,
    state: "pending",
  };
  operation.state = "pending";
  delete operation.error;
  await repository.saveOperation(userId, operation);
  try {
    const { node, status: remote } = await client.details(animeId);
    operation.remote = remote;
    if (body.resolution === "remote") {
      const item = remote ? libraryItem(node, remote) : undefined;
      operation.state = "synced";
      await repository.transaction(async (tx) => {
        if (item) await tx.saveEntry(userId, item);
        else await tx.removeEntry(userId, animeId);
        await tx.saveOperation(userId, operation);
        await tx.markSynced(userId);
      });
      return { operation, item, ...(!item ? { removed: true } : {}) };
    }
    if (
      !body.resolution &&
      hasConflict(operation.base, remote, operation.changes)
    ) {
      operation.state = "conflict";
      await repository.saveOperation(userId, operation);
      return { operation };
    }
    const count = body.changes.watchedEpisodes;
    if (
      count !== undefined &&
      typeof node.num_episodes === "number" &&
      node.num_episodes > 0 &&
      count > node.num_episodes
    )
      throw new MalError("episode_out_of_range", 400);
    const acknowledged = alreadyApplied(remote, body.changes)
      ? remote!
      : await client.update(animeId, body.changes);
    const item = libraryItem(node, acknowledged);
    operation.state = "synced";
    operation.remote = acknowledged;
    await repository.transaction(async (tx) => {
      await tx.saveEntry(userId, item);
      await tx.saveOperation(userId, operation);
      await tx.markSynced(userId);
    });
    return { operation, item };
  } catch (error) {
    operation.state = "failed";
    operation.error = error instanceof MalError ? error.code : "sync_failed";
    await repository.saveOperation(userId, operation);
    return { operation };
  }
}
