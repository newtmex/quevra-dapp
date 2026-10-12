import type { TxFlowRuntimeContext, TxWriteLifecycleHooks } from "@/lib/tx-flow/types";
import { notify } from "./store";

function notificationId(meta: unknown) {
  return typeof meta === "string" && meta.length > 0 ? meta : null;
}

export function createTxNotificationLifecycle(label: string): TxWriteLifecycleHooks {
  return {
    onPending: ({ ctx }: { ctx: TxFlowRuntimeContext }) =>
      notify.pendingTx(label, "Preparing transaction…", ctx.chainId),
    onAwaitingWalletConfirmation: ({ meta }) => {
      const id = notificationId(meta);
      if (id) notify.update(id, { message: "Confirm this transaction in your wallet." });
    },
    onTransactionSubmitted: ({ meta, hash }) => {
      const id = notificationId(meta);
      if (id) notify.txSent(id, hash);
    },
    onTransactionConfirmed: ({ meta }) => {
      const id = notificationId(meta);
      if (id) notify.txConfirmed(id);
    },
    onTransactionFailed: ({ meta, message }) => {
      const id = notificationId(meta);
      if (id) notify.txFailed(id, message);
    },
  };
}
