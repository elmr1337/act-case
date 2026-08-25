import { AssetStatusPage } from "@/components/asset-status";

/**
 * De asset-id staat in de URL: verversen, delen en terugkomen werken allemaal.
 */
export default async function AssetPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return <AssetStatusPage assetId={assetId} />;
}
