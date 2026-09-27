import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentSeason } from "@/features/seasonal/model";
import { trackerStore } from "@/features/tracker/store";
import { ScheduleBrowser } from "./schedule-browser";

const { syncMalAccountMock } = vi.hoisted(() => ({ syncMalAccountMock: vi.fn() }));

vi.mock("@/features/mal/client", () => ({ syncMalAccount: syncMalAccountMock }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const delayedItem = {
  id: "evening-comet:sub:tbd::",
  title: "Evening Comet",
  route: "evening-comet",
  imageVersionRoute: null,
  episodeDate: null,
  delayedUntil: null,
  delayedText: "A new broadcast date is pending",
  episodeNumber: 4,
  subtractedEpisodeNumber: null,
  status: "Delayed",
  airingStatus: null,
  airType: "Sub",
};

function readyResponse(items = [delayedItem], matchedAnimeCount = 1) {
  return Response.json({
    state: "ready",
    season: currentSeason(),
    matchedAnimeCount,
    items,
  });
}

function setAccount(id: number, status: "idle" | "syncing" | "error" | "synced" = "synced") {
  trackerStore.setState({
    malUser: { id, name: "Schedule Viewer" },
    malConfigured: true,
    malSessionVersion: id,
    malSync: { status, operations: [], conflicts: [], remote: {} },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  syncMalAccountMock.mockReset();
  trackerStore.setState({
    malUser: null,
    malConfigured: false,
    malSessionVersion: 0,
    malSync: { status: "idle", operations: [], conflicts: [], remote: {} },
  });
});

describe("ScheduleBrowser", () => {
  it("shows delayed time-TBD data, requests the chosen filter and Japan time zone", async () => {
    const fetcher = vi.fn().mockResolvedValue(readyResponse());
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ScheduleBrowser />);

    expect(await screen.findByRole("heading", { name: "Evening Comet" })).toBeVisible();
    expect(screen.getByText("Time TBD")).toBeVisible();
    expect(screen.getByText("A new broadcast date is pending")).toBeVisible();
    expect(screen.getByText(/Episode 4/)).toBeVisible();
    expect(screen.getByText(new RegExp(currentSeason().season, "i"))).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Dub" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(String(fetcher.mock.calls[1][0])).toContain("airType=dub");

    await user.selectOptions(screen.getByRole("combobox", { name: "Broadcast time zone" }), "japan");
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(String(fetcher.mock.calls[2][0])).toContain("tz=Asia%2FTokyo");
  });

  it("shows a connect prompt for unauthenticated schedule requests", async () => {
    trackerStore.setState({ malConfigured: true });
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { code: "unauthorized" } }, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    render(<ScheduleBrowser />);

    expect(await screen.findByRole("heading", { name: "Connect MyAnimeList to personalize your schedule" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Connect MyAnimeList/ })).toHaveAttribute("href", "/api/auth/mal/start");
    expect(screen.queryByRole("group", { name: "Broadcast language" })).not.toBeInTheDocument();
  });

  it("offers an import action and reflects syncing when the server reports an unimported list", async () => {
    setAccount(12, "idle");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { code: "list_not_imported" } }, { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    syncMalAccountMock.mockImplementation(async () => {
      trackerStore.setState({ malSync: { status: "syncing", operations: [], conflicts: [], remote: {} } });
    });
    const user = userEvent.setup();
    render(<ScheduleBrowser />);

    expect(await screen.findByRole("heading", { name: "Import your MyAnimeList list to build your schedule" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Import MyAnimeList list" }));
    expect(syncMalAccountMock).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Syncing your MyAnimeList list/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Syncing list…" })).toBeDisabled();
    expect(screen.queryByRole("group", { name: "Broadcast language" })).not.toBeInTheDocument();
  });

  it("shows a current-season no-match state without empty timetable controls", async () => {
    const fetcher = vi.fn().mockResolvedValue(readyResponse([], 0));
    vi.stubGlobal("fetch", fetcher);
    render(<ScheduleBrowser />);

    expect(await screen.findByRole("heading", { name: new RegExp("No " + currentSeason().season, "i") })).toBeVisible();
    expect(screen.getByRole("link", { name: "seasonal anime guide" })).toHaveAttribute("href", "/seasonal");
    expect(screen.queryByRole("group", { name: "Broadcast language" })).not.toBeInTheDocument();
  });

  it("hides the prior account schedule immediately while the next account loads", async () => {
    setAccount(31);
    let resolveNew!: (response: Response) => void;
    const newResponse = new Promise<Response>((resolve) => { resolveNew = resolve; });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(readyResponse([{ ...delayedItem, title: "Old Account Show", route: "old-account-show" }]))
      .mockReturnValueOnce(newResponse);
    vi.stubGlobal("fetch", fetcher);
    render(<ScheduleBrowser />);

    expect(await screen.findByRole("heading", { name: "Old Account Show" })).toBeVisible();
    await act(async () => { setAccount(32); });
    expect(screen.queryByRole("heading", { name: "Old Account Show" })).not.toBeInTheDocument();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    resolveNew(readyResponse([{ ...delayedItem, title: "New Account Show", route: "new-account-show" }]));

    expect(await screen.findByRole("heading", { name: "New Account Show" })).toBeVisible();
  });

  it("discards an old account request that settles after the account changes", async () => {
    setAccount(41);
    let resolveOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => { resolveOld = resolve; });
    const fetcher = vi.fn()
      .mockReturnValueOnce(oldResponse)
      .mockResolvedValueOnce(readyResponse([{ ...delayedItem, title: "Current Account Show", route: "current-account-show" }]));
    vi.stubGlobal("fetch", fetcher);
    render(<ScheduleBrowser />);

    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await act(async () => { setAccount(42); });
    expect(await screen.findByRole("heading", { name: "Current Account Show" })).toBeVisible();
    resolveOld(readyResponse([{ ...delayedItem, title: "Previous Account Show", route: "previous-account-show" }]));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Previous Account Show" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Current Account Show" })).toBeVisible();
  });

  it("reports missing API configuration and retries", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { code: "not_configured" } }, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ScheduleBrowser />);

    expect(await screen.findByRole("heading", { name: "Connect the broadcast schedule" })).toBeVisible();
    expect(screen.getByRole("link", { name: /AnimeSchedule API setup/ })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("shows a retryable service error without exposing upstream details", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("upstream detail"));
    vi.stubGlobal("fetch", fetcher);
    render(<ScheduleBrowser />);

    expect(await screen.findByRole("heading", { name: "The broadcast schedule is taking a break" })).toBeVisible();
    expect(screen.getByText("We could not reach the AnimeSchedule broadcast timetable. Check the connection and try again.")).toBeVisible();
    expect(screen.queryByText("upstream detail")).not.toBeInTheDocument();
  });

  it("keeps the previous day selectable and supports returning to Today", async () => {
    const fetcher = vi.fn().mockResolvedValue(readyResponse());
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<ScheduleBrowser />);

    await screen.findByRole("heading", { name: "Evening Comet" });
    const today = screen.getByRole("button", { name: /^Today$/ });
    expect(today).toBeDisabled();
    const days = screen.getAllByRole("button", { name: /scheduled$/ });
    const currentIndex = days.findIndex((day) => day.getAttribute("aria-pressed") === "true");
    await user.click(days[(currentIndex + 1) % days.length]);
    expect(today).toBeEnabled();
    await user.click(today);
    expect(today).toBeDisabled();
  });
});