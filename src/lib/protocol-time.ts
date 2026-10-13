import { decodeFunctionResult, encodeFunctionData, parseAbi, type PublicClient } from "viem";

/** Quevra groups Monad staking epochs into cycles (ProtocolTimeLibrary on testnet/solonet). */
export const EPOCHS_PER_CYCLE = BigInt(5);

const stakingPrecompile = "0x0000000000000000000000000000000000001000" as const;
const stakingPrecompileAbi = parseAbi([
  "function getEpoch() returns (uint64 epoch, bool inEpochDelayPeriod)",
]);

export async function readCurrentEpoch(publicClient: PublicClient): Promise<bigint> {
  const result = await publicClient.call({
    to: stakingPrecompile,
    data: encodeFunctionData({ abi: stakingPrecompileAbi, functionName: "getEpoch" }),
  });
  if (!result.data) throw new Error("Monad did not return the current staking epoch.");
  const [epoch] = decodeFunctionResult({
    abi: stakingPrecompileAbi,
    functionName: "getEpoch",
    data: result.data,
  }) as readonly [bigint, boolean];
  return epoch;
}

export function epochToCycle(epoch: bigint): bigint {
  return epoch / EPOCHS_PER_CYCLE;
}

export async function readCurrentCycle(publicClient: PublicClient): Promise<{ epoch: bigint; cycle: bigint }> {
  const epoch = await readCurrentEpoch(publicClient);
  return { epoch, cycle: epochToCycle(epoch) };
}

/** Estimated gauge weight from stake-linked voting: VP × allocated / principal. */
export function estimateGaugeWeight(votingPower: bigint, allocated: bigint, principal: bigint): bigint {
  if (principal === BigInt(0) || allocated === BigInt(0) || votingPower === BigInt(0)) return BigInt(0);
  return (votingPower * allocated) / principal;
}
