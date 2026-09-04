import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Schedule" };

export default function SchedulePage() {
  return <ComingSoon eyebrow="Coming next" title="Your week, episode by episode." description="The schedule view will map release times around your active watchlist. It stays intentionally offline in this browser-only MVP until a trustworthy catalog source is added." variant="schedule" />;
}
