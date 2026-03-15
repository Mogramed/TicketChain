import { RiskBanner } from "../ui/Primitives";
import { useAppState } from "../../state/useAppState";

export function IndexedReadinessBanner({
  title = "Indexed data unavailable",
  impact = "Listings, owned tickets, timelines, and live indexed views stay unavailable until the BFF read model is ready.",
  action = "Keep the BFF running, confirm DEPLOYMENT_BLOCK matches the deployed contracts, and wait for the indexer to catch up.",
}: {
  title?: string;
  impact?: string;
  action?: string;
}) {
  const { runtimeConfig, indexedReadsIssue, bffMode } = useAppState();

  if (!runtimeConfig.apiBaseUrl || !indexedReadsIssue) {
    return null;
  }

  return (
    <RiskBanner
      tone={bffMode === "offline" ? "error" : "warning"}
      title={title}
      cause={indexedReadsIssue}
      impact={impact}
      action={action}
    />
  );
}
