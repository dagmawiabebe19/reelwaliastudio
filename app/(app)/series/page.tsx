import { PageHeader } from "@/components/ui/PageHeader";
import { SeriesIndexList } from "@/components/series/SeriesIndexList";
import { listAllSeries } from "@/lib/db/series";

export default async function SeriesIndexPage() {
  const series = await listAllSeries();

  return (
    <section>
      <PageHeader
        title="Shorts"
        description="All serialized series — vertical 9:16 and landscape 16:9."
      />
      <SeriesIndexList series={series} />
    </section>
  );
}
