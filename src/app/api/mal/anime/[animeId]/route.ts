import { MalError } from "@/features/mal/server/config";
import { currentUser, errorResponse, privateJson, readBody } from "@/features/mal/server/http";
import { malRepository } from "@/features/mal/server/repository";
import { mutateList, validateMutation } from "@/features/mal/server/sync";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ animeId: string }> }) {
  try {
    const body = await readBody(request);
    const user = await currentUser();
    const { animeId } = await context.params;
    if (!/^mal-[1-9]\d{0,7}$/.test(animeId)) throw new MalError("unmapped_title", 400);
    const mutation = validateMutation(body, user.id);
    const repository = malRepository();
    return await repository.exclusive(user.id, async () => {
      const result = await mutateList(repository, user.id, animeId, mutation);
      console.info("[mal.sync]", { operationId: result.operation.id, state: result.operation.state, error: result.operation.error });
      return privateJson(result, result.operation.state === "conflict" ? 409 : 200);
    });
  } catch (error) { return errorResponse(error); }
}
