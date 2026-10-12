"use client";

import { forwardRef, useImperativeHandle, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import type { Address } from "viem";
import { monadTestnet } from "@/lib/web3";
import { WalletButton } from "@/app/@user/components/WalletButton";
import { useTxFlowRuntime } from "./runtime";
import { executePreparedWriteStep, getParsedTransactionError } from "./execute";
import type { TxIconState, TxStep, TxStepBuilder, TxStepResult } from "./types";

type Props = Omit<ComponentPropsWithoutRef<"button">, "children" | "onClick"> & {
  steps: TxStep[] | TxStepBuilder;
  children: ReactNode;
  icon?: ReactNode;
  renderStatusIcon?: (state: TxIconState) => ReactNode;
  onComplete?: (results: TxStepResult[]) => void;
  onError?: (message: string, resultsSoFar: TxStepResult[]) => void;
  onClick?: never;
};

export type TransactionButtonHandle = { run: () => Promise<void> };

const TransactionButton = forwardRef<TransactionButtonHandle, Props>(function TransactionButton(
  { steps, children, className, disabled, onComplete, onError, icon, renderStatusIcon, type = "button", ...props },
  ref,
) {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const { contracts, notify } = useTxFlowRuntime();
  const [running, setRunning] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [iconState, setIconState] = useState<TxIconState>("idle");

  const run = async () => {
    if (!address || !chain || !publicClient || chain.id !== monadTestnet.id || running || disabled) return;
    const results: TxStepResult[] = [];
    let activeStep: TxStep | undefined;
    setRunning(true);
    setIconState("pending");

    try {
      const ctx = {
        account: address as Address,
        chainId: chain.id,
        publicClient,
        writeAsync: writeContractAsync,
        contracts,
        notify,
        queryClient,
      };
      const builtSteps = typeof steps === "function" ? steps({ account: ctx.account, chainId: ctx.chainId }) : steps;

      for (const step of builtSteps) {
        activeStep = step;
        if (step.displayLabelBtn) setActiveLabel(step.label);
        const result = step.type === "write"
          ? await executePreparedWriteStep(step, ctx, results)
          : await step.run(ctx);
        if (result === "skip") {
          results.push({ key: step.key, label: step.label, skipped: true });
        } else {
          results.push({ key: step.key, label: step.label, hash: result.hash, receipt: result.receipt, skipped: false });
        }
      }

      setIconState("success");
      onComplete?.(results);
    } catch (error) {
      const message = getParsedTransactionError(error);
      setIconState("error");
      if (!activeStep || activeStep.type === "custom") notify.error(activeLabel ?? "Transaction failed", message);
      onError?.(message, results);
    } finally {
      setRunning(false);
      setActiveLabel(null);
    }
  };

  useImperativeHandle(ref, () => ({ run }));

  const statusIcon = renderStatusIcon
    ? renderStatusIcon(iconState)
    : iconState === "pending"
      ? <LoaderCircle size={15} className="animate-spin" />
      : iconState === "success"
        ? <Check size={15} />
        : iconState === "error"
          ? <CircleAlert size={15} />
          : null;

  return (
    <WalletButton>
      <button
        {...props}
        className={className ?? "qv:mt-0.5 qv:inline-flex qv:h-[42px] qv:items-center qv:justify-center qv:gap-2 qv:rounded-lg qv:bg-gradient-to-r qv:from-[#8c76ff] qv:to-[#7058e9] qv:px-4 qv:text-[11px] qv:font-semibold qv:text-white qv:shadow-[0_8px_20px_rgba(112,88,233,0.2)] qv:transition qv:hover:brightness-110 qv:disabled:cursor-not-allowed qv:disabled:opacity-[0.46] qv:disabled:shadow-none"}
        type={type}
        onClick={type === "submit" ? undefined : () => void run()}
        disabled={Boolean(disabled || running || chain?.id !== monadTestnet.id)}
        aria-busy={running}
      >
        {icon}
        <span>{running && activeLabel ? activeLabel : children}</span>
        {statusIcon}
      </button>
    </WalletButton>
  );
});

export default TransactionButton;
