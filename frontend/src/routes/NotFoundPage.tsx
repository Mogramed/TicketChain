import { Link } from "react-router-dom";
import { Card, PageHeader, Panel } from "../components/ui/Primitives";

export function NotFoundPage() {
  return (
    <div className="route-stack">
      <PageHeader
        title="Route not found"
        subtitle="This page does not exist or the URL is outdated."
      />
      <Panel>
        <Card>
          <p>Choose one of the main flows to continue.</p>
          <div className="inline-actions">
            <Link to="/app/fan" className="button-link primary">
              Go to Buy
            </Link>
            <Link to="/app/market" className="button-link ghost">
              Go to Resale
            </Link>
            <Link to="/app/tickets" className="button-link ghost">
              Go to Tickets
            </Link>
          </div>
        </Card>
      </Panel>
    </div>
  );
}
