import { BatchForm } from "@/components/batch-form";

export default async function BatchPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  return <BatchForm templateId={templateId} />;
}
