import { decodeFunctionResult, encodeFunctionData, formatUnits, parseAbi, type Address, type PublicClient } from "viem";
import { erc20Abi } from "viem";
import { getContractConfig } from "@/contracts/shared";
import { protocolChain } from "@/lib/web3";
import type { HolderValidator } from "@/lib/indexer-data";
export type { HolderPosition, HolderValidator, HolderDirectory } from "@/lib/indexer-data";
export { fetchHolderDirectory } from "@/lib/indexer-data";
export type IncentiveReward = {
  bribe: Address;
  validator: HolderValidator;
  token: Address;
  symbol: string;
  decimals: number;
  amount: bigint;
};

const rewardAbi = parseAbi([
  "function rewardsListLength() view returns (uint256)",
  "function rewardTokens(uint256 index) view returns (address)",
  "function earned(address token, uint256 tokenId) returns (uint256)",
  "function getReward(uint256 tokenId, address[] tokens)",
]);
const stakingPrecompileAbi = parseAbi([
  "function getEpoch() returns (uint64 epoch, bool inEpochDelayPeriod)",
  "function getDelegator(uint64 validatorId, address delegator) returns (uint256 stake, uint256 accRewardPerToken, uint256 unclaimedRewards, uint256 deltaStake, uint256 nextDeltaStake, uint64 deltaEpoch, uint64 nextDeltaEpoch)",
]);
const agentAbi = parseAbi([
  "function usedValidator(uint64 validatorId) view returns (bool)",
]);

async function callEarned(publicClient: PublicClient, bribe: Address, token: Address, tokenId: bigint) {
  const data = encodeFunctionData({ abi: rewardAbi, functionName: "earned", args: [token, tokenId] });
  const result = await publicClient.call({ to: bribe, data });
  if (!result.data) throw new Error(`Could not read incentive rewards from ${bribe}.`);
  return decodeFunctionResult({ abi: rewardAbi, functionName: "earned", data: result.data }) as bigint;
}

export async function readIncentiveRewards(
  publicClient: PublicClient,
  validators: HolderValidator[],
  tokenId: bigint,
): Promise<IncentiveReward[]> {
  const bribes = Array.from(new Map(validators
    .filter((validator) => validator.bribe && validator.bribe !== "0x0000000000000000000000000000000000000000")
    .map((validator) => [validator.bribe!.toLowerCase(), validator])).values());

  const result = await Promise.all(bribes.map(async (validator) => {
    const bribe = validator.bribe!;
    const count = await publicClient.readContract({ address: bribe, abi: rewardAbi, functionName: "rewardsListLength" });
    const tokenAddresses = await Promise.all(Array.from({ length: Number(count) }, (_, index) =>
      publicClient.readContract({ address: bribe, abi: rewardAbi, functionName: "rewardTokens", args: [BigInt(index)] }) as Promise<Address>));
    return await Promise.all(tokenAddresses.map(async (token) => {
      const [amount, symbol, decimals] = await Promise.all([
        callEarned(publicClient, bribe, token, tokenId),
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }).catch(() => `${token.slice(0, 6)}…${token.slice(-4)}`),
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
      ]);
      return { bribe, validator, token, symbol, decimals: Number(decimals), amount } satisfies IncentiveReward;
    }));
  }));
  return result.flat();
}

export async function readNativeRewards(
  publicClient: PublicClient,
  tokenId: bigint,
  validators: HolderValidator[],
) {
  if (!validators.some((validator) => validator.vault)) {
    return { amount: BigInt(0), vaults: [] as Address[], claimCandidates: 0 };
  }
  const controller = getContractConfig(protocolChain.id, "StakingController");
  const vault = getContractConfig(protocolChain.id, "StakingVault");
  if (!controller || !vault) throw new Error(`Staking contracts are not configured on ${protocolChain.name}.`);

  const agent = await publicClient.readContract({
    address: controller.address,
    abi: controller.abi,
    functionName: "agentByToken",
    args: [tokenId],
  }) as Address;

  const relevantValidators = validators.filter((validator) => validator.vault);
  const calls = relevantValidators.flatMap(({ vault: vaultAddress }) => [
    { address: controller.address, abi: controller.abi, functionName: "intentOf", args: [tokenId, vaultAddress!] },
    { address: controller.address, abi: controller.abi, functionName: "allocationOf", args: [tokenId, vaultAddress!] },
    { address: controller.address, abi: controller.abi, functionName: "pendingOf", args: [tokenId, vaultAddress!] },
    { address: vaultAddress!, abi: vault.abi, functionName: "validatorId", args: [] },
    { address: vaultAddress!, abi: vault.abi, functionName: "balanceOf", args: [tokenId] },
    { address: vaultAddress!, abi: vault.abi, functionName: "pendingWithdrawal", args: [tokenId] },
    { address: vaultAddress!, abi: vault.abi, functionName: "earned", args: [tokenId] },
    { address: vaultAddress!, abi: vault.abi, functionName: "rewards", args: [tokenId] },
    { address: vaultAddress!, abi: vault.abi, functionName: "totalBalance", args: [] },
    { address: vaultAddress!, abi: vault.abi, functionName: "accountedUnclaimedRewards", args: [] },
    { address: vaultAddress!, abi: vault.abi, functionName: "rewardPerShareStored", args: [] },
    { address: vaultAddress!, abi: vault.abi, functionName: "userRewardPerSharePaid", args: [tokenId] },
  ]);
  const results = await publicClient.multicall({ contracts: calls as never, allowFailure: true }) as unknown as Array<
    { status: "success"; result: unknown } | { status: "failure"; error: Error }
  >;
  const read = (index: number) => results[index]?.status === "success" ? results[index].result : undefined;
  const precision = BigInt("1000000000000000000000000000");
  let total = BigInt(0);
  const claimVaults: Address[] = [];
  let claimCandidates = 0;

  await Promise.all(relevantValidators.map(async (validator, index) => {
    const base = index * 12;
    const intent = (read(base) as bigint | undefined) ?? BigInt(0);
    const allocation = (read(base + 1) as bigint | undefined) ?? BigInt(0);
    const pending = (read(base + 2) as bigint | undefined) ?? BigInt(0);
    const validatorId = (read(base + 3) as bigint | undefined) ?? BigInt(0);
    const vaultBalance = (read(base + 4) as bigint | undefined) ?? BigInt(0);
    const vaultPending = (read(base + 5) as bigint | undefined) ?? BigInt(0);
    const earned = (read(base + 6) as bigint | undefined) ?? BigInt(0);
    const storedRewards = (read(base + 7) as bigint | undefined) ?? BigInt(0);
    const totalBalance = (read(base + 8) as bigint | undefined) ?? BigInt(0);
    const accounted = (read(base + 9) as bigint | undefined) ?? BigInt(0);
    const rewardPerShare = (read(base + 10) as bigint | undefined) ?? BigInt(0);
    const paid = (read(base + 11) as bigint | undefined) ?? BigInt(0);
    let agentUsed = false;
    let agentReward = BigInt(0);
    let unclaimedOnVault = BigInt(0);

    if (validatorId > BigInt(0)) {
      if (agent !== "0x0000000000000000000000000000000000000000") {
        agentUsed = await publicClient.readContract({
          address: agent,
          abi: agentAbi,
          functionName: "usedValidator",
          args: [validatorId],
        }).catch(() => false);
      }
      const [vaultData, agentData] = await Promise.all([
        publicClient.call({
          to: "0x0000000000000000000000000000000000001000",
          data: encodeFunctionData({ abi: stakingPrecompileAbi, functionName: "getDelegator", args: [validatorId, validator.vault!] }),
        }).catch(() => null),
        agentUsed ? publicClient.call({
          to: "0x0000000000000000000000000000000000001000",
          data: encodeFunctionData({ abi: stakingPrecompileAbi, functionName: "getDelegator", args: [validatorId, agent] }),
        }).catch(() => null) : Promise.resolve(null),
      ]);
      try {
        if (vaultData?.data) {
          const decoded = decodeFunctionResult({ abi: stakingPrecompileAbi, functionName: "getDelegator", data: vaultData.data }) as readonly bigint[];
          unclaimedOnVault = decoded[2] ?? BigInt(0);
        }
      } catch { /* An inactive validator may not expose precompile state. */ }
      try {
        if (agentData?.data) {
          const decoded = decodeFunctionResult({ abi: stakingPrecompileAbi, functionName: "getDelegator", data: agentData.data }) as readonly bigint[];
          agentReward = decoded[2] ?? BigInt(0);
        }
      } catch { /* An inactive validator may not expose precompile state. */ }
    }

    const newlyAccrued = unclaimedOnVault > accounted ? unclaimedOnVault - accounted : BigInt(0);
    const extraPerShare = totalBalance > BigInt(0) ? newlyAccrued * precision / totalBalance : BigInt(0);
    const newlyAccruedShare = vaultBalance * extraPerShare / precision;
    total += earned + newlyAccruedShare;
    total += agentReward;

    if (intent > BigInt(0) || allocation > BigInt(0) || pending > BigInt(0) || vaultBalance > BigInt(0)
      || vaultPending > BigInt(0) || earned > BigInt(0) || storedRewards > BigInt(0) || agentUsed || agentReward > BigInt(0)) {
      claimVaults.push(validator.vault!);
      claimCandidates += 1;
    }
  }));

  return { amount: total, vaults: claimVaults, claimCandidates };
}

export function formatTokenAmount(amount: bigint, decimals: number) {
  return Number(formatUnits(amount, decimals)).toLocaleString(undefined, { maximumFractionDigits: 5 });
}

export function getIncentiveTokenList(rewards: IncentiveReward[]) {
  const byBribe = new Map<string, { bribe: Address; tokens: Address[]; label: string }>();
  for (const reward of rewards) {
    const key = reward.bribe.toLowerCase();
    const item = byBribe.get(key) ?? { bribe: reward.bribe, tokens: [], label: reward.validator.validatorId ? `Validator #${reward.validator.validatorId}` : `Validator identity #${reward.validator.tokenId}` };
    if (!item.tokens.some((token) => token.toLowerCase() === reward.token.toLowerCase())) item.tokens.push(reward.token);
    byBribe.set(key, item);
  }
  return Array.from(byBribe.values());
}
