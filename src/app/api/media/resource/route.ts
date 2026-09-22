import { api } from "@/features/media/server/api";
import { deliverResource } from "@/features/media/server/delivery";
export const runtime = "nodejs";
export async function GET(request: Request) { return api(request, (signal) => deliverResource(new Request(request, { signal }))); }
