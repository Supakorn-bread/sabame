import { cookies } from "next/headers";
import { errorResponse, privateJson, readBody, SESSION_COOKIE } from "@/features/mal/server/http";
import { malRepository } from "@/features/mal/server/repository";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await readBody(request);
    const cookieStore = await cookies();
    malRepository().logout(cookieStore.get(SESSION_COOKIE)?.value);
    cookieStore.delete(SESSION_COOKIE);
    return privateJson({ success: true });
  } catch (error) { return errorResponse(error); }
}
