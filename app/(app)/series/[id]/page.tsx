import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

interface SeriesPageProps {
  params: Promise<{ id: string }>;
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { id } = await params;

  return (
    <PlaceholderPage
      title="Shorts"
      description={`Series ${id} — episodes, scenes, and takes.`}
    />
  );
}
