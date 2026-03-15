import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "ethers";
import { Link } from "react-router-dom";

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
import { useI18n } from "../i18n/I18nContext";
import { createBffClient } from "../lib/bffClient";
import {
  DEFAULT_ADMIN_ROLE,
  PAUSER_ROLE,
  SCANNER_ADMIN_ROLE,
  SCANNER_ROLE,
} from "../lib/chainTicketClient/parsers";
import { formatAddress, formatPol } from "../lib/format";
import { buildCollectibleModeGovernancePacket, type GovernancePacket } from "../lib/governance";
import { useAppState } from "../state/useAppState";
import type { OperationalActivity, OperationalRoleAssignment } from "../types/chainticket";

function labelRole(role: OperationalRoleAssignment): string {
  if (role.roleId === DEFAULT_ADMIN_ROLE && role.contractScope === "ticket") {
    return "Governance admins";
  }
  if (role.roleId === PAUSER_ROLE) {
    return "Pausers";
  }
  if (role.roleId === SCANNER_ADMIN_ROLE) {
    return "Scanner admins";
  }
  if (role.roleId === SCANNER_ROLE) {
    return "Scanners";
  }
  return `${role.contractScope} role`;
}

function describeActivity(activity: OperationalActivity): string {
  if (activity.type === "paused") {
    return `System paused by ${activity.actor ? formatAddress(activity.actor, 6) : "unknown"}`;
  }
  if (activity.type === "unpaused") {
    return `System unpaused by ${activity.actor ? formatAddress(activity.actor, 6) : "unknown"}`;
  }

  const account = activity.account ? formatAddress(activity.account, 6) : "unknown";
  const actor = activity.actor ? formatAddress(activity.actor, 6) : "unknown";
  const roleLabel =
    activity.roleId === DEFAULT_ADMIN_ROLE
      ? "governance admin"
      : activity.roleId === PAUSER_ROLE
        ? "pauser"
        : activity.roleId === SCANNER_ADMIN_ROLE
          ? "scanner admin"
          : activity.roleId === SCANNER_ROLE
            ? "scanner"
            : "custom role";

  return activity.type === "role_granted"
    ? `${roleLabel} granted to ${account} by ${actor}`
    : `${roleLabel} revoked from ${account} by ${actor}`;
}

function formatGovernanceDelay(seconds: number): string {
  if (seconds <= 0) {
    return "No enforced delay";
  }

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

export function OrganizerPage() {
  const { t } = useI18n();
  const {
    contractConfig,
    runtimeConfig,
    indexedReadsAvailable,
    walletAddress,
    userRoles,
    systemState,
    marketStats,
    preparePreview,
    setErrorMessage,
    setStatusMessage,
    refreshDashboard,
    uiMode,
  } = useAppState();
  const [scannerAddressInput, setScannerAddressInput] = useState("");
  const [governancePacket, setGovernancePacket] = useState<GovernancePacket | null>(null);
  const bffClient = useMemo(
    () => createBffClient(runtimeConfig.apiBaseUrl),
    [runtimeConfig.apiBaseUrl],
  );
  const governancePacketJson = useMemo(
    () => (governancePacket ? JSON.stringify(governancePacket, null, 2) : ""),
    [governancePacket],
  );

  useEffect(() => {
    setGovernancePacket(null);
  }, [
    contractConfig.eventId,
    contractConfig.ticketNftAddress,
    runtimeConfig.governanceTimelockAddress,
  ]);

  const canPauseSystem = userRoles.isPauser;
  const canManageScanners = userRoles.isScannerAdmin;
  const canGovern = userRoles.isAdmin;
  const hasOrganizerAccess = canPauseSystem || canManageScanners || canGovern;

  const opsSummaryQuery = useQuery({
    queryKey: [
        "organizer-ops-summary",
        contractConfig.eventId,
        runtimeConfig.apiBaseUrl,
        indexedReadsAvailable,
      ],
    enabled: Boolean(bffClient && indexedReadsAvailable && contractConfig.eventId),
    retry: 1,
    refetchInterval: 25_000,
    queryFn: async () => bffClient!.getOperationalSummary(contractConfig.eventId),
  });

  const groupedRoles = useMemo(() => {
    const roles = opsSummaryQuery.data?.roles ?? [];
    return {
      governanceAdmins: roles.filter(
        (role) => role.contractScope === "ticket" && role.roleId === DEFAULT_ADMIN_ROLE,
      ),
      pausers: roles.filter(
        (role) => role.contractScope === "ticket" && role.roleId === PAUSER_ROLE,
      ),
      scannerAdmins: roles.filter(
        (role) =>
          role.contractScope === "checkin_registry" && role.roleId === SCANNER_ADMIN_ROLE,
      ),
      scanners: roles.filter(
        (role) => role.contractScope === "checkin_registry" && role.roleId === SCANNER_ROLE,
      ),
      extras: roles.filter(
        (role) =>
          !(
            (role.contractScope === "ticket" && role.roleId === DEFAULT_ADMIN_ROLE) ||
            (role.contractScope === "ticket" && role.roleId === PAUSER_ROLE) ||
            (role.contractScope === "checkin_registry" &&
              role.roleId === SCANNER_ADMIN_ROLE) ||
            (role.contractScope === "checkin_registry" && role.roleId === SCANNER_ROLE)
          ),
      ),
    };
  }, [opsSummaryQuery.data?.roles]);

  const runPauseToggle = async (shouldPause: boolean) => {
    if (!canPauseSystem) {
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
    if (!canGovern) {
      setErrorMessage("Governance admin role required for collectible mode.");
      return;
    }

    await preparePreview({
      label: enabled ? "Enable collectible mode" : "Disable collectible mode",
      description: "Toggle post-event collectible metadata mode.",
      details: [
        "Requires governance control over TicketNFT.",
        "In production this should flow through a timelock or multisig.",
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
        "Requires SCANNER_ADMIN_ROLE on CheckInRegistry.",
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

  const prepareGovernancePacket = (enabled: boolean) => {
    try {
      const packet = buildCollectibleModeGovernancePacket({
        desiredCollectibleMode: enabled,
        eventId: contractConfig.eventId,
        eventName: contractConfig.eventName,
        ticketNftAddress: contractConfig.ticketNftAddress,
        timelockAddress: runtimeConfig.governanceTimelockAddress,
        timelockMinDelaySeconds: runtimeConfig.governanceMinDelaySeconds,
      });
      setGovernancePacket(packet);
      setStatusMessage(
        `${packet.actionLabel} packet ready for ${
          packet.mode === "timelock" ? "timelock" : "multisig"
        } review.`,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to prepare governance packet.",
      );
    }
  };

  const copyGovernanceText = async (label: string, value: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable in this browser.");
      }
      await navigator.clipboard.writeText(value);
      setStatusMessage(`${label} copied to clipboard.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : `Unable to copy ${label.toLowerCase()}.`,
      );
    }
  };

  return (
    <div className="route-stack organizer-route" data-testid="organizer-page">
      <PageHeader
        title={t("organizerTitle")}
        subtitle="Operational controls stay on dedicated wallets while governance actions move through delayed admin flows."
        context={
          <div className="inline-actions">
            <Tag tone={canGovern ? "success" : "warning"}>
              {canGovern ? "Governance admin" : "No governance admin"}
            </Tag>
            <Tag tone={canManageScanners ? "success" : "warning"}>
              {canManageScanners ? "Scanner admin" : "No scanner admin"}
            </Tag>
            <Tag tone={canPauseSystem ? "success" : "warning"}>
              {canPauseSystem ? "Pauser" : "No pauser"}
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
          impact="Organizer actions cannot be signed by this wallet."
          action="Connect a governance admin, scanner admin, or pauser wallet."
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
                {
                  label: "Governance path",
                  value: canGovern
                    ? "Direct governance wallet connected"
                    : "Timelock / multisig expected for governance actions",
                },
                {
                  label: "Selected event",
                  value: contractConfig.eventName ?? contractConfig.eventId ?? "-",
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
            <h3>Operational controls</h3>
            <p>Immediate venue-safety actions stay on operational wallets with narrow permissions.</p>
            <ButtonGroup>
              <button
                type="button"
                className="ghost"
                onClick={() => void runPauseToggle(true)}
                disabled={!canPauseSystem || Boolean(systemState?.paused)}
              >
                {t("pauseSystem")}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void runPauseToggle(false)}
                disabled={!canPauseSystem || !systemState?.paused}
              >
                {t("unpauseSystem")}
              </button>
            </ButtonGroup>
            <p>
              Pause control requires <strong>PAUSER_ROLE</strong>. Governance-managed metadata changes are separated
              below so this cockpit does not over-promise what ops wallets can sign.
            </p>
          </Card>

          <Card>
            <h3>Scanner role management</h3>
            <p>Grant or revoke venue scanning rights without handing out global admin power.</p>
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
            <h3>Active operator roster</h3>
            <p>Derived from indexed admin logs for the selected event.</p>
            {!bffClient ? (
              <p>Set a BFF API base URL to unlock indexed operator rosters.</p>
            ) : !indexedReadsAvailable ? (
              <p>The BFF is reachable but the indexed organizer read model is not ready yet.</p>
            ) : opsSummaryQuery.isLoading ? (
              <p>Loading indexed operator assignments...</p>
            ) : opsSummaryQuery.data ? (
              <>
                <InfoList
                  entries={[
                    {
                      label: "Governance admins",
                      value: groupedRoles.governanceAdmins.length,
                    },
                    { label: "Pausers", value: groupedRoles.pausers.length },
                    {
                      label: "Scanner admins",
                      value: groupedRoles.scannerAdmins.length,
                    },
                    { label: "Scanners", value: groupedRoles.scanners.length },
                  ]}
                />
                {[
                  ...groupedRoles.governanceAdmins,
                  ...groupedRoles.pausers,
                  ...groupedRoles.scannerAdmins,
                  ...groupedRoles.scanners,
                  ...groupedRoles.extras,
                ].length === 0 ? (
                  <p>No active operator roles have been indexed yet for this event.</p>
                ) : (
                  <ul className="plain-list">
                    {[
                      ...groupedRoles.governanceAdmins,
                      ...groupedRoles.pausers,
                      ...groupedRoles.scannerAdmins,
                      ...groupedRoles.scanners,
                      ...groupedRoles.extras,
                    ].map((role) => (
                      <li key={`${role.contractScope}:${role.roleId}:${role.account}`}>
                        <strong>{labelRole(role)}:</strong> {formatAddress(role.account, 6)}
                        {" · "}
                        synced at block {role.updatedBlock}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>Operator roster unavailable right now.</p>
            )}
          </Card>

          <Card>
            <h3>Governance controls</h3>
            <p>
              Collectible mode is a governance action. In production, route it through the timelock or multisig that
              holds <code>DEFAULT_ADMIN_ROLE</code>.
            </p>
            <InfoList
              entries={[
                {
                  label: "Collectible mode",
                  value: (
                    <Badge tone={systemState?.collectibleMode ? "info" : "default"}>
                      {systemState?.collectibleMode ? t("enabled") : t("disabled")}
                    </Badge>
                  ),
                },
                {
                  label: "Execution path",
                  value: canGovern
                    ? "Direct governance wallet available in this session"
                    : "Use timelock or multisig governance flow",
                },
              ]}
            />
            <ButtonGroup>
              <button
                type="button"
                className="primary"
                onClick={() => void runCollectibleToggle(true)}
                disabled={!canGovern || Boolean(systemState?.collectibleMode)}
              >
                {t("enableCollectible")}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void runCollectibleToggle(false)}
                disabled={!canGovern || !systemState?.collectibleMode}
              >
                {t("disableCollectible")}
              </button>
            </ButtonGroup>
            <ButtonGroup compact>
              <button
                type="button"
                className="ghost"
                onClick={() => prepareGovernancePacket(true)}
              >
                Prepare enable packet
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => prepareGovernancePacket(false)}
              >
                Prepare disable packet
              </button>
              {runtimeConfig.governancePortalUrl ? (
                <a
                  href={runtimeConfig.governancePortalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="button-link ghost"
                >
                  Open governance portal
                </a>
              ) : null}
            </ButtonGroup>
            {!canGovern ? (
              <p>
                No direct governance wallet is connected, so collectible mode changes are intentionally guided through
                a prepared governance packet in this cockpit.
              </p>
            ) : null}
            {governancePacket ? (
              <div className="governance-packet-panel">
                <InfoList
                  entries={[
                    {
                      label: "Packet mode",
                      value:
                        governancePacket.mode === "timelock"
                          ? "TimelockController schedule + execute"
                          : "Direct calldata for multisig submission",
                    },
                    { label: "Prepared action", value: governancePacket.actionLabel },
                    { label: "Prepared at", value: governancePacket.createdAt },
                    {
                      label: "Selected event",
                      value: governancePacket.eventName ?? governancePacket.ticketEventId ?? "-",
                    },
                    {
                      label: "Delay",
                      value: governancePacket.timelock
                        ? formatGovernanceDelay(governancePacket.timelock.minDelaySeconds)
                        : "Managed by multisig policy",
                    },
                    {
                      label: "Timelock",
                      value: governancePacket.timelock?.address ?? "Not configured",
                    },
                    {
                      label: "Operation ID",
                      value: governancePacket.timelock?.operationId ?? "Not applicable",
                    },
                  ]}
                />
                <ul className="plain-list">
                  {governancePacket.instructions.map((instruction, index) => (
                    <li key={instruction.key}>
                      <strong>
                        {index + 1}. {instruction.title}
                      </strong>
                      <div>{instruction.summary}</div>
                      <div>Target: {instruction.call.target}</div>
                      <div>Function: {instruction.call.signature}</div>
                    </li>
                  ))}
                </ul>
                <ButtonGroup compact>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void copyGovernanceText("Governance packet JSON", governancePacketJson)}
                  >
                    Copy packet JSON
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      void copyGovernanceText(
                        governancePacket.mode === "timelock"
                          ? "Schedule calldata"
                          : "Governance calldata",
                        governancePacket.instructions[0]?.call.calldata ?? governancePacket.directCall.calldata,
                      )
                    }
                  >
                    {governancePacket.mode === "timelock" ? "Copy schedule calldata" : "Copy calldata"}
                  </button>
                  {governancePacket.timelock ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void copyGovernanceText(
                          "Execute calldata",
                          governancePacket.timelock?.executeCall.calldata ?? "",
                        )
                      }
                    >
                      Copy execute calldata
                    </button>
                  ) : null}
                </ButtonGroup>
                <label>
                  Governance packet JSON
                  <textarea
                    className="governance-packet-preview"
                    rows={14}
                    readOnly
                    spellCheck={false}
                    value={governancePacketJson}
                  />
                </label>
              </div>
            ) : (
              <p>
                Prepare a governance packet to hand off collectible mode changes to the timelock or multisig that owns
                admin rights.
              </p>
            )}
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
              Recommended governance posture: keep long-term admin rights behind a multisig or timelock, while pauser
              and scanner-admin duties stay on operational wallets.
            </p>
          </Card>

          <Card>
            <h3>Recent admin activity</h3>
            <p>Latest indexed organizer actions for this event.</p>
            {!bffClient ? (
              <p>Connect the BFF to inspect recent role changes and pause actions.</p>
            ) : !indexedReadsAvailable ? (
              <p>Recent admin activity will appear here once the selected event is fully indexed by the BFF.</p>
            ) : opsSummaryQuery.isLoading ? (
              <p>Loading recent organizer activity...</p>
            ) : opsSummaryQuery.data?.recentActivity.length ? (
              <ul className="plain-list">
                {opsSummaryQuery.data.recentActivity.slice(0, 8).map((activity) => (
                  <li key={activity.id}>
                    <strong>{describeActivity(activity)}</strong>
                    <div>
                      Block {activity.blockNumber}
                      {" · "}
                      {activity.contractScope === "ticket" ? "TicketNFT" : "CheckInRegistry"}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No admin activity has been indexed yet for this event.</p>
            )}
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
          <li>Scanner grants and revocations require scanner-admin permissions.</li>
          <li>Collectible mode changes are governance actions and should flow through a multisig or timelock.</li>
          <li>Displayed contract addresses should be governed by a multisig or timelock in production.</li>
          <li>Every protected action is routed through transaction preview before signing.</li>
        </ul>
      </DetailAccordion>
    </div>
  );
}
