import { bls12_381 } from "@noble/curves/bls12-381";
import { secp256k1 } from "@noble/curves/secp256k1";
import { blake3 } from "@noble/hashes/blake3";
import type { Address, Hex } from "viem";

export const VALIDATOR_REQUEST_SCHEMA = "quevra.validator-signing-request";
export const VALIDATOR_ARTIFACT_SCHEMA = "quevra.validator-registration";
const BLS_POP_DST = "BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_";
const BLS_ORDER = bls12_381.params.r;

export type ValidatorSigningRequest = {
  schema: typeof VALIDATOR_REQUEST_SCHEMA;
  version: 1;
  chainId: number;
  operator: Address;
  saltSeed: Hex;
  authAddress: Address;
  amount: string;
  commission: string;
};

export type ValidatorRegistrationArtifact = Omit<ValidatorSigningRequest, "schema"> & {
  schema: typeof VALIDATOR_ARTIFACT_SCHEMA;
  secpPubkey: Hex;
  blsPubkey: Hex;
  payload: Hex;
  signedSecpMessage: Hex;
  signedBlsMessage: Hex;
};

export type ValidatedRegistrationArtifact = Omit<ValidatorRegistrationArtifact, "schema"> & { schema: typeof VALIDATOR_ARTIFACT_SCHEMA };

function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function hexToBytes(value: string, label: string, byteLength?: number): Uint8Array {
  const hex = value.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0 || (byteLength !== undefined && hex.length !== byteLength * 2)) {
    throw new Error(`${label} must be${byteLength ? ` exactly ${byteLength} bytes of` : " valid"} hex data.`);
  }
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function uint256(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} must be a decimal uint256 string.`);
  const number = BigInt(value);
  if (number >= BigInt(1) << BigInt(256)) throw new Error(`${label} does not fit in 32 bytes.`);
  return number;
}

function fixedHex(value: unknown, bytes: number, label: string): Hex {
  if (typeof value !== "string") throw new Error(`${label} is missing.`);
  return bytesToHex(hexToBytes(value, label, bytes));
}

export function createValidatorSigningRequest(input: Omit<ValidatorSigningRequest, "schema" | "version">): ValidatorSigningRequest {
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) throw new Error("chainId must be a positive safe integer.");
  return {
    schema: VALIDATOR_REQUEST_SCHEMA,
    version: 1,
    chainId: input.chainId,
    operator: fixedHex(input.operator, 20, "Operator address") as Address,
    saltSeed: fixedHex(input.saltSeed, 32, "Salt seed"),
    authAddress: fixedHex(input.authAddress, 20, "Auth address") as Address,
    amount: uint256(input.amount, "Amount").toString(),
    commission: uint256(input.commission, "Commission").toString(),
  };
}

export function constructValidatorPayload(input: Pick<ValidatorRegistrationArtifact, "secpPubkey" | "blsPubkey" | "authAddress" | "amount" | "commission">): Hex {
  const parts = [
    hexToBytes(input.secpPubkey, "SECP256K1 public key", 33),
    hexToBytes(input.blsPubkey, "BLS public key", 48),
    hexToBytes(input.authAddress, "Auth address", 20),
    hexToBytes(uint256(input.amount, "Amount").toString(16).padStart(64, "0"), "Amount", 32),
    hexToBytes(uint256(input.commission, "Commission").toString(16).padStart(64, "0"), "Commission", 32),
  ];
  return bytesToHex(Uint8Array.from(parts.flatMap((part) => Array.from(part))));
}

export function validateRegistrationArtifact(value: unknown, expected: ValidatorSigningRequest): ValidatorRegistrationArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Registration artifact must be a JSON object.");
  const artifact = value as Record<string, unknown>;
  if (artifact.schema !== VALIDATOR_ARTIFACT_SCHEMA || artifact.version !== 1) throw new Error("Unsupported registration artifact schema or version.");
  const allowed = new Set(["schema", "version", "chainId", "operator", "saltSeed", "authAddress", "amount", "commission", "secpPubkey", "blsPubkey", "payload", "signedSecpMessage", "signedBlsMessage"]);
  if (Object.keys(artifact).some((key) => !allowed.has(key))) throw new Error("Registration artifact contains unsupported fields. Never import private keys.");
  const normalized = createValidatorSigningRequest({
    chainId: artifact.chainId as number,
    operator: artifact.operator as Address,
    saltSeed: artifact.saltSeed as Hex,
    authAddress: artifact.authAddress as Address,
    amount: artifact.amount as string,
    commission: artifact.commission as string,
  });
  if (normalized.chainId !== expected.chainId) throw new Error("This artifact was signed for a different Monad network.");
  for (const field of ["operator", "saltSeed", "authAddress", "amount", "commission"] as const) {
    if (normalized[field].toLowerCase() !== expected[field].toLowerCase()) throw new Error(`The signed ${field} differs from the current Quevra registration parameters. Generate and sign a fresh request.`);
  }
  const secpPubkey = fixedHex(artifact.secpPubkey, 33, "SECP256K1 public key");
  const blsPubkey = fixedHex(artifact.blsPubkey, 48, "BLS public key");
  const payload = fixedHex(artifact.payload, 165, "Registration payload");
  const signedSecpMessage = fixedHex(artifact.signedSecpMessage, 64, "SECP256K1 signature");
  const signedBlsMessage = fixedHex(artifact.signedBlsMessage, 96, "BLS signature");
  const rebuilt = constructValidatorPayload({ secpPubkey, blsPubkey, ...normalized });
  if (rebuilt.toLowerCase() !== payload.toLowerCase()) throw new Error("The payload does not match the public keys and registration parameters.");
  const bytes = hexToBytes(payload, "Registration payload", 165);
  let secpValid = false;
  let blsValid = false;
  try {
    secpValid = secp256k1.verify(hexToBytes(signedSecpMessage, "SECP256K1 signature", 64), blake3(bytes), hexToBytes(secpPubkey, "SECP256K1 public key", 33), { lowS: true });
  } catch { /* malformed point or signature is an invalid artifact */ }
  try {
    const blsMessage = bls12_381.longSignatures.hash(bytes, BLS_POP_DST);
    blsValid = bls12_381.longSignatures.verify(hexToBytes(signedBlsMessage, "BLS signature", 96), blsMessage, hexToBytes(blsPubkey, "BLS public key", 48));
  } catch { /* malformed point or signature is an invalid artifact */ }
  if (!secpValid) throw new Error("The SECP256K1 signature is invalid.");
  if (!blsValid) throw new Error("The BLS signature is invalid.");
  return { ...normalized, schema: VALIDATOR_ARTIFACT_SCHEMA, secpPubkey, blsPubkey, payload, signedSecpMessage, signedBlsMessage };
}

export function validatorRegistrationArgs(artifact: ValidatorRegistrationArtifact): [Hex, Address, Hex, Hex, Hex] {
  return [artifact.saltSeed, artifact.authAddress, artifact.payload, artifact.signedSecpMessage, artifact.signedBlsMessage];
}

export function validatorRegistrationCall(artifact: ValidatorRegistrationArtifact) {
  return { functionName: "createValidator" as const, args: validatorRegistrationArgs(artifact) };
}

export async function submitValidatedRegistration(
  artifact: ValidatorRegistrationArtifact,
  currentRequest: ValidatorSigningRequest,
  submit: () => Promise<void>,
): Promise<void> {
  validateRegistrationArtifact(artifact, currentRequest);
  await submit();
}
