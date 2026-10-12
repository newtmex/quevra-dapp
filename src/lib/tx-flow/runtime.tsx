"use client";

import { createContext, useContext, type ReactNode } from "react";
import { contractsByChainId } from "@/contracts/registry";
import { notify } from "@/lib/notifications/store";
import type { TxNotifyApi } from "./types";

type RuntimeValue = {
  contracts: typeof contractsByChainId;
  notify: TxNotifyApi;
};

const TxFlowRuntimeContext = createContext<RuntimeValue | null>(null);

export function TxFlowRuntimeProvider({ children }: { children: ReactNode }) {
  return (
    <TxFlowRuntimeContext.Provider value={{ contracts: contractsByChainId, notify }}>
      {children}
    </TxFlowRuntimeContext.Provider>
  );
}

export function useTxFlowRuntime() {
  const runtime = useContext(TxFlowRuntimeContext);
  if (!runtime) throw new Error("Transaction runtime is missing. Wrap the app in TxFlowRuntimeProvider.");
  return runtime;
}
