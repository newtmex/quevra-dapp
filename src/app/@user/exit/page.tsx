import ExitPage from "../components/ExitPage";

export default async function ExitRoute({
  searchParams,
}: {
  searchParams: Promise<{ tokenId?: string | string[] }>;
}) {
  const params = await searchParams;
  const tokenId = Array.isArray(params.tokenId) ? params.tokenId[0] : params.tokenId;
  return <ExitPage initialTokenId={tokenId && /^[1-9]\d*$/.test(tokenId) ? tokenId : undefined} />;
}
