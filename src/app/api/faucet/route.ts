import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadSolonet } from "@/lib/web3";

export const runtime = "nodejs";

const DEFAULT_FAUCET_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const DEFAULT_AMOUNT_MON = "1000";
const COOLDOWN_MS = 15_000;

const lastFundedAt = new Map<string, number>();

function faucetAllowed() {
  if (process.env.FAUCET_ENABLED === "false" || process.env.FAUCET_ENABLED === "0") return false;
  if (process.env.FAUCET_ENABLED === "true" || process.env.FAUCET_ENABLED === "1") return true;
  return Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "10143") === monadSolonet.id;
}

function serverRpcUrl() {
  return process.env.SOLONET_RPC
    || process.env.FAUCET_RPC_URL
    || "http://127.0.0.1:48080";
}

function faucetPrivateKey(): Hex {
  const raw = process.env.FAUCET_PRIVATE_KEY || DEFAULT_FAUCET_KEY;
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

function faucetAmountWei() {
  const amount = process.env.FAUCET_AMOUNT_MON || DEFAULT_AMOUNT_MON;
  return parseEther(amount);
}

export async function POST(request: Request) {
  if (!faucetAllowed()) {
    return NextResponse.json(
      { error: "Faucet is only available for local Solonet development." },
      { status: 403 },
    );
  }

  let body: { address?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body with address." }, { status: 400 });
  }

  const address = body.address;
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Valid recipient address required." }, { status: 400 });
  }

  const normalized = address.toLowerCase();
  const now = Date.now();
  const previous = lastFundedAt.get(normalized) ?? 0;
  if (now - previous < COOLDOWN_MS) {
    return NextResponse.json(
      { error: `Faucet cooldown: retry in ${Math.ceil((COOLDOWN_MS - (now - previous)) / 1000)}s.` },
      { status: 429 },
    );
  }

  try {
    const account = privateKeyToAccount(faucetPrivateKey());
    const rpc = serverRpcUrl();
    const chain = {
      ...monadSolonet,
      rpcUrls: { default: { http: [rpc] } },
    };
    const wallet = createWalletClient({
      account,
      chain,
      transport: http(rpc),
    });
    const publicClient = createPublicClient({
      chain,
      transport: http(rpc),
    });

    const hash = await wallet.sendTransaction({
      to: address as Address,
      value: faucetAmountWei(),
    });
    await publicClient.waitForTransactionReceipt({ hash });

    lastFundedAt.set(normalized, now);
    return NextResponse.json({
      ok: true,
      hash,
      amountMon: process.env.FAUCET_AMOUNT_MON || DEFAULT_AMOUNT_MON,
      from: account.address,
      to: address,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Faucet transfer failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    enabled: faucetAllowed(),
    amountMon: process.env.FAUCET_AMOUNT_MON || DEFAULT_AMOUNT_MON,
    chainId: monadSolonet.id,
  });
}
