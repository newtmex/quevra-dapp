import { contractsByChainId, deploymentMetadataByChainId } from "./registry";
import type { GenericContract } from "./types";

type Registry = typeof contractsByChainId;
export type RegistryChainId = keyof Registry extends infer TKey
  ? TKey extends `${infer TChainId extends number}` ? TChainId : never
  : never;
type RegistryKey<TChainId extends RegistryChainId> = `${TChainId}`;
export type RegistryContracts<TChainId extends RegistryChainId = RegistryChainId> = Registry[RegistryKey<TChainId>];
export type RegistryContractName<TChainId extends RegistryChainId = RegistryChainId> =
  keyof RegistryContracts<TChainId> & string;
export type RegistryContract<TName extends RegistryContractName = RegistryContractName> =
  { [TChainId in RegistryChainId]: RegistryContracts<TChainId>[TName & keyof RegistryContracts<TChainId>] }[RegistryChainId] & GenericContract;

export function getContractsByChainId<TChainId extends RegistryChainId>(chainId: TChainId) {
  return contractsByChainId[`${chainId}` as keyof typeof contractsByChainId];
}

export function getContractConfig<TName extends RegistryContractName>(
  chainId: number,
  name: TName,
): RegistryContract<TName> | null {
  const chainContracts = (contractsByChainId as unknown as Record<number, Record<string, GenericContract>>)[chainId];
  const contract = chainContracts?.[name];
  return contract ? (contract as RegistryContract<TName>) : null;
}

export function getContractAddress(chainId: number, name: RegistryContractName) {
  return getContractConfig(chainId, name)?.address ?? null;
}

export function getContractAbi<TName extends RegistryContractName>(chainId: number, name: TName) {
  return getContractConfig(chainId, name)?.abi ?? null;
}

export function getDeploymentMetadata(chainId: number) {
  return deploymentMetadataByChainId[String(chainId) as keyof typeof deploymentMetadataByChainId] ?? null;
}
