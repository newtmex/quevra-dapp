const query = `
  query QuevraWalletActivity($wallet: String!) {
    Activity(
      where: { wallet: { _eq: $wallet } }
      order_by: { blockNumber: desc, logIndex: desc }
      limit: 25
    ) {
      id
      wallet
      tokenId
      kind
      amount
      relatedAddress
      blockNumber
      logIndex
      timestamp
      transactionHash
      success
    }
    Position(where: { owner: { _eq: $wallet } }, limit: 100) {
      id
      tokenId
      owner
      kind
      amount
      unlockEpoch
      permanent
    }
    Validator(where: { owner: { _eq: $wallet } }, limit: 100) {
      id
      tokenId
      owner
      vault
      gauge
      bribe
    }
    NetworkValidator: Validator(limit: 100) {
      id
      tokenId
      owner
      operator
      validatorId
      vault
      gauge
      bribe
    }
    _meta {
      chainId
      progressBlock
      isReady
    }
  }
`;

type EnvioResponse = {
  data?: {
    Activity?: unknown[];
    Position?: unknown[];
    Validator?: unknown[];
    NetworkValidator?: unknown[];
    _meta?: { chainId: number; progressBlock: number; isReady: boolean };
  };
  errors?: Array<{ message?: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet")?.toLowerCase();
  if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
    return Response.json({ error: "A valid wallet address is required." }, { status: 400 });
  }

  const solonet = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "10143") === 20143;
  const endpoint = solonet
    ? process.env.ENVIO_SOLONET_GRAPHQL_ENDPOINT
      || process.env.ENVIO_GRAPHQL_ENDPOINT
      || "http://127.0.0.1:8080/v1/graphql"
    : process.env.ENVIO_GRAPHQL_ENDPOINT;
  if (!endpoint) {
    return Response.json({ error: "Configure ENVIO_GRAPHQL_ENDPOINT for the selected chain." }, { status: 503 });
  }

  const headers = new Headers({ "content-type": "application/json" });
  const adminSecret = process.env.ENVIO_GRAPHQL_ADMIN_SECRET
    ?? (endpoint.startsWith("http://127.0.0.1") || endpoint.startsWith("http://localhost") ? "testing" : undefined);
  if (adminSecret) headers.set("x-hasura-admin-secret", adminSecret);
  if (process.env.ENVIO_GRAPHQL_AUTH_TOKEN) {
    headers.set("authorization", `Bearer ${process.env.ENVIO_GRAPHQL_AUTH_TOKEN}`);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables: { wallet } }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json() as EnvioResponse;
    if (!response.ok || payload.errors?.length || !payload.data) {
      return Response.json({ error: "The Quevra activity index is unavailable." }, { status: 502 });
    }

    return Response.json({
      activities: payload.data.Activity ?? [],
      positions: payload.data.Position ?? [],
      validators: payload.data.Validator ?? [],
      networkValidators: payload.data.NetworkValidator ?? [],
      indexing: payload.data._meta ?? null,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not reach the Quevra activity index." }, { status: 503 });
  }
}
