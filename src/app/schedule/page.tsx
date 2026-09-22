import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Schedule" };

export default function SchedulePage() {
  return <ComingSoon eyebrow="Coming next" title="Your week, episode by episode." description="Episode release schedules are not available yet. Your library and MyAnimeList progress sync remain available while we prepare this view." variant="schedule" />;
}
