import { useState } from "react";
import { isAddress } from "ethers";
import {
  Badge,
  ButtonGroup,
  Card,
  DetailAccordion,
  InfoList,
  PageHeader,
  Panel,
  RiskBanner,
  Tag,
} from "../components/ui/Primitives";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n/I18nContext";
import { formatPol } from "../lib/format";
import { useAppState } from "../state/AppStateContext";

export function OrganizerPage() {
  const { t } = useI18n();
  const {
    contractConfig,
    walletAddress,
    userRoles,
    systemState,
    marketStats,
    preparePreview,
    setErrorMessage,
    refreshDashboard,
    uiMode,
  } = useAppState();
  const [scannerAddressInput, setScannerAddressInput] = useState("");

  const canOperate = userRoles.isAdmin || userRoles.isPauser;
  const canManageScanners = userRoles.isScannerAdmin;
  const hasOrganizerAccess = canOperate || canManageScanners;

  const runPauseToggle = async (shouldPause: boolean) => {
    if (!canOperate) {
      setErrorMessage(t("organizerNeedsRole"));
      return;
    }

    await preparePreview({
      label: shouldPause ? "Pause system" : "Unpause system",
      description: shouldPause
        ? "Pause mint, list, buy, and scanner operations."
        : "Resume mint, list, buy, and scanner operations.",
      details: [
        "Requires PAUSER_ROLE on TicketNFT.",
        "Affects fan, scanner, and market actions instantly.",
      ],
      run: async (client) => {
        if (shouldPause) {
          if (!client.pauseSystem) {
            throw new Error("Pause method unavailable.");
          }
          return client.pauseSystem();
        }
        if (!client.unpauseSystem) {
          throw new Error("Unpause method unavailable.");
        }
        return client.unpauseSystem();
      },
    });
  };

  const runCollectibleToggle = async (enabled: boolean) => {
    if (!userRoles.isAdmin) {
      setErrorMessage("Admin role required for collectible mode.");
      return;
    }

    await preparePreview({
      label: enabled ? "Enable collectible mode" : "Disable collectible mode",
      description: "Toggle post-event collectible metadata mode.",
      details: [
        "Requires DEFAULT_ADMIN_ROLE.",
        "Impacts tokenURI rendering for all tickets.",
      ],
      run: async (client) => {
        if (!client.setCollectibleMode) {
          throw new Error("Collectible mode method unavailable.");
        }
        return client.setCollectibleMode(enabled);
      },
    });
  };

  const runScannerRoleChange = async (mode: "grant" | "revoke") => {
    const targetAddress = scannerAddressInput.trim();
    if (!canManageScanners) {
      setErrorMessage("Scanner admin role required to manage venue operators.");
      return;
    }
    if (!isAddress(targetAddress)) {
      setErrorMessage("Enter a valid scanner wallet address.");
      return;
    }

    await preparePreview({
      label: mode === "grant" ? "Grant scanner role" : "Revoke scanner role",
      description:
        mode === "grant"
          ? "Authorize a venue wallet to submit irreversible check-ins."
          : "Remove scanner permissions from a venue wallet.",
      details: [
        "Requires DEFAULT_ADMIN_ROLE on CheckInRegistry.",
        "Applies to scanner operations immediately after confirmation.",
        "Recommended governance path: timelock or multisig as long-term admin.",
      ],
      run: async (client) => {
        if (mode === "grant") {
          if (!client.grantScannerRole) {
            throw new Error("Grant scanner method unavailable.");
          }
          return client.grantScannerRole(targetAddress);
        }
        if (!client.revokeScannerRole) {
          throw new Error("Revoke scanner method unavailable.");
        }
        return client.revokeScannerRole(targetAddress);
      },
    });
  };

  return (
    <div className="route-stack organizer-route" data-testid="organizer-page">
      <PageHeader
        title={t("organizerTitle")}
        subtitle="Operational control center split between monitoring and sensitive actions."
        context={
          <div className="inline-actions">
            <Tag tone={userRoles.isAdmin ? "success" : "warning"}>
              {userRoles.isAdmin ? "Admin" : "No admin"}
            </Tag>
            <Tag tone={userRoles.isScannerAdmin ? "success" : "warning"}>
              {userRoles.isScannerAdmin ? "Scanner admin" : "No scanner admin"}
            </Tag>
            <Tag tone={userRoles.isPauser ? "success" : "warning"}>
              {userRoles.isPauser ? "Pauser" : "No pauser"}
            </Tag>
          </div>
        }
        primaryAction={
          <button type="button" className="ghost" onClick={() => void refreshDashboard()}>
            {t("refresh")}
          </button>
        }
        secondaryActions={
          <Link to="/app/advanced" className="button-link ghost">
            {t("navAdvanced")}
          </Link>
        }
      />

      {!hasOrganizerAccess ? (
        <RiskBanner
          tone="error"
          title="Restricted area"
          cause={t("organizerNeedsRole")}
          impact="Administrative operations cannot be signed by this wallet."
          action="Connect a wallet with admin, scanner admin, or pauser role."
        />
      ) : null}

      <Panel className="primary-panel">
        <section className="organizer-grid">
          <Card>
            <h3>Monitoring</h3>
            <InfoList
              entries={[
                {
                  label: "System pause",
                  value: (
                    <Badge tone={systemState?.paused ? "danger" : "success"}>
                      {systemState?.paused ? t("enabled") : t("disabled")}
                    </Badge>
                  ),
                },
                {
                  label: "Collectible mode",
                  value: (
                    <Badge tone={systemState?.collectibleMode ? "info" : "default"}>
                      {systemState?.collectibleMode ? t("enabled") : t("disabled")}
                    </Badge>
                  ),
                },
                {
                  label: "Primary price",
                  value: systemState ? `${formatPol(systemState.primaryPrice)} POL` : "-",
                },
                { label: "Operator wallet", value: walletAddress || "Not connected" },
                { label: "Total minted", value: systemState?.totalMinted.toString() ?? "-" },
                { label: "Listings", value: marketStats?.listingCount ?? 0 },
                {
                  label: "Floor",
                  value: marketStats?.floorPrice ? `${formatPol(marketStats.floorPrice)} POL` : "-",
                },
                {
                  label: "Median",
                  value: marketStats?.medianPrice ? `${formatPol(marketStats.medianPrice)} POL` : "-",
                },
              ]}
            />
          </Card>

          <Card className="organizer-actions">
            <h3>Sensitive actions</h3>
            <ButtonGroup>
              <button
                type="button"
                className="ghost"
                onClick={() => void runPauseToggle(true)}
                disabled={!canOperate || Boolean(systemState?.paused)}
              >
                {t("pauseSystem")}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void runPauseToggle(false)}
                disabled={!canOperate || !systemState?.paused}
              >
                {t("unpauseSystem")}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void runCollectibleToggle(true)}
                disabled={!userRoles.isAdmin || Boolean(systemState?.collectibleMode)}
              >
                {t("enableCollectible")}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void runCollectibleToggle(false)}
                disabled={!userRoles.isAdmin || !systemState?.collectibleMode}
              >
                {t("disableCollectible")}
              </button>
            </ButtonGroup>
          </Card>

          <Card>
            <h3>Scanner role management</h3>
            <p>Grant or revoke venue scanning rights without leaving the organizer cockpit.</p>
            <label>
              Scanner wallet
              <input
                value={scannerAddressInput}
                onChange={(event) => setScannerAddressInput(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <ButtonGroup>
              <button
                type="button"
                className="primary"
                onClick={() => void runScannerRoleChange("grant")}
                disabled={!canManageScanners}
              >
                Grant scanner
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void runScannerRoleChange("revoke")}
                disabled={!canManageScanners}
              >
                Revoke scanner
              </button>
            </ButtonGroup>
          </Card>

          <Card>
            <h3>Contract addresses</h3>
            <InfoList
              entries={[
                { label: "TicketNFT", value: contractConfig.ticketNftAddress },
                { label: "Marketplace", value: contractConfig.marketplaceAddress },
                { label: "CheckInRegistry", value: contractConfig.checkInRegistryAddress },
              ]}
            />
            <p>
              Recommended governance posture: keep long-term admin rights behind a multisig or
              timelock, and reserve pauser/scanner duties for operational wallets.
            </p>
          </Card>
        </section>
      </Panel>

      <DetailAccordion
        title="Operational controls"
        subtitle="Execution safeguards for organizer actions"
        defaultOpenDesktop={uiMode === "advanced"}
      >
        <ul className="plain-list">
          <li>Pause and unpause controls require pauser permissions.</li>
          <li>Collectible mode changes require admin permissions.</li>
          <li>Scanner grants and revocations require scanner-admin permissions.</li>
          <li>Displayed contract addresses should be governed by a multisig or timelock in production.</li>
          <li>Every protected action is routed through transaction preview before signing.</li>
        </ul>
      </DetailAccordion>
    </div>
  );
}
