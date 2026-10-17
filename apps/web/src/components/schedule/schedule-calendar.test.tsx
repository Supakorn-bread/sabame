import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleAnime } from "@/features/schedule/model";
import { ScheduleCalendar } from "./schedule-calendar";
const days = Array.from({ length: 7 }, (_, index) => new Date(2026, 8, 21 + index));
const anime: ScheduleAnime = { id: "a", title: "Comet A", route: "a", imageVersionRoute: null, episodeDate: "2026-09-23T05:00:00Z", delayedUntil: null, delayedText: null, episodeNumber: 4, subtractedEpisodeNumber: null, status: "Upcoming", airingStatus: "upcoming", airType: "Raw" };
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  });
});
afterEach(() => vi.unstubAllGlobals());
function calendar(items: ScheduleAnime[], view: "week" | "day" = "week", selectedDay = 2) {
  return <ScheduleCalendar days={days} items={items} timeZone="Asia/Bangkok" view={view} selectedDay={selectedDay} />;
}
describe("ScheduleCalendar", () => {
  it("opens singleton details on hover without moving focus and closes on mouse exit", async () => {
    const user = userEvent.setup();
    render(<><button type="button">Outside action</button>{calendar([anime])}</>);
    const outside = screen.getByRole("button", { name: "Outside action" });
    outside.focus();
    await user.hover(screen.getByRole("button", { name: "Show details for Comet A" }));
    const dialog = await screen.findByRole("dialog", { name: "Comet A broadcast details" });
    expect(outside).toHaveFocus();
    fireEvent.pointerOut(dialog, { pointerType: "mouse", clientX: -10, clientY: -10, relatedTarget: document.body });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(outside).toHaveFocus();
  });
  it("does not move body focus when hover details close", async () => {
    const user = userEvent.setup();
    render(calendar([anime]));
    await user.hover(screen.getByRole("button", { name: "Show details for Comet A" }));
    const dialog = await screen.findByRole("dialog");
    expect(document.body).toHaveFocus();
    fireEvent.pointerOut(dialog, { pointerType: "mouse", clientX: -10, clientY: -10, relatedTarget: document.body });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body).toHaveFocus();
  });
  it("keeps a hovered singleton open when its portal cover is clicked", async () => {
    const user = userEvent.setup();
    render(calendar([anime]));
    const trigger = screen.getByRole("button", { name: "Show details for Comet A" });
    await user.hover(trigger);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Comet A cover" }));
    await waitFor(() => expect(dialog).toHaveAttribute("data-phase", "open"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
  it("requires group activation and then opens the hovered cover without moving focus", async () => {
    const user = userEvent.setup();
    render(calendar([anime, { ...anime, id: "b", title: "Comet B", route: "b" }]));
    const trigger = screen.getByRole("button", { name: "2 broadcasts at 12:00" });
    await user.hover(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    const cover = await within(dialog).findByRole("button", { name: "Show details for Comet B" });
    await waitFor(() => expect(dialog).toHaveAttribute("data-phase", "open"));
    await user.hover(cover);
    fireEvent.pointerMove(cover, { pointerType: "mouse", clientX: 1, clientY: 1 });
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Comet B" })).toBeVisible());
    expect(within(dialog).getByRole("link", { name: "Anime details" })).toHaveAttribute("href", "https://animeschedule.net/anime/b");
    expect(within(dialog).getByRole("link", { name: "Anime details" })).not.toHaveFocus();
    fireEvent.pointerOut(dialog, { pointerType: "mouse", clientX: -10, clientY: -10, relatedTarget: document.body });
    expect(dialog).toHaveAttribute("data-phase", "open");
  });
  it("keeps the group carousel after synthetic cover entry until the pointer moves", async () => {
    const user = userEvent.setup();
    render(calendar([anime, { ...anime, id: "b", title: "Comet B" }, { ...anime, id: "c", title: "Comet C" }]));
    await user.click(screen.getByRole("button", { name: "3 broadcasts at 12:00" }));
    const dialog = await screen.findByRole("dialog");
    const cover = within(dialog).getByRole("button", { name: "Show details for Comet B" });
    await waitFor(() => expect(dialog).toHaveAttribute("data-phase", "open"));
    fireEvent.pointerOver(cover, { pointerType: "mouse" });
    fireEvent.pointerMove(cover, { pointerType: "mouse", clientX: 0, clientY: 0 });
    expect(within(dialog).queryByRole("heading")).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { name: /Show details for/ })).toHaveLength(3);
    fireEvent.pointerMove(cover, { pointerType: "mouse", clientX: 2, clientY: 1 });
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Comet B" })).toBeVisible());
  });
  it("cancels a pending singleton close when the pointer re-enters", async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
    const user = userEvent.setup();
    render(calendar([anime]));
    await user.hover(screen.getByRole("button", { name: "Show details for Comet A" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveAttribute("data-phase", "open"));
    fireEvent.pointerOut(dialog, { pointerType: "mouse", clientX: -10, clientY: -10, relatedTarget: document.body });
    expect(dialog).toHaveAttribute("data-phase", "closing");
    fireEvent.pointerOver(dialog, { pointerType: "mouse", relatedTarget: document.body });
    await waitFor(() => expect(dialog).toHaveAttribute("data-phase", "open"));
    await new Promise((resolve) => setTimeout(resolve, 240));
    expect(dialog).toBeVisible();
    expect(document.body).toHaveFocus();
  });
  it("finishes grouped outside dismissal even if the pointer re-enters during closing", async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
    const user = userEvent.setup();
    render(calendar([anime, { ...anime, id: "b", title: "Comet B" }]));
    await user.click(screen.getByRole("button", { name: "2 broadcasts at 12:00" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveAttribute("data-phase", "open"));
    fireEvent.pointerDown(document.body);
    expect(dialog).toHaveAttribute("data-phase", "closing");
    fireEvent.pointerOver(dialog, { pointerType: "mouse", relatedTarget: document.body });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("does not reopen under a stationary pointer after Escape", async () => {
    const user = userEvent.setup();
    render(calendar([anime]));
    const trigger = screen.getByRole("button", { name: "Show details for Comet A" });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.pointerOver(trigger, { pointerType: "mouse" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.pointerOut(trigger, { pointerType: "mouse", clientX: -10, clientY: -10, relatedTarget: document.body });
    fireEvent.pointerOver(trigger, { pointerType: "mouse" });
    await screen.findByRole("dialog");
  });
  it("renders seven day headers and only occupied exact-minute rows with cover-only cells", () => {
    render(calendar([anime, { ...anime, id: "b", title: "Comet B", episodeDate: "2026-09-24T05:01:00Z" }]));
    const table = screen.getByRole("table", { name: "Weekly broadcast calendar" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(8);
    expect(within(table).getAllByRole("rowheader").map((node) => node.textContent)).toEqual(["12:00", "12:01"]);
    expect(within(table).getAllByRole("cell")).toHaveLength(14);
    expect(screen.queryByRole("heading", { name: "Comet A" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show details for Comet A" })).toBeVisible();
  });
  it("opens a singleton on one click and restores focus after Escape", async () => {
    const user = userEvent.setup();
    render(calendar([anime]));
    const trigger = screen.getByRole("button", { name: "Show details for Comet A" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Comet A broadcast details" });
    await waitFor(() => expect(within(dialog).getByRole("heading", { name: "Comet A" })).toBeVisible());
    expect(within(dialog).getByText("Episode 4")).toBeVisible();
    expect(within(dialog).getByRole("link", { name: "Anime details" })).toHaveAttribute("href", "https://animeschedule.net/anime/a");
    const restoreFocus = vi.spyOn(trigger, "focus").mockImplementation(() => {
      expect(getComputedStyle(trigger).visibility).toBe("visible");
      HTMLElement.prototype.focus.call(trigger);
    });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(restoreFocus).toHaveBeenCalledOnce();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it.each([2, 3, 4])("shows %i entries in a bounded window and opens every visible cover", async (count) => {
    const user = userEvent.setup();
    render(calendar(Array.from({ length: count }, (_, index) => ({ ...anime, id: String(index), title: `Comet ${index}` }))));
    await user.click(screen.getByRole("button", { name: `${count} broadcasts at 12:00` }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Show details for Comet 0" })).toBeVisible());
    expect(within(dialog).getAllByRole("button", { name: /Show details for/ })).toHaveLength(Math.min(3, count));
    expect(within(dialog).getByRole("button", { name: "Previous broadcast" })).toBeDisabled();
    const next = within(dialog).getByRole("button", { name: "Next broadcast" });
    if (count <= 3) expect(next).toBeDisabled();
    else {
      await user.click(next);
      expect(next).toBeDisabled();
      expect(within(dialog).queryByRole("button", { name: "Show details for Comet 0" })).not.toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Show details for Comet 3" })).toBeVisible();
      await user.click(within(dialog).getByRole("button", { name: "Previous broadcast" }));
      expect(within(dialog).getByRole("button", { name: "Previous broadcast" })).toBeDisabled();
    }
    await user.click(within(dialog).getByRole("button", { name: "Show details for Comet 0" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Comet 0" })).toBeVisible());
    await waitFor(() => expect(within(dialog).getByRole("link", { name: "Anime details" })).toHaveFocus());
  });
  it("keeps cover-to-detail pointer transfer open and dismisses outside clicks", async () => {
    const user = userEvent.setup();
    render(calendar([anime]));
    await user.click(screen.getByRole("button", { name: "Show details for Comet A" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.pointerLeave(within(dialog).getByRole("button", { name: "Comet A cover" }), { pointerType: "mouse", relatedTarget: within(dialog).getByRole("heading") });
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("renders only the selected day in Day view", () => {
    render(calendar([anime, { ...anime, id: "b", title: "Thursday", episodeDate: "2026-09-24T05:00:00Z" }], "day"));
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Show details for Comet A" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show details for Thursday" })).not.toBeInTheDocument();
  });
  it("returns focus when a nonfocusable outside region dismisses the focused portal", async () => {
    const user = userEvent.setup();
    render(calendar([anime]));
    const trigger = screen.getByRole("button", { name: "Show details for Comet A" });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByRole("button", { name: "Comet A cover" })).toHaveFocus());
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("keeps an outside button focused when it dismisses the portal", async () => {
    const user = userEvent.setup();
    render(<><button type="button">Outside action</button>{calendar([anime])}</>);
    await user.click(screen.getByRole("button", { name: "Show details for Comet A" }));
    await screen.findByRole("dialog");
    const outside = screen.getByRole("button", { name: "Outside action" });
    await user.click(outside);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(outside).toHaveFocus();
  });
  it("preserves focus on the details link when page scrolling repositions the portal", async () => {
    const user = userEvent.setup();
    render(calendar([anime]));
    await user.click(screen.getByRole("button", { name: "Show details for Comet A" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("heading")).toBeVisible());
    const link = within(dialog).getByRole("link", { name: "Anime details" });
    link.focus();
    fireEvent.scroll(window);
    await waitFor(() => expect(link).toHaveFocus());
    expect(dialog).toBeVisible();
  });

  it("keeps grouped carousels and their details open after pointer exit", async () => {
    const user = userEvent.setup();
    render(calendar([anime, { ...anime, id: "b", title: "Comet B" }]));
    await user.click(screen.getByRole("button", { name: "2 broadcasts at 12:00" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Show details for Comet A" })).toBeVisible());
    await waitFor(() => expect(dialog).toHaveAttribute("data-phase", "open"));
    fireEvent.pointerOut(dialog, { pointerType: "mouse", clientX: -10, clientY: -10, relatedTarget: document.body });
    expect(dialog).toHaveAttribute("data-phase", "open");
    await user.click(within(dialog).getByRole("button", { name: "Show details for Comet B" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Comet B" })).toBeVisible());
    await waitFor(() => expect(dialog).toHaveAttribute("data-phase", "open"));
    fireEvent.pointerOut(dialog, { pointerType: "mouse", clientX: -10, clientY: -10, relatedTarget: document.body });
    expect(dialog).toHaveAttribute("data-phase", "open");
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("keeps touch details open on pointer exit but dismisses singleton mouse exit", async () => {
    const user = userEvent.setup();
    render(calendar([anime]));
    await user.click(screen.getByRole("button", { name: "Show details for Comet A" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("heading")).toBeVisible());
    fireEvent.pointerOut(dialog, { pointerType: "touch", clientX: -10, clientY: -10, relatedTarget: document.body });
    expect(dialog).toHaveAttribute("data-phase", "open");
    fireEvent.pointerOut(dialog, { pointerType: "mouse", clientX: -10, clientY: -10, relatedTarget: document.body });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

});
