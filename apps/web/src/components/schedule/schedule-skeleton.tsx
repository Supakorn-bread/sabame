import type { CalendarView } from "./schedule-calendar";
import styles from "./schedule-calendar.module.css";

const placeholder = "rounded bg-[var(--bg-high)]";

export function ScheduleSkeleton({ view }: { view: CalendarView }) {
  if (view === "week") {
    return (
      <div aria-hidden="true" data-schedule-skeleton="week" className="w-full animate-pulse motion-reduce:animate-none">
        <table className={styles.table}>
          <thead>
            <tr>
              <th><span className={`mx-auto block h-3 w-8 ${placeholder}`} /></th>
              {Array.from({ length: 7 }, (_, day) => (
                <th key={day}>
                  <span className={`mx-auto block h-3 w-8 ${placeholder}`} />
                  <span className={`mx-auto mt-2 block h-3 w-12 ${placeholder}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }, (_, row) => (
              <tr key={row}>
                <th><span className={`mx-auto block h-4 w-10 ${placeholder}`} /></th>
                {Array.from({ length: 7 }, (_, day) => (
                  <td key={day}><div className="mx-auto aspect-[5/7] w-full max-w-36 rounded-lg bg-[var(--bg-low)]" /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div aria-hidden="true" data-schedule-skeleton="day" className="animate-pulse space-y-8 motion-reduce:animate-none">
      {Array.from({ length: 2 }, (_, group) => (
        <div key={group}>
          <div className="mb-3 flex items-center gap-3">
            <span className={`h-8 w-24 rounded-full ${placeholder}`} />
            <span className="hidden h-px flex-1 bg-[var(--border)] sm:block" />
            <span className={`ml-auto h-3 w-24 ${placeholder}`} />
          </div>
          <div className="grid items-stretch gap-3 lg:grid-cols-2">
            {Array.from({ length: 2 }, (_, card) => (
              <div key={card} className="flex min-h-[150px] gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-lowest)] p-3 sm:gap-5 sm:p-4">
                <div className="aspect-[4/5] w-24 shrink-0 rounded-lg bg-[var(--bg-low)] sm:w-28" />
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                  <div className="space-y-2">
                    <div className="mb-3 flex gap-2"><span className={`h-6 w-10 ${placeholder}`} /><span className={`my-1 h-4 w-16 ${placeholder}`} /></div>
                    <div className={`h-4 w-5/6 ${placeholder}`} />
                    <div className={`h-4 w-2/3 ${placeholder}`} />
                    <div className={`h-3 w-20 max-w-full ${placeholder}`} />
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className={`h-4 w-20 ${placeholder}`} />
                    <span className={`h-4 w-20 ${placeholder}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
