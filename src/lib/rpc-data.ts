import {
  parseAbiItem,
  type Address,
  type PublicClient,
} from "viem";
import { getContractConfig } from "@/contracts/shared";
import { protocolChain } from "@/lib/web3";

export type HolderPosition = {
  id: string;
  tokenId: string;
  owner: Address;
  kind: "VE_MON";
  amount: string;
  unlockEpoch: string | null;
  permanent: boolean;
  votingPower?: string;
};

export type HolderValidator = {
  id: string;
  tokenId: string;
  owner: Address;
  operator: Address;
  validatorId: string | null;
  vault: Address;
  gauge: Address;
  bribe: Address;
};

export type HolderDirectory = { positions: HolderPosition[]; validators: HolderValidator[] };

export type WalletActivity = {
  id: string;
  tokenId: string;
  label: string;
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: number;
};
type CallResult = { status: "success"; result: unknown } | { status: "failure"; error: Error };

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
const logBlockSpan = BigInt(100);
const multicallBatchSize = 200;

async function getLogsInChunks<T extends { fromBlock: bigint; toBlock: bigint }>(
  publicClient: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
  filter: Omit<T, "fromBlock" | "toBlock">,
) {
  if (toBlock < fromBlock) return [];
  const pages: Array<Promise<Awaited<ReturnType<PublicClient["getLogs"]>>>> = [];
  for (let start = fromBlock; start <= toBlock; start += logBlockSpan) {
    pages.push(publicClient.getLogs({
      ...filter,
      fromBlock: start,
      toBlock: start + logBlockSpan - BigInt(1) > toBlock ? toBlock : start + logBlockSpan - BigInt(1),
    } as never));
  }
  return (await Promise.all(pages)).flat();
}

async function multicallInBatches(publicClient: PublicClient, contracts: Array<Record<string, unknown>>) {
  const batches: CallResult[][] = [];
  for (let start = 0; start < contracts.length; start += multicallBatchSize) {
    const results = await publicClient.multicall({
      contracts: contracts.slice(start, start + multicallBatchSize) as never,
      allowFailure: true,
    }) as unknown as CallResult[];
    batches.push(results);
  }
  return batches.flat();
}

export async function fetchHolderDirectory(publicClient: PublicClient, wallet: Address): Promise<HolderDirectory> {
  const veMon = getContractConfig(protocolChain.id, "VeMON");
  const veValidator = getContractConfig(protocolChain.id, "VeValidator");
  if (!veMon || !veValidator) throw new Error(`Quevra contracts are not configured on ${protocolChain.name}.`);

  const [veMonNextId, veValidatorNextId] = await Promise.all([
    publicClient.readContract({ address: veMon.address, abi: veMon.abi, functionName: "nextId" }) as Promise<bigint>,
    publicClient.readContract({ address: veValidator.address, abi: veValidator.abi, functionName: "nextId" }) as Promise<bigint>,
  ]);
  const positionIds = Array.from({ length: Number(veMonNextId - BigInt(1)) }, (_, index) => BigInt(index + 1));
  const validatorIds = Array.from({ length: Number(veValidatorNextId - BigInt(1)) }, (_, index) => BigInt(index + 1));
  const [positionOwners, validatorData] = await Promise.all([
    multicallInBatches(publicClient, positionIds.map((tokenId) => ({
      address: veMon.address, abi: veMon.abi, functionName: "ownerOf", args: [tokenId],
    }))),
    multicallInBatches(publicClient, validatorIds.flatMap((tokenId) => [
      { address: veValidator.address, abi: veValidator.abi, functionName: "ownerOf", args: [tokenId] },
      { address: veValidator.address, abi: veValidator.abi, functionName: "validatorPosition", args: [tokenId] },
    ])),
  ]);
  const ownedPositionIds = positionIds.filter((_, index) => {
    const owner = positionOwners[index];
    return owner?.status === "success" && (owner.result as Address).toLowerCase() === wallet.toLowerCase();
  });
  const positionCalls = ownedPositionIds.flatMap((tokenId) => [
    { address: veMon.address, abi: veMon.abi, functionName: "locked", args: [tokenId] },
    { address: veMon.address, abi: veMon.abi, functionName: "votingPowerOf", args: [tokenId] },
  ]);
  const positionResults = await multicallInBatches(publicClient, positionCalls);
  const positions: HolderPosition[] = [];
  for (let index = 0; index < ownedPositionIds.length; index += 1) {
    const lock = positionResults[index * 2];
    const votingPower = positionResults[index * 2 + 1];
    if (lock?.status !== "success") continue;
    const [amount, end, permanent] = lock.result as readonly [bigint, bigint, boolean, bigint];
    positions.push({
      id: `ve-mon-${ownedPositionIds[index]}`,
      tokenId: ownedPositionIds[index].toString(),
      owner: wallet,
      kind: "VE_MON",
      amount: amount.toString(),
      unlockEpoch: permanent ? null : end.toString(),
      permanent,
      votingPower: votingPower?.status === "success" ? (votingPower.result as bigint).toString() : undefined,
    });
  }

  const validators: HolderValidator[] = [];
  validatorIds.forEach((tokenId, index) => {
    const owner = validatorData[index * 2];
    const position = validatorData[index * 2 + 1];
    if (owner?.status !== "success" || position?.status !== "success") return;
    const [validatorId, operator, vault, gauge, bribe] = position.result as readonly [bigint, Address, Address, Address, Address];
    if (vault === zeroAddress) return;
    const currentOwner = owner.result as Address;
    validators.push({
      id: `validator-${tokenId}`,
      tokenId: tokenId.toString(),
      owner: currentOwner,
      operator,
      validatorId: validatorId > BigInt(0) ? validatorId.toString() : null,
      vault,
      gauge,
      bribe,
    });
  });
  return { positions, validators };
}

export async function fetchWalletActivity(publicClient: PublicClient, wallet: Address): Promise<WalletActivity[]> {
  const veMon = getContractConfig(protocolChain.id, "VeMON");
  const veValidator = getContractConfig(protocolChain.id, "VeValidator");
  if (!veMon || !veValidator) throw new Error(`Quevra contracts are not configured on ${protocolChain.name}.`);
  const latestBlock = await publicClient.getBlockNumber();
  const fromBlock = latestBlock >= logBlockSpan ? latestBlock - logBlockSpan + BigInt(1) : BigInt(0);
  const [monLogs, validatorLogs] = await Promise.all([
    walletTokenActivity(publicClient, veMon.address, wallet, fromBlock, latestBlock),
    walletTokenActivity(publicClient, veValidator.address, wallet, fromBlock, latestBlock),
  ]);
  return [...monLogs, ...validatorLogs].sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)) || b.logIndex - a.logIndex).slice(0, 25);
}

async function walletTokenActivity(publicClient: PublicClient, address: Address, wallet: Address, fromBlock: bigint, latest: bigint): Promise<WalletActivity[]> {
  const logs = await Promise.all([
    getLogsInChunks(publicClient, fromBlock, latest, { address, event: transferEvent, args: { from: wallet } }),
    getLogsInChunks(publicClient, fromBlock, latest, { address, event: transferEvent, args: { to: wallet } }),
  ]);
  return Array.from(new Map(logs.flat().map((log) => [`${log.transactionHash}-${log.logIndex}`, log])).values()).map((log) => {
    const args = (log as typeof log & { args: { from: Address; to: Address; tokenId: bigint } }).args;
    const isValidator = address.toLowerCase() === getContractConfig(protocolChain.id, "VeValidator")?.address.toLowerCase();
    const label = args.from === zeroAddress ? (isValidator ? "Validator identity created" : "veMON lock created")
      : args.to === zeroAddress ? "veMON position withdrawn"
        : "veNFT transferred";
    return {
      id: `${log.transactionHash}-${log.logIndex}`,
      tokenId: args.tokenId.toString(),
      label,
      blockNumber: log.blockNumber?.toString() ?? "0",
      transactionHash: log.transactionHash!,
      logIndex: Number(log.logIndex ?? 0),
    };
  });
}
