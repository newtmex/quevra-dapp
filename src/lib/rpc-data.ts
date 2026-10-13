import {
  parseAbiItem,
  type Address,
  type PublicClient,
} from "viem";
import { getContractConfig } from "@/contracts/shared";
import { monadTestnet } from "@/lib/web3";

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
const vaultRegisteredEvent = parseAbiItem("event VaultRegistered(uint256 indexed tokenId, address indexed vault, address operator)");
const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
const defaultVeMonDeploymentBlock = BigInt(70_276_784);
const defaultVeValidatorDeploymentBlock = BigInt(70_276_906);
const logBlockSpan = BigInt(100_000);

function deploymentBlock(defaultBlock: bigint) {
  const configured = process.env.NEXT_PUBLIC_QUEVRA_DEPLOYMENT_BLOCK;
  return configured && /^\d+$/.test(configured) ? BigInt(configured) : defaultBlock;
}

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

async function walletTokenIds(publicClient: PublicClient, address: Address, wallet: Address, fromBlock: bigint, latestBlock: bigint) {
  const [received, sent] = await Promise.all([
    getLogsInChunks(publicClient, fromBlock, latestBlock, {
      address,
      event: transferEvent,
      args: { to: wallet },
    }),
    getLogsInChunks(publicClient, fromBlock, latestBlock, {
      address,
      event: transferEvent,
      args: { from: wallet },
    }),
  ]);
  const events = Array.from(new Map([...received, ...sent].map((log) => [`${log.transactionHash}-${log.logIndex}`, log])).values()).sort((a, b) => {
    const blockDelta = (a.blockNumber ?? BigInt(0)) - (b.blockNumber ?? BigInt(0));
    return blockDelta === BigInt(0) ? Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0) : Number(blockDelta);
  });
  const owned = new Set<string>();
  for (const log of events) {
    const tokenId = (log as typeof log & { args: { tokenId: bigint } }).args.tokenId.toString();
    const { from, to } = (log as typeof log & { args: { from: Address; to: Address } }).args;
    if (to.toLowerCase() === wallet.toLowerCase()) owned.add(tokenId);
    if (from.toLowerCase() === wallet.toLowerCase()) owned.delete(tokenId);
  }
  return Array.from(owned, BigInt);
}

export async function fetchHolderDirectory(publicClient: PublicClient, wallet: Address): Promise<HolderDirectory> {
  const veMon = getContractConfig(monadTestnet.id, "VeMON");
  const veValidator = getContractConfig(monadTestnet.id, "VeValidator");
  const controller = getContractConfig(monadTestnet.id, "StakingController");
  if (!veMon || !veValidator || !controller) throw new Error("Quevra contracts are not configured on Monad Testnet.");

  const latestBlock = await publicClient.getBlockNumber();
  const [positionIds, validatorIds, registrations] = await Promise.all([
    walletTokenIds(publicClient, veMon.address, wallet, deploymentBlock(defaultVeMonDeploymentBlock), latestBlock),
    walletTokenIds(publicClient, veValidator.address, wallet, deploymentBlock(defaultVeValidatorDeploymentBlock), latestBlock),
    getLogsInChunks(publicClient, deploymentBlock(defaultVeValidatorDeploymentBlock), latestBlock, {
      address: controller.address,
      event: vaultRegisteredEvent,
    }),
  ]);

  const positionCalls = positionIds.flatMap((tokenId) => [
    { address: veMon.address, abi: veMon.abi, functionName: "locked", args: [tokenId] },
    { address: veMon.address, abi: veMon.abi, functionName: "votingPowerOf", args: [tokenId] },
    { address: veMon.address, abi: veMon.abi, functionName: "ownerOf", args: [tokenId] },
  ]);
  const [positionResults, ownedValidatorOwners] = await Promise.all([
    positionCalls.length ? publicClient.multicall({ contracts: positionCalls as never, allowFailure: true }) as unknown as Promise<CallResult[]> : Promise.resolve([] as CallResult[]),
    validatorIds.length ? publicClient.multicall({
      contracts: validatorIds.map((tokenId) => ({ address: veValidator.address, abi: veValidator.abi, functionName: "ownerOf", args: [tokenId] })) as never,
      allowFailure: true,
    }) as unknown as Promise<CallResult[]> : Promise.resolve([] as CallResult[]),
  ]);
  const positions: HolderPosition[] = [];
  for (let index = 0; index < positionIds.length; index += 1) {
    const lock = positionResults[index * 3];
    const votingPower = positionResults[index * 3 + 1];
    const owner = positionResults[index * 3 + 2];
    if (lock?.status !== "success" || owner?.status !== "success") continue;
    const [amount, end, permanent] = lock.result as readonly [bigint, bigint, boolean, bigint];
    if ((owner.result as Address).toLowerCase() !== wallet.toLowerCase()) continue;
    positions.push({
      id: `ve-mon-${positionIds[index]}`,
      tokenId: positionIds[index].toString(),
      owner: wallet,
      kind: "VE_MON",
      amount: amount.toString(),
      unlockEpoch: permanent ? null : end.toString(),
      permanent,
      votingPower: votingPower?.status === "success" ? (votingPower.result as bigint).toString() : undefined,
    });
  }

  const currentOwnerById = new Map<string, Address>();
  validatorIds.forEach((tokenId, index) => {
    const owner = ownedValidatorOwners[index];
    if (owner?.status === "success") currentOwnerById.set(tokenId.toString(), owner.result as Address);
  });
  const ownedValidatorIdSet = new Set(validatorIds.map(String));
  const registrationByToken = new Map<string, { vault: Address; operator: Address }>();
  for (const log of registrations) {
    const args = (log as typeof log & { args: { tokenId: bigint; vault: Address; operator: Address } }).args;
    registrationByToken.set(args.tokenId.toString(), { vault: args.vault, operator: args.operator });
  }
  const validatorTokens = new Set([...ownedValidatorIdSet, ...registrationByToken.keys()]);
  const allValidatorCalls = Array.from(validatorTokens, (tokenId) => ({
    address: veValidator.address,
    abi: veValidator.abi,
    functionName: "validatorPosition",
    args: [BigInt(tokenId)],
  }));
  const allValidatorResults = allValidatorCalls.length
    ? await publicClient.multicall({ contracts: allValidatorCalls as never, allowFailure: true }) as unknown as CallResult[]
    : [] as CallResult[];
  const validators: HolderValidator[] = [];
  Array.from(validatorTokens).forEach((tokenId, index) => {
    const position = allValidatorResults[index];
    if (position?.status !== "success") return;
    const [validatorId, operator, vault, gauge, bribe] = position.result as readonly [bigint, Address, Address, Address, Address];
    if (vault === zeroAddress) return;
    const owner = currentOwnerById.get(tokenId) ?? operator;
    const owned = owner.toLowerCase() === wallet.toLowerCase();
    if (!owned && !registrationByToken.has(tokenId)) return;
    validators.push({
      id: `validator-${tokenId}`,
      tokenId,
      owner,
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
  const veMon = getContractConfig(monadTestnet.id, "VeMON");
  const veValidator = getContractConfig(monadTestnet.id, "VeValidator");
  if (!veMon || !veValidator) throw new Error("Quevra contracts are not configured on Monad Testnet.");
  const latestBlock = await publicClient.getBlockNumber();
  const [monLogs, validatorLogs] = await Promise.all([
    walletTokenActivity(publicClient, veMon.address, wallet, deploymentBlock(defaultVeMonDeploymentBlock), latestBlock),
    walletTokenActivity(publicClient, veValidator.address, wallet, deploymentBlock(defaultVeValidatorDeploymentBlock), latestBlock),
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
    const isValidator = address.toLowerCase() === getContractConfig(monadTestnet.id, "VeValidator")?.address.toLowerCase();
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
