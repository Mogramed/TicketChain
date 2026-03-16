import type { EventDeployment } from "../../types/chainticket";
import { Tag } from "../ui/Primitives";

export function EventDemoNotice({
  event,
  compact = false,
}: {
  event: EventDeployment | null;
  compact?: boolean;
}) {
  if (!event?.isDemoInspired) {
    return null;
  }

  return (
    <section className={compact ? "event-demo-notice compact" : "event-demo-notice"}>
      <div className="event-demo-notice-copy">
        <Tag tone="warning">Demo inspired by a real event</Tag>
        <p>{event.demoDisclaimer ?? "Demo pass only - not official venue admission"}</p>
      </div>
      {event.sourceUrl ? (
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="button-link ghost compact-link"
        >
          View source event
        </a>
      ) : null}
    </section>
  );
}
