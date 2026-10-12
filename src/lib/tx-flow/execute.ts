import { getParsedError } from "./getParsedError";
import { createTxNotificationLifecycle } from "@/lib/notifications/txLifecycle";
import { getContractMetaUnsafe } from "./steps";
import type { TxFlowRuntimeContext, TxPreparedWriteStep, TxStepResult } from "./types";

export async function executePreparedWriteStep(
  step: TxPreparedWriteStep,
  ctx: TxFlowRuntimeContext,
  previousResults: TxStepResult[],
) {
  if (step.shouldSkip && await step.shouldSkip(ctx)) return "skip" as const;

  const lifecycle = createTxNotificationLifecycle(step.label);
  const meta = await lifecycle.onPending?.({ key: step.key, label: step.label, ctx });

  try {
    const contract = step.contractName
      ? getContractMetaUnsafe(step.contractName, ctx.chainId)
      : step.address && step.abi
        ? { address: step.address, abi: step.abi }
        : null;
    if (!contract?.address) throw new Error(`No address or deployment configured for ${step.label}.`);

    const args = typeof step.args === "function" ? await step.args(ctx, previousResults) : step.args;
    const simulation = await ctx.publicClient.simulateContract({
      account: ctx.account,
      address: contract.address,
      abi: contract.abi,
      functionName: step.functionName,
      args,
      ...(step.value !== undefined ? { value: step.value } : {}),
    } as never);

    await lifecycle.onAwaitingWalletConfirmation?.({ key: step.key, label: step.label, ctx, meta });
    const hash = await ctx.writeAsync(simulation.request as never) as `0x${string}`;
    await lifecycle.onTransactionSubmitted?.({ key: step.key, label: step.label, ctx, hash, meta });

    const receipt = await ctx.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: step.confirmations ?? 1,
    });
    if (receipt.status === "reverted") throw new Error("The transaction reverted onchain.");

    await lifecycle.onTransactionConfirmed?.({ key: step.key, label: step.label, ctx, hash, receipt, meta });
    return { hash, receipt };
  } catch (error) {
    await lifecycle.onTransactionFailed?.({
      key: step.key,
      label: step.label,
      ctx,
      error,
      message: getParsedError(error),
      meta,
    });
    throw error;
  }
}

export function getParsedTransactionError(error: unknown) {
  return getParsedError(error);
}
