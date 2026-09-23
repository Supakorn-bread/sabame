import { fetchSeasonRoutes } from "@/features/schedule/server/anime-catalog";
import { fetchSchedule, ScheduleServiceError, isTimeZone } from "@/features/schedule/server/client";
import { isAirType, isScheduleWeek } from "@/features/schedule/model";
import { currentSeason } from "@/features/seasonal/model";
import { currentUser, errorResponse, privateJson } from "@/features/mal/server/http";
import { malRepository } from "@/features/mal/server/repository";

export const runtime = "nodejs";

function errorResponseForSchedule(code: string, status: number, source: "catalog" | "timetable") {
  return privateJson({ error: { code, source } }, status);
}

function scheduleFailure(error: unknown, source: "catalog" | "timetable") {
  if (!(error instanceof ScheduleServiceError)) return errorResponseForSchedule("upstream_unavailable", 502, source);
  const status = error.code === "not_configured" ? 503 : error.code === "timeout" ? 504 : 502;
  return errorResponseForSchedule(error.code, status, source);
}

function malIdFromAnimeId(value: string): number | null {
  const match = /^mal-([1-9]\d{0,7})$/.exec(value);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year"));
  const week = Number(params.get("week"));
  const timeZone = params.get("tz") ?? "";
  const airType = params.get("airType");

  if (!isScheduleWeek({ year, week }) || !isAirType(airType) || !isTimeZone(timeZone)) {
    return privateJson({ error: { code: "invalid_request" } }, 400);
  }

  try {
    const user = await currentUser();
    const repository = malRepository();
    if (!repository.account(user.id).imported) {
      return privateJson({ error: { code: "list_not_imported" } }, 409);
    }

    const malIds = new Set(repository.entries(user.id)
      .flatMap(({ anime }) => {
        const malId = malIdFromAnimeId(anime.id);
        return malId === null ? [] : [malId];
      }));

    const season = currentSeason();
    if (malIds.size === 0) {
      return privateJson({ state: "ready", season, matchedAnimeCount: 0, items: [] });
    }

    let seasonRoutes: ReadonlyMap<number, readonly string[]>;
    try {
      seasonRoutes = await fetchSeasonRoutes(season);
    } catch (error) {
      return scheduleFailure(error, "catalog");
    }

    const matchedRoutes = new Set<string>();
    let matchedAnimeCount = 0;
    for (const malId of malIds) {
      const routes = seasonRoutes.get(malId);
      if (!routes?.length) continue;
      matchedAnimeCount += 1;
      for (const route of routes) matchedRoutes.add(route.toLocaleLowerCase("en"));
    }
    if (matchedAnimeCount === 0) {
      return privateJson({ state: "ready", season, matchedAnimeCount: 0, items: [] });
    }

    let schedule;
    try {
      schedule = await fetchSchedule({ year, week }, timeZone, airType);
    } catch (error) {
      return scheduleFailure(error, "timetable");
    }

    return privateJson({
      state: "ready",
      season,
      matchedAnimeCount,
      items: schedule.filter((item) => matchedRoutes.has(item.route.toLocaleLowerCase("en"))),
    });
  } catch (error) {
    return errorResponse(error);
  }
}