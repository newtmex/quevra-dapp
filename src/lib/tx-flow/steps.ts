import { erc1155Abi, erc20Abi, erc721Abi, type Abi, type Address } from "viem";
import type { ContractFunctionWriteArgs, ContractFunctionWriteName } from "@/contracts/types";
import { getContractConfig, type RegistryContractName, type RegistryContract } from "@/contracts/shared";
import type { TxFlowRuntimeContext, TxPreparedWriteStep } from "./types";

type AbiFor<TContract extends RegistryContractName> = Extract<RegistryContract<TContract>["abi"], Abi>;

type ContractWriteStepConfig<
  TContract extends RegistryContractName,
  TFunctionName extends ContractFunctionWriteName<AbiFor<TContract>>,
> = {
  key: string;
  label: string;
  contractName: TContract;
  functionName: TFunctionName;
  args: ContractFunctionWriteArgs<AbiFor<TContract>, TFunctionName>;
  value?: bigint;
  confirmations?: number;
  displayLabelBtn?: boolean;
  shouldSkip?: (ctx: TxFlowRuntimeContext) => boolean | Promise<boolean>;
};

export function makeContractWriteStep<
  const TContract extends RegistryContractName,
  TFunctionName extends ContractFunctionWriteName<AbiFor<TContract>>,
>(cfg: ContractWriteStepConfig<TContract, TFunctionName>): TxPreparedWriteStep {
  return {
    type: "write",
    key: cfg.key,
    label: cfg.label,
    contractName: cfg.contractName,
    functionName: cfg.functionName,
    args: cfg.args as readonly unknown[],
    value: cfg.value,
    confirmations: cfg.confirmations,
    displayLabelBtn: cfg.displayLabelBtn,
    shouldSkip: cfg.shouldSkip,
  };
}

type AddressWriteStepConfig<TAbi extends Abi> = {
  key: string;
  label: string;
  abi: TAbi;
  address: Address;
  functionName: ContractFunctionWriteName<TAbi>;
  args?: readonly unknown[];
  value?: bigint;
  confirmations?: number;
  displayLabelBtn?: boolean;
  shouldSkip?: (ctx: TxFlowRuntimeContext) => boolean | Promise<boolean>;
};

export function makeAddressWriteStep<TAbi extends Abi>(cfg: AddressWriteStepConfig<TAbi>): TxPreparedWriteStep {
  return {
    type: "write",
    key: cfg.key,
    label: cfg.label,
    address: cfg.address,
    abi: cfg.abi,
    functionName: cfg.functionName,
    args: cfg.args,
    value: cfg.value,
    confirmations: cfg.confirmations,
    displayLabelBtn: cfg.displayLabelBtn,
    shouldSkip: cfg.shouldSkip,
  };
}

export function getContractMetaUnsafe<TContract extends RegistryContractName>(
  contractName: TContract,
  chainId: number,
) {
  const contract = getContractConfig(chainId, contractName);
  if (!contract?.address) throw new Error(`Missing deployment for ${contractName} on chainId=${chainId}`);
  return contract;
}

export type TokenApprovalRequirement =
  | { standard: "erc20"; token: Address; spender: Address; amount: bigint }
  | { standard: "erc721"; token: Address; operator: Address; scope: { kind: "token"; tokenId: bigint } | { kind: "all" } }
  | { standard: "erc1155"; token: Address; operator: Address };

export async function isTokenApprovalSatisfied(
  ctx: Pick<TxFlowRuntimeContext, "account" | "publicClient">,
  approval: TokenApprovalRequirement,
) {
  if (approval.standard === "erc20") {
    if (approval.amount <= BigInt(0)) return true;
    const allowance = await ctx.publicClient.readContract({
      address: approval.token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [ctx.account, approval.spender],
    });
    return allowance >= approval.amount;
  }

  if (approval.standard === "erc721" && approval.scope.kind === "token") {
    const approved = await ctx.publicClient.readContract({
      address: approval.token,
      abi: erc721Abi,
      functionName: "getApproved",
      args: [approval.scope.tokenId],
    });
    if (typeof approved === "string" && approved.toLowerCase() === approval.operator.toLowerCase()) return true;
  }

  return await ctx.publicClient.readContract({
    address: approval.token,
    abi: approval.standard === "erc721" ? erc721Abi : erc1155Abi,
    functionName: "isApprovedForAll",
    args: [ctx.account, approval.standard === "erc721" ? approval.operator : approval.operator],
  } as never) as boolean;
}

export function makeTokenApprovalStep(cfg: {
  key: string;
  label: string;
  approval: TokenApprovalRequirement;
  confirmations?: number;
}): TxPreparedWriteStep {
  const shared = {
    key: cfg.key,
    label: cfg.label,
    confirmations: cfg.confirmations,
    shouldSkip: (ctx: TxFlowRuntimeContext) => isTokenApprovalSatisfied(ctx, cfg.approval),
  };

  if (cfg.approval.standard === "erc20") {
    return makeAddressWriteStep({
      ...shared,
      address: cfg.approval.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [cfg.approval.spender, cfg.approval.amount],
    });
  }

  if (cfg.approval.standard === "erc721") {
    if (cfg.approval.scope.kind === "token") {
      return makeAddressWriteStep({
        ...shared,
        address: cfg.approval.token,
        abi: erc721Abi,
        functionName: "approve",
        args: [cfg.approval.operator, cfg.approval.scope.tokenId],
      });
    }
    return makeAddressWriteStep({
      ...shared,
      address: cfg.approval.token,
      abi: erc721Abi,
      functionName: "setApprovalForAll",
      args: [cfg.approval.operator, true],
    });
  }

  return makeAddressWriteStep({
    ...shared,
    address: cfg.approval.token,
    abi: erc1155Abi,
    functionName: "setApprovalForAll",
    args: [cfg.approval.operator, true],
  });
}

