import { useState } from "react";

import { formatEventStart } from "../../lib/format";
import type { EventDeployment } from "../../types/chainticket";

function buildPosterMeta(event: EventDeployment): string {
  const parts = [formatEventStart(event.startsAt), event.city, event.countryCode].filter(Boolean);
  return parts.join(" · ");
}

export function EventPoster({
  event,
  className,
}: {
  event: EventDeployment;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(event.imageUrl) && !imageFailed;

  if (showImage) {
    return (
      <img
        className={className ? `event-poster ${className}` : "event-poster"}
        src={event.imageUrl ?? undefined}
        alt={event.name}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className={className ? `event-poster fallback ${className}` : "event-poster fallback"}>
      <small>{event.category ?? "Live event"}</small>
      <strong>{event.name}</strong>
      <span>{buildPosterMeta(event)}</span>
    </div>
  );
}
