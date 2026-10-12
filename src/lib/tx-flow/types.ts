import type { QueryClient } from "@tanstack/react-query";
import type { Address, TransactionReceipt } from "viem";
import type { usePublicClient, useWriteContract } from "wagmi";
import type { ContractAbi, GenericContractsDeclaration } from "@/contracts/types";
import type { RegistryContractName } from "@/contracts/shared";
import type { notify } from "@/lib/notifications/store";

export type TxIconState = "idle" | "pending" | "success" | "error";
export type TxNotifyApi = typeof notify;

export type TxFlowRuntimeContext = {
  account: Address;
  chainId: number;
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>;
  writeAsync: ReturnType<typeof useWriteContract>["writeContractAsync"];
  contracts: GenericContractsDeclaration;
  notify: TxNotifyApi;
  queryClient: QueryClient;
};

export type TxStepResult = {
  key: string;
  label: string;
  skipped?: boolean;
  hash?: `0x${string}`;
  receipt?: TransactionReceipt;
};

export type TxWriteLifecycleHooks = {
  onPending?: (args: { key: string; label: string; ctx: TxFlowRuntimeContext }) => unknown | Promise<unknown>;
  onAwaitingWalletConfirmation?: (args: { key: string; label: string; ctx: TxFlowRuntimeContext; meta: unknown }) => void | Promise<void>;
  onTransactionSubmitted?: (args: { key: string; label: string; ctx: TxFlowRuntimeContext; hash: `0x${string}`; meta: unknown }) => void | Promise<void>;
  onTransactionConfirmed?: (args: { key: string; label: string; ctx: TxFlowRuntimeContext; hash: `0x${string}`; receipt: TransactionReceipt; meta: unknown }) => void | Promise<void>;
  onTransactionFailed?: (args: { key: string; label: string; ctx: TxFlowRuntimeContext; error: unknown; message: string; meta: unknown }) => void | Promise<void>;
};

export type TxPreparedWriteStep = {
  type: "write";
  key: string;
  label: string;
  contractName?: RegistryContractName;
  address?: Address;
  abi?: ContractAbi;
  functionName: string;
  args?: readonly unknown[] | ((ctx: TxFlowRuntimeContext, previousResults: TxStepResult[]) => readonly unknown[] | Promise<readonly unknown[]>);
  value?: bigint;
  confirmations?: number;
  displayLabelBtn?: boolean;
  shouldSkip?: (ctx: TxFlowRuntimeContext) => boolean | Promise<boolean>;
};

export type TxCustomStep = {
  type: "custom";
  key: string;
  label: string;
  displayLabelBtn?: boolean;
  run: (ctx: TxFlowRuntimeContext) => Promise<"skip" | Omit<TxStepResult, "key" | "label">>;
};

export type TxStep = TxPreparedWriteStep | TxCustomStep;
export type TxStepBuilder = (ctx: { account: Address; chainId: number }) => TxStep[];

