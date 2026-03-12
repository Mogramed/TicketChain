import { useCallback, useState } from "react";

import { loadActivityHistory, saveActivityHistory } from "../../lib/activityStorage";
import { mapEthersError } from "../../lib/errors";
import type { ChainTicketClient, PreflightAction, PreflightResult, PendingPreview, TxResponseLike, TxState } from "../../types/chainticket";
import type { PreparePreviewPayload } from "./types";

interface TransactionStateArgs {
  walletClient: ChainTicketClient | null;
  clearMessages: () => void;
  setErrorMessage: (message: string) => void;
  setStatusMessage: (message: string) => void;
  refreshQueries: () => Promise<void>;
}

interface TransactionStateResult {
  txState: TxState;
  activity: TxState[];
  pendingPreview: PendingPreview | null;
  isRefreshing: boolean;
  refreshDashboard: () => Promise<void>;
  preparePreview: (payload: PreparePreviewPayload) => Promise<void>;
  confirmPendingPreview: () => Promise<void>;
  setPendingPreview: (preview: PendingPreview | null) => void;
}

function pushActivity(history: TxState[], entry: TxState): TxState[] {
  const next = [entry, ...history].slice(0, 60);
  saveActivityHistory(next);
  return next;
}

export function useTransactionState({
  walletClient,
  clearMessages,
  setErrorMessage,
  setStatusMessage,
  refreshQueries,
}: TransactionStateArgs): TransactionStateResult {
  const [txState, setTxState] = useState<TxState>({
    status: "idle",
    timestamp: Date.now(),
  });
  const [activity, setActivity] = useState<TxState[]>(() =>
    typeof window === "undefined" ? [] : loadActivityHistory(),
  );
  const [pendingPreview, setPendingPreviewState] = useState<PendingPreview | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshDashboard = useCallback(async () => {
    setIsRefreshing(true);
    clearMessages();

    try {
      await refreshQueries();
    } catch (error) {
      setErrorMessage(mapEthersError(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [clearMessages, refreshQueries, setErrorMessage]);

  const executeTx = useCallback(
    async (
      label: string,
      run: (client: ChainTicketClient) => Promise<TxResponseLike>,
      action?: PreflightAction,
    ) => {
      if (!walletClient) {
        setErrorMessage("Connect wallet first.");
        return;
      }

      clearMessages();

      if (action) {
        try {
          const latestPreflight = await walletClient.preflightAction(action);
          if (!latestPreflight.ok) {
            setErrorMessage(latestPreflight.blockers.join(" | "));
            return;
          }
        } catch (error) {
          setErrorMessage(mapEthersError(error));
          return;
        }
      }

      const pendingState: TxState = {
        status: "pending",
        label,
        timestamp: Date.now(),
      };
      setTxState(pendingState);

      try {
        const tx = await run(walletClient);
        setTxState({ ...pendingState, hash: tx.hash });
        await tx.wait();

        const successState: TxState = {
          status: "success",
          label,
          hash: tx.hash,
          timestamp: Date.now(),
        };

        setTxState(successState);
        setActivity((prev) => pushActivity(prev, successState));
        setStatusMessage(`${label} confirmed.`);
        await refreshDashboard();
      } catch (error) {
        const reason = mapEthersError(error);
        const failedState: TxState = {
          status: "error",
          label,
          errorReason: reason,
          timestamp: Date.now(),
        };

        setTxState(failedState);
        setActivity((prev) => pushActivity(prev, failedState));
        setErrorMessage(reason);
      }
    },
    [clearMessages, refreshDashboard, setErrorMessage, setStatusMessage, walletClient],
  );

  const preparePreview = useCallback(
    async (payload: PreparePreviewPayload) => {
      if (!walletClient) {
        setErrorMessage("Connect wallet first.");
        return;
      }

      clearMessages();

      let preflight: PreflightResult | null = null;
      if (payload.action) {
        try {
          preflight = await walletClient.preflightAction(payload.action);
        } catch (error) {
          setErrorMessage(mapEthersError(error));
          return;
        }
      }

      if (preflight && !preflight.ok) {
        setErrorMessage(preflight.blockers.join(" | "));
      }

      setPendingPreviewState({
        ...payload,
        preflight,
      });
    },
    [clearMessages, setErrorMessage, walletClient],
  );

  const confirmPendingPreview = useCallback(async () => {
    if (!pendingPreview) {
      return;
    }

    setPendingPreviewState(null);
    await executeTx(pendingPreview.label, pendingPreview.run, pendingPreview.action);
  }, [executeTx, pendingPreview]);

  const setPendingPreview = useCallback((preview: PendingPreview | null) => {
    setPendingPreviewState(preview);
  }, []);

  return {
    txState,
    activity,
    pendingPreview,
    isRefreshing,
    refreshDashboard,
    preparePreview,
    confirmPendingPreview,
    setPendingPreview,
  };
}
