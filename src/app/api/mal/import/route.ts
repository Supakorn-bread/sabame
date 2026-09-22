import { MalClient } from "@/features/mal/server/client";
import { MalError } from "@/features/mal/server/config";
import { currentUser, errorResponse, privateJson, readBody } from "@/features/mal/server/http";
import { object } from "@/features/mal/server/normalization";
import { malRepository } from "@/features/mal/server/repository";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = object(await readBody(request));
    const user = await currentUser();
    if (body.expectedUserId !== user.id) throw new MalError("account_changed", 409);
    const repository = malRepository();
    return await repository.exclusive(user.id, async () => {
      const items = await new MalClient(repository, user.id).list();
      repository.replaceEntries(user.id, items);
      console.info("[mal.import]", { state: "complete", entries: items.length });
      return privateJson({ user, imported: true, lastSyncedAt: repository.account(user.id).lastSyncedAt, items: repository.entries(user.id), operations: repository.operations(user.id) });
    });
  } catch (error) { return errorResponse(error); }
}
