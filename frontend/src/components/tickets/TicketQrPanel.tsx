import QRCode from "react-qr-code";

export function TicketQrPanel({
  value,
  title,
  subtitle,
  className,
}: {
  value: string;
  title: string;
  subtitle: string;
  className?: string;
}) {
  return (
    <div className={className ? `ticket-qr-panel ${className}` : "ticket-qr-panel"}>
      <div className="ticket-qr-shell">
        <QRCode
          size={132}
          value={value}
          bgColor="#ffffff"
          fgColor="#08101b"
          viewBox="0 0 256 256"
        />
      </div>
      <div className="ticket-qr-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}
