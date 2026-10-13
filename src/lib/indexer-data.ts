import type { Address } from "viem";

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

type IndexedPosition = Omit<HolderPosition, "owner" | "amount" | "unlockEpoch"> & {
  owner: Address | null;
  amount: string;
  unlockEpoch: string | null;
};

type IndexedActivity = {
  id: string;
  tokenId: string | null;
  kind: string;
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: number;
};

type IndexedValidator = {
  id?: string;
  tokenId?: string;
  owner?: Address;
  operator?: Address | null;
  validatorId?: string | null;
  vault?: Address | null;
  gauge?: Address | null;
  bribe?: Address | null;
};

type IndexerResponse = {
  activities: IndexedActivity[];
  positions: IndexedPosition[];
  validators: IndexedValidator[];
  networkValidators: IndexedValidator[];
  error?: string;
};

async function fetchIndexerData(wallet: Address) {
  const response = await fetch(`/api/indexer?wallet=${encodeURIComponent(wallet)}`, {
    cache: "no-store",
  });
  const payload = await response.json() as IndexerResponse;
  if (!response.ok) throw new Error(payload.error ?? "Could not load data from the Quevra index.");
  return payload;
}

export async function fetchHolderDirectory(wallet: Address): Promise<HolderDirectory> {
  const payload = await fetchIndexerData(wallet);
  if (!Array.isArray(payload.positions) || !Array.isArray(payload.networkValidators)) {
    throw new Error("The Quevra index returned an invalid position directory.");
  }
  const positions = payload.positions.filter((position) => position.kind === "VE_MON" && position.owner)
    .map((position) => ({ ...position, owner: position.owner! }));
  const validators = payload.networkValidators.flatMap((validator): HolderValidator[] => {
    if (!validator.id || !validator.tokenId || !validator.owner || !validator.operator || !validator.vault) return [];
    return [{
      id: validator.id,
      tokenId: validator.tokenId,
      owner: validator.owner,
      operator: validator.operator,
      validatorId: validator.validatorId ?? null,
      vault: validator.vault,
      gauge: validator.gauge ?? zeroAddress,
      bribe: validator.bribe ?? zeroAddress,
    }];
  });
  return { positions, validators };
}

export async function fetchWalletActivity(wallet: Address): Promise<WalletActivity[]> {
  const payload = await fetchIndexerData(wallet);
  if (!Array.isArray(payload.activities)) throw new Error("The Quevra index returned invalid activity data.");
  return payload.activities.map((activity) => ({
    id: activity.id,
    tokenId: activity.tokenId ?? "—",
    label: activity.kind.replaceAll("_", " ").toLowerCase(),
    blockNumber: activity.blockNumber,
    transactionHash: activity.transactionHash,
    logIndex: activity.logIndex,
  }));
}

const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
