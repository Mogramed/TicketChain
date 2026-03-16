import { useState } from "react";

import type { TicketMediaAsset } from "../../types/chainticket";

export function TicketMedia({
  media,
  fallbackTitle,
  fallbackSubtitle,
  className,
}: {
  media: TicketMediaAsset;
  fallbackTitle: string;
  fallbackSubtitle?: string;
  className?: string;
}) {
  const [assetFailed, setAssetFailed] = useState(false);
  const showFallback =
    assetFailed || media.kind === "fallback" || !media.src;

  if (showFallback) {
    return (
      <div className={className ? `ticket-media ${className}` : "ticket-media"}>
        <div className="ticket-media-fallback">
          <p>ChainTicket collectible</p>
          <strong>{fallbackTitle}</strong>
          {fallbackSubtitle ? <span>{fallbackSubtitle}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={className ? `ticket-media ${className}` : "ticket-media"}>
      {media.kind === "animation" ? (
        <video
          className="ticket-media-asset"
          autoPlay
          loop
          muted
          playsInline
          poster={media.posterSrc ?? undefined}
          onError={() => setAssetFailed(true)}
        >
          <source src={media.src ?? undefined} />
        </video>
      ) : (
        <img
          className="ticket-media-asset"
          src={media.src ?? undefined}
          alt={media.alt}
          loading="lazy"
          onError={() => setAssetFailed(true)}
        />
      )}
    </div>
  );
}
