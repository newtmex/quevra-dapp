import RewardsPage from "../components/RewardsPage";

export default async function RewardsRoute({
  searchParams,
}: {
  searchParams: Promise<{ tokenId?: string | string[] }>;
}) {
  const params = await searchParams;
  const tokenId = Array.isArray(params.tokenId) ? params.tokenId[0] : params.tokenId;
  return <RewardsPage initialTokenId={tokenId && /^[1-9]\d*$/.test(tokenId) ? tokenId : undefined} />;
}
