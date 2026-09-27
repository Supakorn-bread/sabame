import type { MalLibraryResponse, MalUser } from "@sabame/domain/mal";
import { MalError } from "./config.js";
import type { MalRepository } from "../database/repository.js";

type Cursor = {
  userId: number;
  snapshot: number;
  item?: string;
  operation?: string;
};
export async function libraryPage(
  repository: MalRepository,
  user: MalUser,
  encoded: string | null = null,
): Promise<MalLibraryResponse> {
  let cursor: Cursor | undefined;
  if (encoded !== null) {
    try {
      if (encoded.length > 1024 || !/^[\w-]+$/.test(encoded)) throw new Error();
      cursor = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as Cursor;
      if (
        !cursor ||
        cursor.userId !== user.id ||
        !Number.isSafeInteger(cursor.snapshot) ||
        (cursor.item !== undefined &&
          !/^mal-[1-9]\d{0,7}$/.test(cursor.item)) ||
        (cursor.operation !== undefined &&
          !/^[\w-]{1,100}$/.test(cursor.operation))
      )
        throw new Error();
    } catch {
      throw new MalError("invalid_request", 400);
    }
  }
  const account = await repository.account(user.id);
  if (cursor && cursor.snapshot !== account.revision)
    throw new MalError("library_changed", 409);
  const [entries, operations] = await Promise.all([
    repository.entryPage(user.id, cursor?.item),
    repository.operationPage(user.id, cursor?.operation),
  ]);
  const items = entries.slice(0, 50);
  const pending = operations.slice(0, 50);
  const response: MalLibraryResponse = {
    user,
    imported: account.imported,
    lastSyncedAt: account.lastSyncedAt,
    items,
    operations: pending,
    ...(entries.length > 50 || operations.length > 50
      ? {
          nextCursor: Buffer.from(
            JSON.stringify({
              userId: user.id,
              snapshot: account.revision,
              item: items.at(-1)?.anime.id ?? cursor?.item,
              operation: pending.at(-1)?.id ?? cursor?.operation,
            } satisfies Cursor),
          ).toString("base64url"),
        }
      : {}),
  };
  // Leave headroom below Vercel's response ceiling, including headers/envelopes.
  if (Buffer.byteLength(JSON.stringify(response)) > 3 * 1024 * 1024)
    throw new MalError("library_page_too_large", 502);
  return response;
}
