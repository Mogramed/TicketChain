import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "../components/layout/AppLayout";

const FanPage = lazy(async () => {
  const module = await import("../routes/FanPage");
  return { default: module.FanPage };
});
const MarketPage = lazy(async () => {
  const module = await import("../routes/MarketPage");
  return { default: module.MarketPage };
});
const TicketsPage = lazy(async () => {
  const module = await import("../routes/TicketsPage");
  return { default: module.TicketsPage };
});
const AdvancedHubPage = lazy(async () => {
  const module = await import("../routes/AdvancedHubPage");
  return { default: module.AdvancedHubPage };
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
        <Route path="/" element={<Navigate to="/app/fan" replace />} />
        <Route path="/app" element={<Navigate to="/app/fan" replace />} />
        <Route path="/buy" element={<Navigate to="/app/fan" replace />} />
        <Route path="/resale" element={<Navigate to="/app/market" replace />} />
        <Route path="/my-tickets" element={<Navigate to="/app/tickets" replace />} />
        <Route path="/advanced" element={<Navigate to="/app/advanced" replace />} />
        <Route path="/scanner" element={<Navigate to="/app/scanner" replace />} />
        <Route path="/organizer" element={<Navigate to="/app/organizer" replace />} />
        <Route path="/settings" element={<Navigate to="/app/advanced/settings" replace />} />
        <Route path="/app/settings" element={<Navigate to="/app/advanced/settings" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/app/fan" element={<FanPage />} />
          <Route path="/app/market" element={<MarketPage />} />
          <Route path="/app/tickets" element={<TicketsPage />} />
          <Route path="/app/advanced" element={<AdvancedHubPage />} />
          <Route path="/app/tickets/:tokenId" element={<TicketDetailPage />} />
          <Route path="/app/scanner" element={<ScannerPage />} />
          <Route path="/app/organizer" element={<OrganizerPage />} />
          <Route path="/app/advanced/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
