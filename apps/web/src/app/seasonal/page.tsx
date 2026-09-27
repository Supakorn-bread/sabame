import { connection } from "next/server";
import { SeasonalBrowser } from "@/components/seasonal/seasonal-browser";
import { currentSeason } from "@/features/seasonal/model";

export const metadata = { title: "Seasonal" };

export default async function SeasonalPage() {
  await connection();
  return <SeasonalBrowser current={currentSeason()} />;
}
