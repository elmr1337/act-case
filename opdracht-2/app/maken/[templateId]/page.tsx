import { AppShell } from "@/components/app-shell";
import { AssetForm } from "@/components/asset-form";

export default async function CreatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;

  return (
    <AppShell step="fill">
      <AssetForm templateId={templateId} />
    </AppShell>
  );
}
