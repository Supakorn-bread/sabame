import { currentUser, errorResponse, privateJson } from "@/features/mal/server/http";
import { malRepository } from "@/features/mal/server/repository";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await currentUser();
    const repository = malRepository();
    const account = repository.account(user.id);
    return privateJson({ user, imported: account.imported, lastSyncedAt: account.lastSyncedAt, items: repository.entries(user.id), operations: repository.operations(user.id) });
  } catch (error) { return errorResponse(error); }
}
