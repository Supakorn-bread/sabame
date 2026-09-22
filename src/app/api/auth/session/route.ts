import { cookies } from "next/headers";
import { malConfigured } from "@/features/mal/server/config";
import { errorResponse, privateJson, SESSION_COOKIE } from "@/features/mal/server/http";
import { malRepository } from "@/features/mal/server/repository";
export const runtime = "nodejs";
export async function GET() {
  try {
    const configured = malConfigured();
    const user = configured ? malRepository().session((await cookies()).get(SESSION_COOKIE)?.value) : null;
    return privateJson({ configured, user });
  } catch (error) { return errorResponse(error); }
}
