import StakePage from "../components/StakePage";

export default async function StakeRoute({
  searchParams,
}: {
  searchParams: Promise<{ tokenId?: string | string[] }>;
}) {
  const params = await searchParams;
  const tokenId = Array.isArray(params.tokenId) ? params.tokenId[0] : params.tokenId;
  return <StakePage initialTokenId={tokenId && /^[1-9]\d*$/.test(tokenId) ? tokenId : undefined} />;
}
