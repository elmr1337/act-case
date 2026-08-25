import { AssetForm } from "@/components/asset-form";

export default async function CreatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  return <AssetForm templateId={templateId} />;
}
