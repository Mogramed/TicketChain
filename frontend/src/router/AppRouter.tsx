import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "../components/layout/AppLayout";

const ExplorePage = lazy(async () => {
  const module = await import("../routes/ExplorePage");
  return { default: module.ExplorePage };
});
const MarketPage = lazy(async () => {
  const module = await import("../routes/MarketPage");
  return { default: module.MarketPage };
});
const TicketsPage = lazy(async () => {
  const module = await import("../routes/TicketsPage");
  return { default: module.TicketsPage };
});
const EventDetailPage = lazy(async () => {
  const module = await import("../routes/EventDetailPage");
  return { default: module.EventDetailPage };
});
const TicketDetailPage = lazy(async () => {
  const module = await import("../routes/TicketDetailPage");
  return { default: module.TicketDetailPage };
});
const ScannerPage = lazy(async () => {
  const module = await import("../routes/ScannerPage");
  return { default: module.ScannerPage };
});
const OrganizerPage = lazy(async () => {
  const module = await import("../routes/OrganizerPage");
  return { default: module.OrganizerPage };
});
const OrganizerSalesPage = lazy(async () => {
  const module = await import("../routes/OrganizerSalesPage");
  return { default: module.OrganizerSalesPage };
});
const SettingsPage = lazy(async () => {
  const module = await import("../routes/SettingsPage");
  return { default: module.SettingsPage };
});
const NotFoundPage = lazy(async () => {
  const module = await import("../routes/NotFoundPage");
  return { default: module.NotFoundPage };
});

function RouteLoadingFallback() {
  return (
    <div className="route-stack" data-testid="route-loading">
      <div className="ui-panel">
        <p>Loading route...</p>
      </div>
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/app/explore" replace />} />
        <Route path="/app" element={<Navigate to="/app/explore" replace />} />
        <Route path="/buy" element={<Navigate to="/app/explore" replace />} />
        <Route path="/resale" element={<Navigate to="/app/marketplace" replace />} />
        <Route path="/my-tickets" element={<Navigate to="/app/tickets" replace />} />
        <Route path="/advanced" element={<Navigate to="/app/organizer" replace />} />
        <Route path="/scanner" element={<Navigate to="/app/organizer/scanner" replace />} />
        <Route path="/organizer" element={<Navigate to="/app/organizer" replace />} />
        <Route path="/settings" element={<Navigate to="/app/organizer/settings" replace />} />
        <Route path="/app/settings" element={<Navigate to="/app/organizer/settings" replace />} />
        <Route path="/app/fan" element={<Navigate to="/app/explore" replace />} />
        <Route path="/app/market" element={<Navigate to="/app/marketplace" replace />} />
        <Route path="/app/advanced" element={<Navigate to="/app/organizer" replace />} />
        <Route path="/app/scanner" element={<Navigate to="/app/organizer/scanner" replace />} />
        <Route path="/app/advanced/settings" element={<Navigate to="/app/organizer/settings" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/app/explore" element={<ExplorePage />} />
          <Route path="/app/explore/:eventId" element={<EventDetailPage />} />
          <Route path="/app/marketplace" element={<MarketPage />} />
          <Route path="/app/tickets" element={<TicketsPage />} />
          <Route path="/app/tickets/:tokenId" element={<TicketDetailPage />} />
          <Route path="/app/organizer" element={<OrganizerPage />} />
          <Route path="/app/organizer/scanner" element={<ScannerPage />} />
          <Route path="/app/organizer/sales" element={<OrganizerSalesPage />} />
          <Route path="/app/organizer/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
